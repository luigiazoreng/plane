# Python imports
import logging

# Django imports
from django.conf import settings

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

# Module imports
from plane.app.helpdesk.inbound_security import verify_inbound_secret
from plane.throttles.helpdesk import HelpdeskInboundThrottle
from plane.utils.exception_logger import log_exception
from plane.app.helpdesk.inbound_processor import process_inbound_email, DiscardEmailException

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

            process_inbound_email(
                from_str=from_str,
                headers_str=headers_str,
                text_body=text_body,
                html_body=html_body,
                uploaded_files=uploaded_files,
                dkim_field=data.get("dkim"),
                spf_field=data.get("SPF"),
            )

            return Response({"success": True}, status=status.HTTP_200_OK)
            
        except DiscardEmailException as e:
            return self._discard(e.detail, **e.log_context)
        except Exception as e:
            log_exception(e)
            return Response({"error": "Internal server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
