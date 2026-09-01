import hashlib
import re
import logging
from typing import Optional, List, Dict, Any

from django.conf import settings
from django.db import IntegrityError

from plane.db.models import HelpdeskRequestComment, HelpdeskMember, HelpdeskRequest
from plane.app.helpdesk.attachments import (
    attachments_fingerprint,
    store_inbound_attachment,
    synthesize_content,
    bind_assets,
    COMMENT_ENTITY,
)
from plane.app.helpdesk.sender_authenticity import (
    PASS,
    verify_sender_authenticity,
)
from plane.app.helpdesk.sse_broker import publish
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")

class DiscardEmailException(Exception):
    def __init__(self, detail: str, log_context: dict = None):
        self.detail = detail
        self.log_context = log_context or {}
        super().__init__(detail)


def extract_header(headers_str: str, header_name: str) -> Optional[str]:
    pattern = re.compile(rf"^{header_name}:\s*(.*?)$", re.IGNORECASE | re.MULTILINE)
    match = pattern.search(headers_str)
    if match:
        val = match.group(1).strip()
        if val.startswith("<") and val.endswith(">"):
            return val
        return val
    return None


def build_synthetic_message_id(hd_request, from_email: str, date_header: Optional[str], body_key: str) -> str:
    parts = [str(hd_request.id), from_email]
    if date_header:
        parts.append(date_header)
    parts.append(body_key)
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return f"<{digest}@synthetic.inbound>"


def extract_email_address(from_str: str) -> str:
    match = re.search(r"<([^>]+)>", from_str)
    if match:
        return match.group(1).strip().lower()
    return from_str.strip().lower()


