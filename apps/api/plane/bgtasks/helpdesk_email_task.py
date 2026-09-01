# Python imports
import logging
from datetime import datetime, timezone
import uuid

# Third party imports
from celery import shared_task

# Django imports
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.conf import settings
from django.utils.html import escape

# Module imports
from plane.db.models.helpdesk import HelpdeskRequestComment, HelpdeskRequest
from plane.license.utils.instance_value import get_email_configuration
from plane.settings.storage import S3Storage
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception
from plane.app.helpdesk.attachments import COMMENT_ENTITY, assets_for
from plane.app.helpdesk.sse_broker import publish

logger = logging.getLogger("plane.worker")


def _collect_attachments(comment):
    """Read a comment's attachments out of storage for the outgoing email.

    Returns ``(attachments, omitted_count)`` where each attachment is the
    ``(filename, content, mimetype)`` triple ``EmailMessage.attach`` expects.

    Every file is fetched inside its own try/except, and a failure only skips
    that file. Letting a storage error escape would hit the task's generic
    except, mark the whole comment FAILED and cost the customer the message
    body as well -- a far worse outcome than one missing attachment.
    """
    assets = assets_for(COMMENT_ENTITY, [comment.id]).get(str(comment.id), [])
    if not assets:
        return [], 0

    # No request object in a worker: S3Storage would otherwise hand back the
    # browser-facing MinIO endpoint, which is not resolvable from here.
    storage = S3Storage()
    attachments = []
    omitted = 0
    total_size = 0

    for asset in assets:
        attributes = asset.attributes or {}
        size = attributes.get("size") or asset.size or 0
        if total_size + size > settings.HELPDESK_OUTBOUND_ATTACHMENT_MAX_TOTAL_SIZE:
            omitted += 1
            continue

        try:
            content = storage.read_object(asset.asset.name)
        except Exception as e:
            log_exception(e)
            content = None

        if content is None:
            omitted += 1
            continue

        attachments.append(
            (
                attributes.get("name") or "attachment",
                content,
                attributes.get("type") or "application/octet-stream",
            )
        )
        total_size += size

    return attachments, omitted


def normalize_tls_ssl(use_tls, use_ssl, port):
    """Ensure TLS and SSL are never both enabled.

    Django's SMTP backend raises ValueError when both are set, which the task's
    generic except turns into email_status=FAILED -- every message of that
    portal fails, and the admin sees only the raw exception text.

    The port is parsed with int() on purpose: when the portal has no smtp_host
    the values come from the instance configuration, where EMAIL_PORT is a
    *string*. A plain ``port == 465`` test would silently never match.
    """
    if not (use_tls == "1" and use_ssl == "1"):
        return use_tls, use_ssl

    try:
        resolved_port = int(port)
    except (ValueError, TypeError):
        resolved_port = 587

    if resolved_port == 465:
        # 465 is implicit SSL
        logger.warning(
            "Both TLS and SSL were enabled; using SSL for port %s", resolved_port
        )
        return "0", "1"

    logger.warning("Both TLS and SSL were enabled; using TLS for port %s", resolved_port)
    return "1", "0"


