from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseViewSet
from plane.db.models import HelpdeskMember, WorkspaceMember, Workspace
from plane.app.serializers.helpdesk import HelpdeskMemberSerializer
from plane.app.helpdesk.permissions import get_helpdesk_role, ADMIN, GUEST


class HelpdeskMemberViewSet(BaseViewSet):
    serializer_class = HelpdeskMemberSerializer
    model = HelpdeskMember

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                is_active=True,
                deleted_at__isnull=True,
            )
            .select_related("member", "workspace")
        )

    def list(self, request, slug):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < GUEST:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        qs = self.get_queryset()
        serializer = HelpdeskMemberSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request, slug):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage members."}, status=status.HTTP_403_FORBIDDEN)

        members_data = request.data.get("members", [])
        if not members_data:
            return Response({"error": "Provide at least one member."}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        to_create = []
        to_update = []

        for item in members_data:
            member_id = item.get("member_id")
            member_role = item.get("role", 15)

            if member_role not in (20, 15, 5):
                return Response({"error": f"Invalid role: {member_role}."}, status=status.HTTP_400_BAD_REQUEST)

            if not WorkspaceMember.objects.filter(
                workspace=workspace, member_id=member_id, is_active=True
            ).exists():
                return Response(
                    {"error": f"User {member_id} is not a workspace member."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            existing = HelpdeskMember.objects.filter(
                workspace=workspace, member_id=member_id
            ).first()

            if existing:
                existing.role = member_role
                existing.is_active = True
                existing.deleted_at = None
                to_update.append(existing)
            else:
                to_create.append(
                    HelpdeskMember(
                        workspace=workspace,
                        member_id=member_id,
                        role=member_role,
                    )
                )

        if to_update:
            HelpdeskMember.objects.bulk_update(to_update, ["role", "is_active", "deleted_at"])
        if to_create:
            HelpdeskMember.objects.bulk_create(to_create, batch_size=10, ignore_conflicts=True)

        result = HelpdeskMember.objects.filter(
            workspace=workspace,
            member_id__in=[item.get("member_id") for item in members_data],
            is_active=True,
        ).select_related("member")
        return Response(HelpdeskMemberSerializer(result, many=True).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, pk):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage members."}, status=status.HTTP_403_FORBIDDEN)

        member = HelpdeskMember.objects.filter(pk=pk, workspace__slug=slug, is_active=True).first()
        if not member:
            return Response({"error": "Member not found."}, status=status.HTTP_404_NOT_FOUND)

        new_role = request.data.get("role")
        if new_role is not None and new_role not in (20, 15, 5):
            return Response({"error": f"Invalid role: {new_role}."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = HelpdeskMemberSerializer(member, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, pk):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage members."}, status=status.HTTP_403_FORBIDDEN)

        member = HelpdeskMember.objects.filter(pk=pk, workspace__slug=slug, is_active=True).first()
        if not member:
            return Response({"error": "Member not found."}, status=status.HTTP_404_NOT_FOUND)

        member.is_active = False
        member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