def process_inbound_email(
    from_str: str,
    headers_str: str,
    text_body: str,
    html_body: str,
    uploaded_files: list,
    dkim_field: str = None,
    spf_field: str = None,
):
    if not from_str:
        raise DiscardEmailException("missing_sender")

    from_email = extract_email_address(from_str)

    sender_verification = verify_sender_authenticity(
        from_email=from_email,
        dkim_field=dkim_field,
        spf_field=spf_field,
        headers_str=headers_str,
        authserv_id=getattr(settings, "HELPDESK_INBOUND_AUTHSERV_ID", ""),
    )

    in_reply_to = extract_header(headers_str, "In-Reply-To")
    references = extract_header(headers_str, "References")
    message_id = extract_header(headers_str, "Message-ID")
    date_header = extract_header(headers_str, "Date")

    if not message_id:
        message_id = None

    if not text_body and html_body:
        text_body = generate_plain_text_from_html(html_body)

    if not text_body and not uploaded_files:
        raise DiscardEmailException("empty_body")

    parent_comment = None
    if in_reply_to:
        ids = re.findall(r"<[^>]+>", in_reply_to)
        if not ids:
            ids = [in_reply_to]
        for msg_id in ids:
            parent_comment = HelpdeskRequestComment.objects.filter(email_message_id=msg_id).first()
            if parent_comment:
                break
                
    if not parent_comment and references:
        ids = re.findall(r"<[^>]+>", references)
        for msg_id in reversed(ids):
            parent_comment = HelpdeskRequestComment.objects.filter(email_message_id=msg_id).first()
            if parent_comment:
                break

    hd_request = None
    if parent_comment:
        hd_request = parent_comment.request
    else:
        all_ids = []
        if in_reply_to:
            all_ids.extend(re.findall(r"<[^>]+>", in_reply_to))
        if references:
            all_ids.extend(re.findall(r"<[^>]+>", references))
        for msg_id in all_ids:
            match = re.search(r"<([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})@", msg_id, re.IGNORECASE)
            if match:
                request_id = match.group(1)
                hd_request = HelpdeskRequest.objects.filter(id=request_id).first()
                if hd_request:
                    break

    if not hd_request:
        raise DiscardEmailException("thread_not_found", {"in_reply_to": in_reply_to})
    
    is_authorized = False
    is_internal = False
    is_agent_branch = False
    actor = None
    customer = None

    if hd_request.contact_email and hd_request.contact_email.lower() == from_email:
        is_authorized = True
        customer = hd_request.customer
    elif hd_request.customer and hd_request.customer.email.lower() == from_email:
        is_authorized = True
        customer = hd_request.customer
        
    if not is_authorized:
        member = HelpdeskMember.objects.filter(
            workspace_id=hd_request.workspace_id,
            member__email__iexact=from_email,
            is_active=True
        ).select_related("member").first()
        
        if member:
            is_authorized = True
            is_agent_branch = True
            if sender_verification == PASS:
                actor = member.member
            is_internal = False

    if not is_authorized:
        raise DiscardEmailException("unauthorized_sender", {"from_email": from_email, "hd_request_id": str(hd_request.id)})

    if is_agent_branch and sender_verification != PASS:
        uploaded_files = []
        if not text_body:
            raise DiscardEmailException(
                "unverified_agent_attachments_only",
                {
                    "from_email": from_email,
                    "hd_request_id": str(hd_request.id),
                    "sender_verification": sender_verification,
                }
            )

    if message_id is None:
        body_key = text_body.strip()
        if not body_key and uploaded_files:
            body_key = attachments_fingerprint(
                [(getattr(f, "name", ""), getattr(f, "size", 0)) for f in uploaded_files]
            )
        message_id = build_synthetic_message_id(
            hd_request, from_email, date_header, body_key
        )

    if HelpdeskRequestComment.objects.filter(email_message_id=message_id).exists():
        raise DiscardEmailException("duplicate", {"email_message_id": message_id, "hd_request_id": str(hd_request.id)})

    stored_assets = []
    for uploaded_file in uploaded_files:
        asset = store_inbound_attachment(uploaded_file, workspace_id=hd_request.workspace_id)
        if asset:
            stored_assets.append(asset)

    content = text_body or synthesize_content(len(stored_assets))

    try:
        new_comment = HelpdeskRequestComment.objects.create(
            workspace_id=hd_request.workspace_id,
            request=hd_request,
            actor=actor,
            customer=customer,
            content=content,
            is_internal=is_internal,
            delivery_channels=["email"],
            email_status=HelpdeskRequestComment.EmailDeliveryStatus.SENT,
            email_message_id=message_id,
            sender_verification=sender_verification,
        )
    except IntegrityError:
        raise DiscardEmailException("duplicate", {"email_message_id": message_id, "hd_request_id": str(hd_request.id)})

    if stored_assets:
        bind_assets(
            [asset.id for asset in stored_assets],
            workspace_id=hd_request.workspace_id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=new_comment.id,
        )

    # Mirrors the same check in the agent-facing comment viewset -- an email
    # reply is a real first response and must count toward the SLA exactly
    # like one typed in the app, or every agent who works from their inbox
    # would show as never having responded.
    if hd_request.first_responded_at is None and new_comment.actor is not None:
        HelpdeskRequest.objects.filter(id=hd_request.id).update(first_responded_at=new_comment.created_at)

    try:
        if actor is None and customer is None:
            pass
        elif hd_request.status and (hd_request.status.group == "closed" or hd_request.status.group == "resolved"):
            open_status = hd_request.portal.statuses.filter(group="open").first()
            if open_status:
                hd_request.status = open_status
                hd_request.resolved_at = None
                hd_request.archived_at = None
                hd_request.save(update_fields=["status", "resolved_at", "archived_at"])
    except Exception as e:
        log_exception(e)
        logger.error(f"Failed to reopen request {hd_request.id} for comment {new_comment.id}")

    try:
        publish(
            hd_request.workspace.slug, 
            {"type": "comment.created", "request_id": str(hd_request.id)}
        )
    except Exception as e:
        log_exception(e)

    return new_comment
