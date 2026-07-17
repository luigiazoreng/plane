# Python imports
import re
import logging
from typing import Optional

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

# Module imports
from plane.db.models import HelpdeskRequestComment, HelpdeskMember, HelpdeskPortal
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
        
    def _extract_email_address(self, from_str: str) -> str:
        # from_str can be "Name <email@domain.com>" or just "email@domain.com"
        match = re.search(r"<([^>]+)>", from_str)
        if match:
            return match.group(1).strip().lower()
        return from_str.strip().lower()

    def post(self, request, *args, **kwargs):
        try:
            # SendGrid sends the payload as multipart/form-data
            data = request.data
            
            headers_str = data.get("headers", "")
            from_str = data.get("from", "")
            text_body = data.get("text", "")
            html_body = data.get("html", "")
            
            if not from_str:
                return Response({"error": "Missing 'from' field"}, status=status.HTTP_400_BAD_REQUEST)
                
            from_email = self._extract_email_address(from_str)
            
            in_reply_to = self._extract_header(headers_str, "In-Reply-To")
            references = self._extract_header(headers_str, "References")
            message_id = self._extract_header(headers_str, "Message-ID")
            
            if not text_body and html_body:
                text_body = generate_plain_text_from_html(html_body)
                
            if not text_body:
                return Response({"error": "Empty email body"}, status=status.HTTP_400_BAD_REQUEST)
                
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
                logger.warning(f"Could not find matching HelpdeskRequestComment for In-Reply-To: {in_reply_to}")
                return Response(
                    {"error": "Could not match email to an existing Helpdesk thread."}, 
                    status=status.HTTP_404_NOT_FOUND
                )
                
            hd_request = parent_comment.request
            
            # Security: verify sender is authorized to comment on this ticket
            is_authorized = False
            is_internal = False
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
                    actor = member.member
                    # Check if the email was sent to an internal support address?
                    # For simplicity, if an agent replies via email, we default it to internal=False 
                    # unless we build a parser for commands like #internal.
                    is_internal = False
                    
            if not is_authorized:
                logger.warning(f"Unauthorized email reply from {from_email} on request {hd_request.id}")
                return Response(
                    {"error": "Sender is not authorized to reply to this thread."},
                    status=status.HTTP_403_FORBIDDEN
                )
                
            # Clean up the text body to remove previous quotes
            # A simple approach is to just use the raw text, but in reality 
            # we might want to split on common reply indicators like "On ... wrote:"
            # For this MVP, we save the full text_body. A more robust reply parser 
            # like python-email-reply-parser could be used later.
            
            new_comment = HelpdeskRequestComment.objects.create(
                workspace_id=hd_request.workspace_id,
                request=hd_request,
                actor=actor,
                customer=customer,
                content=text_body,
                is_internal=is_internal,
                delivery_channels=["email"],
                email_status=HelpdeskRequestComment.EmailDeliveryStatus.SENT,
                email_message_id=message_id,
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
