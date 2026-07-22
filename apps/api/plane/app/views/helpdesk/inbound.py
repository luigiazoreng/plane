# Python imports
import hashlib
import re
import logging
from typing import Optional

# Django imports
from django.conf import settings
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

# Module imports
from plane.db.models import HelpdeskRequestComment, HelpdeskMember, HelpdeskPortal
from plane.app.helpdesk.attachments import (
    COMMENT_ENTITY,
    attachments_fingerprint,
    bind_assets,
    store_inbound_attachment,
    synthesize_content,
)
from plane.app.helpdesk.inbound_security import verify_inbound_secret
from plane.app.helpdesk.sender_authenticity import (
    PASS,
    verify_sender_authenticity,
)
from plane.throttles.helpdesk import HelpdeskInboundThrottle
from plane.app.helpdesk.sse_broker import publish
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")

class PublicHelpdeskInboundEmailEndpoint(APIView):
    """
    Receives an inbound email payload from SendGrid (or similar).
    Parses the multipart/form-data to extract the email, finds the associated 
    HelpdeskRequestComment using the In-Reply-To header, and creates a new comment.
    """
    permission_classes = [AllowAny]
    # Overrides the global anon rate of 30/minute, which is far below the
    # legitimate burst rate of an inbound email provider.
    throttle_classes = [HelpdeskInboundThrottle]

    def _extract_header(self, headers_str: str, header_name: str) -> Optional[str]:
        # SendGrid sends headers as a raw string: "Header-Name: Value\nAnother-Header: Value"
        # We need to gracefully parse it, ignoring case for the header name
        pattern = re.compile(rf"^{header_name}:\s*(.*?)$", re.IGNORECASE | re.MULTILINE)
        match = pattern.search(headers_str)
        if match:
            # Clean up the value, removing potential surrounding angle brackets for Message-IDs
            val = match.group(1).strip()
            if val.startswith("<") and val.endswith(">"):
                return val
            # Some clients might send space separated list in References, or bracketed like <id1> <id2>
            return val
        return None
        
    def _discard(self, detail: str, **log_context) -> Response:
        """Acknowledge an email that will not be processed.

        Every non-2xx makes the provider retry, and none of these conditions
        improves on retry -- they are business decisions, not transient
        failures. The 500 of the generic except stays a 500 on purpose: that
        one does deserve a retry. So does the 403 of the secret check, which
        is abuse rather than a business discard.

        ``detail`` is emitted as a structured field so discards can be
        alerted on by count, compensating for the loss of 4xx in the
        provider's own metrics.
        """
        logger.warning("inbound discarded", extra={"detail": detail, **log_context})
        return Response({"success": True, "detail": detail}, status=status.HTTP_200_OK)

    def _build_synthetic_message_id(
        self, parent_comment, from_email: str, date_header: Optional[str], body_key: str
    ) -> str:
        """Derive an idempotency key for emails that carry no Message-ID.

        The ``Date`` header is what keeps this safe: a provider retry replays
        an identical payload, so the same Date yields the same key and the
        duplicate is caught. Two deliberate sends differ by at least a second,
        so repeated short replies ("ok", "thanks") are both kept instead of
        the second one being silently swallowed.
        """
        parts = [str(parent_comment.id), from_email]
        if date_header:
            parts.append(date_header)
        parts.append(body_key)
        digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
        return f"<{digest}@synthetic.inbound>"

    def _extract_email_address(self, from_str: str) -> str:
        # from_str can be "Name <email@domain.com>" or just "email@domain.com"
        match = re.search(r"<([^>]+)>", from_str)
        if match:
            return match.group(1).strip().lower()
        return from_str.strip().lower()

    def post(self, request, *args, **kwargs):
        # Prove the origin before touching the payload. Anything below this
        # line trusts fields that are fully attacker-controlled.
        if not verify_inbound_secret(request):
            return Response(
                {"error": "Invalid inbound webhook credentials."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Bound the body before parsing it. This route is exempt from
        # RequestBodySizeLimitMiddleware -- otherwise a message with attachments
        # would be buffered whole into memory and rejected at 5MB -- so the size
        # check lives here instead. Reading CONTENT_LENGTH is safe: it does not
        # touch the body, so an oversized payload is never parsed at all.
        content_length = int(request.META.get("CONTENT_LENGTH") or 0)
        if content_length > settings.HELPDESK_INBOUND_MAX_BODY_SIZE:
            # 200, not 413: the payload will be exactly as large on every
            # retry, so a retryable status just produces a redelivery loop.
            return self._discard("payload_too_large", content_length=content_length)

        try:
            # SendGrid sends the payload as multipart/form-data
            data = request.data

            headers_str = data.get("headers", "")
            from_str = data.get("from", "")
            text_body = data.get("text", "")
            html_body = data.get("html", "")
            # SendGrid numbers attachment parts attachment1..attachmentN.
            uploaded_files = list(request.FILES.values())

            if not from_str:
                return self._discard("missing_sender")

            from_email = self._extract_email_address(from_str)

            # Computed once, here, before anything with a side effect runs.
            # `from_email` is attacker-controlled -- the shared secret proves
            # the request came from our provider, not who wrote the message --
            # so this verdict is what decides, further down, whether the claim
            # in From: may be promoted to a real workspace user.
            sender_verification = verify_sender_authenticity(
                from_email=from_email,
                dkim_field=data.get("dkim"),
                spf_field=data.get("SPF"),
                headers_str=headers_str,
                authserv_id=getattr(settings, "HELPDESK_INBOUND_AUTHSERV_ID", ""),
            )

            in_reply_to = self._extract_header(headers_str, "In-Reply-To")
            references = self._extract_header(headers_str, "References")
            message_id = self._extract_header(headers_str, "Message-ID")
            date_header = self._extract_header(headers_str, "Date")

            # Normalise "" to None so an empty header never reaches the column;
            # the partial unique index excludes NULL, not the empty string.
            if not message_id:
                message_id = None

            if not text_body and html_body:
                text_body = generate_plain_text_from_html(html_body)

            # A message that carries only a screenshot is still the customer
            # telling us something. Only a genuinely empty one is dropped.
            if not text_body and not uploaded_files:
                return self._discard("empty_body")


            # Attempt to find the parent comment
            parent_comment = None
            
            if in_reply_to:
                # Can be multiple separated by space or commas sometimes, but usually a single <id>
                # Let's extract all <id> patterns to be safe
                ids = re.findall(r"<[^>]+>", in_reply_to)
                if not ids:
                    ids = [in_reply_to]
                    
                for msg_id in ids:
                    parent_comment = HelpdeskRequestComment.objects.filter(email_message_id=msg_id).first()
                    if parent_comment:
                        break
                        
            if not parent_comment and references:
                ids = re.findall(r"<[^>]+>", references)
                for msg_id in reversed(ids):  # Reverse because the latest is usually at the end
                    parent_comment = HelpdeskRequestComment.objects.filter(email_message_id=msg_id).first()
                    if parent_comment:
                        break

            if not parent_comment:
                return self._discard("thread_not_found", in_reply_to=in_reply_to)


            hd_request = parent_comment.request
            
            # Security: verify sender is authorized to comment on this ticket
            is_authorized = False
            is_internal = False
            is_agent_branch = False
            actor = None
            customer = None

            # 1. Check if it's the customer
            if hd_request.contact_email and hd_request.contact_email.lower() == from_email:
                is_authorized = True
                customer = hd_request.customer
            elif hd_request.customer and hd_request.customer.email.lower() == from_email:
                is_authorized = True
                customer = hd_request.customer
                
            # 2. Check if it's an agent in the workspace
            if not is_authorized:
                member = HelpdeskMember.objects.filter(
                    workspace_id=hd_request.workspace_id,
                    member__email__iexact=from_email,
                    is_active=True
                ).select_related("member").first()
                
                if member:
                    is_authorized = True
                    is_agent_branch = True
                    # Asymmetric on purpose. The customer is never blocked --
                    # they do not control their mail infrastructure, and
                    # demanding DKIM of them would turn a security fix into
                    # lost messages. An agent, whose word carries authority
                    # inside the ticket, is only promoted to `actor` once the
                    # From: claim is actually proven.
                    #
                    # The condition is `== PASS`, never `!= FAIL`: the latter
                    # would let `unverified` -- the state an attacker trivially
                    # produces by sending no signal at all -- grant
                    # attribution, which is exactly the hole being closed.
                    if sender_verification == PASS:
                        actor = member.member
                    # Check if the email was sent to an internal support address?
                    # For simplicity, if an agent replies via email, we default it to internal=False
                    # unless we build a parser for commands like #internal.
                    is_internal = False


            if not is_authorized:
                return self._discard(
                    "unauthorized_sender",
                    from_email=from_email,
                    hd_request_id=str(hd_request.id),
                )

            # Authorised is not the same as authentic. An unproven agent stays
            # authorised -- their text still reaches the ticket, unattributed --
            # but their files are dropped, because the real delivery vector is
            # the portal's public asset endpoint: the customer trusts the
            # *portal*, so a hostile file served from the company's own domain
            # inside their legitimate ticket keeps its value no matter how the
            # message bubble is labelled. Text under a neutral label does not.
            #
            # This runs after the authorisation branch and before the upload
            # loop below, which is the only window where both facts are known:
            # at the point the verdict is computed we do not yet know whether
            # the sender is an agent, and emptying the list there would hit the
            # customer too. Emptying it here rather than filtering afterwards
            # is what keeps the files from ever reaching the bucket, where they
            # would linger unbound until the daily sweep.
            if is_agent_branch and sender_verification != PASS:
                uploaded_files = []
                if not text_body:
                    # With nothing but files there is no comment left to make.
                    # Deliberately not the `empty_body` discard above: this
                    # detail is what makes the case alertable by count.
                    #
                    # Known and accepted gap: no comment means no row in the
                    # Email logs, so the most graphic form of the attack is
                    # invisible in the `sender_verification` column. The
                    # alternative -- a synthetic comment saying the files were
                    # dropped -- was rejected because `content` *is* in the
                    # public serializer, so it would hand the attacker, who is
                    # a participant of the ticket, the very detection oracle
                    # that keeping the field out of that serializer removes.
                    # Never read an absence of rows here as an absence of
                    # attack; the warning below is the signal that matters.
                    return self._discard(
                        "unverified_agent_attachments_only",
                        from_email=from_email,
                        hd_request_id=str(hd_request.id),
                        sender_verification=sender_verification,
                    )

            # Clean up the text body to remove previous quotes
            # A simple approach is to just use the raw text, but in reality 
            # we might want to split on common reply indicators like "On ... wrote:"
            # For this MVP, we save the full text_body. A more robust reply parser 
            # like python-email-reply-parser could be used later.
            
            # Without a Message-ID there is no idempotency key at all, so derive
            # one. body_key is taken after the HTML fallback so both branches
            # hash the same text.
            if message_id is None:
                # With no text there is nothing to hash, so two attachment-only
                # messages from the same sender in the same second would collide
                # and the second would be discarded as a duplicate. Fall back to
                # fingerprinting the files.
                body_key = text_body.strip()
                if not body_key and uploaded_files:
                    body_key = attachments_fingerprint(
                        [(getattr(f, "name", ""), getattr(f, "size", 0)) for f in uploaded_files]
                    )
                message_id = self._build_synthetic_message_id(
                    parent_comment, from_email, date_header, body_key
                )

            if HelpdeskRequestComment.objects.filter(email_message_id=message_id).exists():
                return self._discard(
                    "duplicate",
                    email_message_id=message_id,
                    hd_request_id=str(hd_request.id),
                )

            # Store the files only now that the sender is both authorised for
            # this ticket and, when they claim to be an agent, proven to be
            # one. Uploading before that would let anyone holding a valid
            # webhook secret fill the bucket through a forged sender -- and,
            # worse, publish a hostile file on the portal under an agent's
            # apparent authority. `uploaded_files` is already empty for an
            # unproven agent, so this loop simply does not run for them.
            stored_assets = []
            for uploaded_file in uploaded_files:
                asset = store_inbound_attachment(uploaded_file, workspace_id=hd_request.workspace_id)
                # None means the file was rejected or the upload failed. One bad
                # attachment must never cost the customer their whole message.
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
                    # Recorded for every inbound comment, both branches, so an
                    # operator can tell "we checked and it was refused" from
                    # "we had nothing to check" -- an attack from a broken
                    # integration. Kept out of the public serializer.
                    sender_verification=sender_verification,
                )
            except IntegrityError:
                # Two concurrent retries can both clear the exists() check.
                # The assets just stored are left unbound; the daily
                # delete_unbound_helpdesk_assets sweep collects them.
                return self._discard(
                    "duplicate",
                    email_message_id=message_id,
                    hd_request_id=str(hd_request.id),
                )

            bind_assets(
                [asset.id for asset in stored_assets],
                workspace_id=hd_request.workspace_id,
                entity_type=COMMENT_ENTITY,
                entity_identifier=new_comment.id,
            )


            # Update first response if necessary
            if hd_request.first_responded_at is None and actor is not None:
                hd_request.first_responded_at = new_comment.created_at
                hd_request.save(update_fields=["first_responded_at"])
                
            # Trigger pub/sub
            publish(
                hd_request.workspace.slug, 
                {"type": "comment.created", "request_id": str(hd_request.id)}
            )
            
            return Response({"success": True, "comment_id": str(new_comment.id)}, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            log_exception(e)
            return Response({"error": "Internal server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
