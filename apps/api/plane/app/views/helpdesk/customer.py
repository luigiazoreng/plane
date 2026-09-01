from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseViewSet
from plane.db.models import HelpdeskCustomer, Workspace
from plane.app.serializers.helpdesk import HelpdeskCustomerAdminSerializer
from plane.app.helpdesk.permissions import get_helpdesk_role, ADMIN, MEMBER


class HelpdeskCustomerViewSet(BaseViewSet):
    serializer_class = HelpdeskCustomerAdminSerializer
    model = HelpdeskCustomer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .order_by("-created_at")
        )

    def _require_admin(self, slug):
        role = get_helpdesk_role(self.request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can perform this action."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def _require_member(self, slug):
        role = get_helpdesk_role(self.request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can access customers."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def list(self, request, slug):
        err = self._require_member(slug)
        if err:
            return err
        serializer = HelpdeskCustomerAdminSerializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def retrieve(self, request, slug, pk):
        err = self._require_member(slug)
        if err:
            return err
        customer = self.get_queryset().filter(pk=pk).first()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(HelpdeskCustomerAdminSerializer(customer).data)

    def create(self, request, slug):
        err = self._require_member(slug)
        if err:
            return err
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = HelpdeskCustomerAdminSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, pk):
        err = self._require_admin(slug)
        if err:
            return err
        customer = self.get_queryset().filter(pk=pk).first()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = HelpdeskCustomerAdminSerializer(customer, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, pk):
        err = self._require_admin(slug)
        if err:
            return err
        customer = self.get_queryset().filter(pk=pk).first()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
        customer.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

