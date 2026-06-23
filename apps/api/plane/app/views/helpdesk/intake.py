import json
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from plane.app.views.base import BaseViewSet
from plane.db.models.helpdesk import HelpdeskRequest, HelpdeskRequestIntakeIssue
from plane.db.models import Intake, IntakeIssue, Issue, Project, State, StateGroup
from plane.db.models.intake import SourceType
from plane.app.serializers.helpdesk import HelpdeskRequestIntakeIssueSerializer
from plane.app.helpdesk.permissions import get_helpdesk_role, MEMBER
from plane.bgtasks.issue_activities_task import issue_activity


class HelpdeskRequestIntakeIssueViewSet(BaseViewSet):
    serializer_class = HelpdeskRequestIntakeIssueSerializer
    model = HelpdeskRequestIntakeIssue
    filterset_fields = ["request"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("intake_issue", "intake_issue__issue", "forwarded_to_project")
        )

    def list(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can remove intake links."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def create(self, request, slug):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can forward to Intake."}, status=status.HTTP_403_FORBIDDEN)
        request_id = request.data.get("request")
        project_id = request.data.get("project")
        title = request.data.get("title", "").strip()
        description = request.data.get("description", "").strip()

        if not request_id or not project_id or not title:
            raise ValidationError("Fields 'request', 'project', and 'title' are required.")

        hd_request = HelpdeskRequest.objects.filter(id=request_id, workspace__slug=slug).first()
        if not hd_request:
            raise ValidationError("Helpdesk request not found.")

        project = Project.objects.filter(id=project_id, workspace__slug=slug).first()
        if not project:
            raise ValidationError("Project not found in this workspace.")

        intake = Intake.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if not intake and not project.intake_view:
            raise ValidationError("Intake is not enabled for the selected project.")

        # Get or create triage state
        triage_state = State.triage_objects.filter(project_id=project_id, workspace__slug=slug).first()
        if not triage_state:
            triage_state = State.objects.create(
                name="Triage",
                group=StateGroup.TRIAGE.value,
                project_id=project_id,
                workspace_id=project.workspace_id,
                color="#4E5355",
                sequence=65000,
                default=False,
            )

        # Create the Issue in triage state
        issue = Issue.objects.create(
            name=title,
            description_json={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": description}]}]} if description else {},
            description_html=f"<p>{description}</p>" if description else "<p></p>",
            priority="none",
            project_id=project_id,
            state_id=triage_state.id,
        )

        # Create IntakeIssue
        intake_issue = IntakeIssue.objects.create(
            intake=intake,
            project_id=project_id,
            issue=issue,
            source=SourceType.IN_APP,
        )

        # Track activity
        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps({"name": title, "description": description}, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            intake=str(intake_issue.id),
        )

        # Create the Helpdesk ↔ IntakeIssue link
        link = HelpdeskRequestIntakeIssue.objects.create(
            request=hd_request,
            intake_issue=intake_issue,
            forwarded_to_project=project,
            workspace=hd_request.workspace,
            created_by=request.user,
        )

        serializer = HelpdeskRequestIntakeIssueSerializer(link)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
