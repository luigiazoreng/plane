from django.utils import timezone
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError

from plane.app.views.base import BaseViewSet
from plane.db.models.helpdesk import (
    HelpdeskForm,
    HelpdeskFormVisibility,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestAssignee,
    HelpdeskStatus,
)
from plane.app.serializers.helpdesk import HelpdeskRequestSerializer
from plane.app.helpdesk.auto_assignment import assign_helpdesk_request_automatically
from .form import get_customer_from_token
from plane.app.helpdesk.form_core import validate_helpdesk_form_submission, generate_ticket_display_id
from plane.app.helpdesk.sse_broker import publish
from plane.app.helpdesk.permissions import get_helpdesk_role, MEMBER, GUEST

HELPDESK_ARCHIVABLE_STATUS_NAMES = ("resolved", "closed", "completed", "canceled", "cancelled")


def is_archivable_helpdesk_status(status_obj):
    if not status_obj:
        return False
    if status_obj.is_terminal:
        return True
    status_name = (status_obj.name or "").lower()
    return any(name in status_name for name in HELPDESK_ARCHIVABLE_STATUS_NAMES)


class HelpdeskRequestViewSet(BaseViewSet):
    serializer_class = HelpdeskRequestSerializer
    model = HelpdeskRequest

    # `search` is handled by SearchFilter (BaseViewSet wires it up)
    search_fields = ["title", "description", "display_id", "contact_email"]

    ALLOWED_ORDER_BY = {
        "created_at",
        "-created_at",
        "updated_at",
        "-updated_at",
        "title",
    }

    # comma-separated multi-value params -> queryset lookups (Plane convention)
    MULTI_VALUE_FILTERS = {
        "status": "status__in",
        "portal": "portal__in",
        "form": "form__in",
        "source": "source__in",
        "assignees": "assignees__in",
    }

    def get_queryset(self):
        queryset = self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

        if getattr(self, "action", "") == "list":
            queryset = queryset.filter(archived_at__isnull=True)

        # multi-value filters (?status=a,b&assignees=c,d ...)
        for param, lookup in self.MULTI_VALUE_FILTERS.items():
            raw = self.request.query_params.get(param)
            if raw:
                values = [item for item in raw.split(",") if item]
                if values:
                    queryset = queryset.filter(**{lookup: values})

        # created_at date range
        created_at_gte = self.request.query_params.get("created_at__gte")
        created_at_lte = self.request.query_params.get("created_at__lte")
        if created_at_gte:
            queryset = queryset.filter(created_at__date__gte=created_at_gte)
        if created_at_lte:
            queryset = queryset.filter(created_at__date__lte=created_at_lte)

        # ordering (whitelisted)
        order_by = self.request.query_params.get("order_by", "-created_at")
        if order_by not in self.ALLOWED_ORDER_BY:
            order_by = "-created_at"
        queryset = queryset.order_by(order_by)

        # distinct() guards against duplicate rows when filtering by the assignees M2M
        queryset = queryset.distinct()

        # Eager-load related objects to avoid N+1 queries on serialization.
        # _prefetched_assignees is read by HelpdeskRequestSerializer.to_representation.
        queryset = queryset.select_related("status", "portal", "form").prefetch_related(
            Prefetch(
                "request_assignees",
                queryset=HelpdeskRequestAssignee.objects.filter(deleted_at__isnull=True),
                to_attr="_prefetched_assignees",
            )
        )

        return queryset

    def list(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        queryset = self.get_queryset()
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: HelpdeskRequestSerializer(results, many=True).data,
            default_per_page=50,
            max_per_page=200,
        )

    def retrieve(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can create requests."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can delete requests."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def archive(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can archive requests."}, status=status.HTTP_403_FORBIDDEN)

        instance = self.get_object()
        if not is_archivable_helpdesk_status(instance.status):
            return Response(
                {"error": "Only resolved or closed helpdesk tickets can be archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.archived_at = timezone.now()
        instance.save(update_fields=["archived_at", "updated_at"])
        publish(slug or "", {"type": "request.updated", "request_id": str(instance.id)})
        return Response({"archived_at": instance.archived_at}, status=status.HTTP_200_OK)

    def unarchive(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can unarchive requests."}, status=status.HTTP_403_FORBIDDEN)

        instance = self.get_object()
        instance.archived_at = None
        instance.save(update_fields=["archived_at", "updated_at"])
        publish(slug or "", {"type": "request.updated", "request_id": str(instance.id)})
        return Response({"archived_at": None}, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can update requests."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        old_status_id = str(instance.status_id) if instance.status_id else None
        response = super().partial_update(request, *args, **kwargs)
        new_status_id = request.data.get("status")
        if new_status_id and new_status_id != old_status_id:
            new_status = HelpdeskStatus.objects.filter(id=new_status_id).first()
            if new_status and new_status.is_terminal:
                HelpdeskRequest.objects.filter(id=instance.id).update(resolved_at=timezone.now())
            elif new_status and not new_status.is_terminal:
                HelpdeskRequest.objects.filter(id=instance.id).update(resolved_at=None)
        publish(self.kwargs.get("slug", ""), {"type": "request.updated", "request_id": str(instance.id)})
        return response

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        portal_id = self.request.data.get("portal")
        portal = HelpdeskPortal.objects.filter(id=portal_id, workspace=workspace).first()
        if not portal:
            raise ValidationError("Portal not found for this workspace.")
        form = None
        form_id = self.request.data.get("form")
        if form_id:
            form = HelpdeskForm.objects.filter(id=form_id, portal=portal, workspace=workspace).first()
            if not form:
                raise ValidationError("Form not found for this portal.")
        helpdesk_request = serializer.save(workspace=workspace, portal=portal, form=form)
        if form:
            display_id = generate_ticket_display_id(form)
            if display_id:
                HelpdeskRequest.objects.filter(pk=helpdesk_request.pk).update(display_id=display_id)
                helpdesk_request.display_id = display_id
        assign_helpdesk_request_automatically(helpdesk_request, request_payload=self.request.data)
        publish(self.kwargs.get("slug", ""), {"type": "request.created", "request_id": str(helpdesk_request.id)})


class PublicHelpdeskRequestEndpoint(BaseViewSet):
    permission_classes = [AllowAny]
    serializer_class = HelpdeskRequestSerializer
    model = HelpdeskRequest

    def list(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error
        if not customer:
            return Response({"error": "Login required to list requests"}, status=status.HTTP_401_UNAUTHORIZED)
        if str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token"}, status=status.HTTP_403_FORBIDDEN)

        requests_qs = HelpdeskRequest.objects.filter(
            portal=portal,
            customer=customer,
            archived_at__isnull=True,
        ).order_by("-created_at")
        serializer = HelpdeskRequestSerializer(requests_qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, public_slug, pk=None):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error

        hd_request = HelpdeskRequest.objects.filter(id=pk, portal=portal).first()
        if not hd_request:
            return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

        if hd_request.customer and hd_request.customer != customer:
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        serializer = HelpdeskRequestSerializer(hd_request)
        return Response(serializer.data)

    def create(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error

        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token for this workspace"}, status=status.HTTP_403_FORBIDDEN)

        if portal.require_login and not customer:
            return Response({"error": "Login required to submit requests to this portal"}, status=status.HTTP_401_UNAUTHORIZED)

        form_id = request.data.get("form")
        if form_id:
            form = HelpdeskForm.objects.filter(id=form_id, portal=portal, is_active=True, deleted_at__isnull=True).first()
            if not form:
                return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
            if form.visibility == HelpdeskFormVisibility.PRIVATE and not customer:
                return Response({"error": "Login required to submit this form"}, status=status.HTTP_401_UNAUTHORIZED)
            if not customer and not request.data.get("contact_email"):
                return Response({"contact_email": "Contact email is required."}, status=status.HTTP_400_BAD_REQUEST)

            result = validate_helpdesk_form_submission(form, request.data)
            if result["errors"]:
                return Response(result["errors"], status=status.HTTP_400_BAD_REQUEST)

            serializer = HelpdeskRequestSerializer(data={
                "title": result["title"],
                "description": result["description"],
                "contact_email": customer.email if customer else request.data.get("contact_email"),
                "source": request.data.get("source", "public_form"),
                "form_responses": result["responses"],
            })
            if serializer.is_valid():
                helpdesk_request = serializer.save(
                    portal=portal,
                    form=form,
                    workspace=portal.workspace,
                    customer=customer,
                )
                display_id = generate_ticket_display_id(form)
                if display_id:
                    HelpdeskRequest.objects.filter(pk=helpdesk_request.pk).update(display_id=display_id)
                    helpdesk_request.display_id = display_id
                assign_helpdesk_request_automatically(helpdesk_request, request_payload=request.data)
                publish(str(portal.workspace.slug), {"type": "request.created", "request_id": str(helpdesk_request.id)})
                return Response(HelpdeskRequestSerializer(helpdesk_request).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer = HelpdeskRequestSerializer(data=request.data)
        if serializer.is_valid():
            helpdesk_request = serializer.save(
                portal=portal,
                workspace=portal.workspace,
                customer=customer,
            )
            assign_helpdesk_request_automatically(helpdesk_request, request_payload=request.data)
            publish(str(portal.workspace.slug), {"type": "request.created", "request_id": str(helpdesk_request.id)})
            return Response(HelpdeskRequestSerializer(helpdesk_request).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