@shared_task
def send_helpdesk_comment_email(comment_id):
    try:
        comment = HelpdeskRequestComment.objects.select_related(
            "request", "request__portal", "request__customer", "request__portal__workspace", "actor"
        ).get(id=comment_id)
        
        request = comment.request
        portal = request.portal

        # An internal note must never leave the workspace. This guard is the
        # last line of defence and covers any caller -- including a manual
        # re-enqueue -- not just the ViewSet path.
        if comment.is_internal:
            comment.email_status = HelpdeskRequestComment.EmailDeliveryStatus.NOT_SENT
            comment.email_error = "Internal note is not delivered by email."
            comment.save(update_fields=["email_status", "email_error"])
            publish(portal.workspace.slug, {"type": "comment.updated", "request_id": str(request.id)})
            logger.warning(f"Skipped email for internal helpdesk comment {comment.id}")
            return

        # Find recipient
        recipient_email = request.contact_email
        if not recipient_email and request.customer:
            recipient_email = request.customer.email
            
        if not recipient_email:
            logger.warning(f"No recipient email found for HelpdeskRequest {request.id}")
            comment.email_status = HelpdeskRequestComment.EmailDeliveryStatus.FAILED
            comment.email_error = "No recipient email found."
            comment.save(update_fields=["email_status", "email_error"])
            publish(portal.workspace.slug, {"type": "comment.updated", "request_id": str(request.id)})
            return

        # Prepare email content
        # We can just send the plain text or render an HTML template
        # Since we don't have a specific html template, we'll render a simple HTML response
        subject = f"Re: {request.title}"
        text_content = comment.content
        html_content = f"<p>{comment.content.replace(chr(10), '<br>')}</p>"

        # Threading logic
        # We use a base Message-ID derived from the request.id for threading
        raw_web_url = getattr(settings, "WEB_URL", None) or "plane.so"
        host = str(raw_web_url).replace("https://", "").replace("http://", "")
        if ":" in host:
            host = host.split(":")[0]
            
        request_msg_id = f"<{request.id}@{host}>"
        
        # Generate a unique Message-ID for this comment
        comment_msg_id = f"<{uuid.uuid4()}@{host}>"
        
        (
            EMAIL_HOST,
            EMAIL_HOST_USER,
            EMAIL_HOST_PASSWORD,
            EMAIL_PORT,
            EMAIL_USE_TLS,
            EMAIL_USE_SSL,
            EMAIL_FROM,
        ) = get_email_configuration()

        # Determine FROM address
        from_email = EMAIL_FROM
        if portal.no_reply_email_address:
            from_email = portal.no_reply_email_address
        elif portal.default_agent_email_address:
            from_email = portal.default_agent_email_address
            
        if portal.smtp_host:
            EMAIL_HOST = portal.smtp_host
            EMAIL_PORT = portal.smtp_port or 587
            EMAIL_HOST_USER = portal.smtp_username or ""
            EMAIL_HOST_PASSWORD = portal.smtp_password or ""
            EMAIL_USE_TLS = "1" if portal.smtp_use_tls else "0"
            EMAIL_USE_SSL = "1" if portal.smtp_use_ssl else "0"

        # Positioned after the portal override on purpose: when the portal has
        # no smtp_host the values come from the instance configuration, which
        # escapes both the serializer validation and the portal CheckConstraint.
        EMAIL_USE_TLS, EMAIL_USE_SSL = normalize_tls_ssl(
            EMAIL_USE_TLS, EMAIL_USE_SSL, EMAIL_PORT
        )

        connection = get_connection(
            host=EMAIL_HOST,
            port=int(EMAIL_PORT),
            username=EMAIL_HOST_USER,
            password=EMAIL_HOST_PASSWORD,
            use_tls=EMAIL_USE_TLS == "1",
            use_ssl=EMAIL_USE_SSL == "1",
        )

        headers = {
            "Message-ID": comment_msg_id,
            "In-Reply-To": request_msg_id,
            "References": request_msg_id
        }

        # Look for the last sent email in the thread to append to references
        last_comment = HelpdeskRequestComment.objects.filter(
            request=request, 
            email_status=HelpdeskRequestComment.EmailDeliveryStatus.SENT,
            email_message_id__isnull=False
        ).exclude(id=comment.id).order_by("-created_at").first()
        
        if last_comment and last_comment.email_message_id:
            headers["In-Reply-To"] = last_comment.email_message_id
            headers["References"] = f"{request_msg_id} {last_comment.email_message_id}"

        attachments, omitted = _collect_attachments(comment)
        if omitted:
            notice = (
                f"\n\n[{omitted} anexo(s) não puderam ser enviados por email. "
                "Acesse o portal para baixá-los.]"
            )
            text_content = f"{text_content}{notice}"
            html_content = f"{html_content}<p><em>{escape(notice.strip())}</em></p>"

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=[recipient_email],
            connection=connection,
            headers=headers,
        )
        msg.attach_alternative(html_content, "text/html")
        for filename, content, mimetype in attachments:
            msg.attach(filename, content, mimetype)
        msg.send()
        
        # Mark as sent
        comment.email_status = HelpdeskRequestComment.EmailDeliveryStatus.SENT
        comment.email_sent_at = datetime.now(timezone.utc)
        comment.email_message_id = comment_msg_id
        comment.save(update_fields=["email_status", "email_sent_at", "email_message_id"])
        
        # Publish SSE event
        publish(portal.workspace.slug, {"type": "comment.updated", "request_id": str(request.id)})
        
        logger.info(f"Helpdesk comment {comment.id} email sent successfully to {recipient_email}")

    except Exception as e:
        log_exception(e)
        try:
            comment = HelpdeskRequestComment.objects.select_related("request__portal__workspace").get(id=comment_id)
            comment.email_status = HelpdeskRequestComment.EmailDeliveryStatus.FAILED
            comment.email_error = str(e)
            comment.save(update_fields=["email_status", "email_error"])
            publish(comment.request.portal.workspace.slug, {"type": "comment.updated", "request_id": str(comment.request.id)})
        except Exception:
            pass
