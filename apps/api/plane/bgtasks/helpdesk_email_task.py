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

# Module imports
from plane.db.models.helpdesk import HelpdeskRequestComment, HelpdeskRequest
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception
from plane.app.helpdesk.sse_broker import publish

logger = logging.getLogger("plane.worker")

@shared_task
def send_helpdesk_comment_email(comment_id):
    try:
        comment = HelpdeskRequestComment.objects.select_related(
            "request", "request__portal", "request__customer", "request__portal__workspace", "actor"
        ).get(id=comment_id)
        
        request = comment.request
        portal = request.portal

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
        # We don't store a Message-ID for the request itself yet, but we can fake one based on its UUID
        host = getattr(settings, "WEB_URL", "plane.so").replace("https://", "").replace("http://", "")
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

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=[recipient_email],
            connection=connection,
            headers=headers,
        )
        msg.attach_alternative(html_content, "text/html")
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
