# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response
from plane.api.views.base import BaseAPIView
from plane.db.models import AIAgentRun, WorkspaceMember


class AIAgentRunApprovalEndpoint(BaseAPIView):
    def post(self, request, slug, run_id):
        # Verify requesting user is a member of the workspace
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            run = AIAgentRun.objects.get(id=run_id, workspace__slug=slug)

            action = request.data.get("action")
            if action == "approve":
                run.status = "approved"
                run.save()
                return Response({"message": "Approved"}, status=status.HTTP_200_OK)
            elif action == "reject":
                run.status = "rejected"
                run.save()
                return Response({"message": "Rejected"}, status=status.HTTP_200_OK)

            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        except AIAgentRun.DoesNotExist:
            return Response({"error": "Run not found"}, status=status.HTTP_404_NOT_FOUND)

