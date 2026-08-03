# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State, User


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Filter Test Project",
        identifier="FTP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(project, workspace, create_user):
    return State.objects.create(
        name="Todo",
        color="#000000",
        group="unstarted",
        project=project,
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def other_user(db):
    user = User.objects.create(
        email="other@plane.so", username="other-user", first_name="Other", last_name="User"
    )
    user.set_password("password")
    user.save()
    return user


def _make_issue(project, workspace, state, create_user, name="Task", priority="none"):
    return Issue.objects.create(
        name=name,
        project=project,
        workspace=workspace,
        state=state,
        priority=priority,
        created_by=create_user,
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectWorkItemFilters:
    """`filters` JSON param on the project-scoped work items list, via ComplexFilterBackend."""

    def _url(self, workspace_slug, project_id):
        return f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/"

    def test_filters_by_assignee_id(self, api_key_client, workspace, project, state, create_user, other_user):
        mine = _make_issue(project, workspace, state, create_user, name="Mine")
        IssueAssignee.objects.create(issue=mine, assignee=create_user, project=project, workspace=workspace)
        theirs = _make_issue(project, workspace, state, create_user, name="Theirs")
        IssueAssignee.objects.create(issue=theirs, assignee=other_user, project=project, workspace=workspace)

        response = api_key_client.get(
            self._url(workspace.slug, project.id),
            {"filters": f'{{"assignee_id": "{create_user.id}"}}'},
        )
        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data["results"]}
        assert names == {"Mine"}
        assert response.data["total_count"] == 1

    def test_filters_by_priority_in(self, api_key_client, workspace, project, state, create_user):
        _make_issue(project, workspace, state, create_user, name="Urgent one", priority="urgent")
        _make_issue(project, workspace, state, create_user, name="Low one", priority="low")

        response = api_key_client.get(
            self._url(workspace.slug, project.id),
            {"filters": '{"priority__in": ["urgent", "high"]}'},
        )
        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data["results"]}
        assert names == {"Urgent one"}

    def test_unsupported_filter_field_is_rejected(self, api_key_client, workspace, project):
        response = api_key_client.get(
            self._url(workspace.slug, project.id),
            {"filters": '{"not_a_real_field": "x"}'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkspaceWorkItemList:
    """Workspace-wide work item list, scoped to the caller's project memberships."""

    def _url(self, workspace_slug):
        return f"/api/v1/workspaces/{workspace_slug}/work-items/"

    def test_only_returns_issues_from_member_projects(
        self, api_key_client, workspace, project, state, create_user, other_user
    ):
        visible = _make_issue(project, workspace, state, create_user, name="Visible")

        other_project = Project.objects.create(
            name="Other Project", identifier="OTH", workspace=workspace, created_by=other_user
        )
        other_state = State.objects.create(
            name="Todo", color="#000000", group="unstarted",
            project=other_project, workspace=workspace, created_by=other_user,
        )
        # create_user is NOT a member of other_project.
        _make_issue(other_project, workspace, other_state, other_user, name="Hidden")

        response = api_key_client.get(self._url(workspace.slug))
        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data["results"]}
        assert names == {"Visible"}

    def test_filters_param_applies_workspace_wide(self, api_key_client, workspace, project, state, create_user):
        _make_issue(project, workspace, state, create_user, name="Urgent", priority="urgent")
        _make_issue(project, workspace, state, create_user, name="Low", priority="low")

        response = api_key_client.get(self._url(workspace.slug), {"filters": '{"priority": "urgent"}'})
        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data["results"]}
        assert names == {"Urgent"}


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkItemCount:
    def _url(self, workspace_slug):
        return f"/api/v1/workspaces/{workspace_slug}/work-items/count/"

    def test_total_count_no_grouping(self, api_key_client, workspace, project, state, create_user):
        _make_issue(project, workspace, state, create_user, name="A")
        _make_issue(project, workspace, state, create_user, name="B")

        response = api_key_client.get(self._url(workspace.slug))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"grouped_by": None, "sub_grouped_by": None, "total_count": 2, "grouped_counts": {}}

    def test_grouped_by_priority(self, api_key_client, workspace, project, state, create_user):
        _make_issue(project, workspace, state, create_user, name="A", priority="urgent")
        _make_issue(project, workspace, state, create_user, name="B", priority="urgent")
        _make_issue(project, workspace, state, create_user, name="C", priority="low")

        response = api_key_client.get(self._url(workspace.slug), {"group_by": "priority"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_count"] == 3
        assert response.data["grouped_counts"]["urgent"]["count"] == 2
        assert response.data["grouped_counts"]["low"]["count"] == 1

    def test_invalid_group_by_is_rejected(self, api_key_client, workspace):
        response = api_key_client.get(self._url(workspace.slug), {"group_by": "not_a_real_field"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_sub_group_by_without_group_by_is_rejected(self, api_key_client, workspace):
        response = api_key_client.get(self._url(workspace.slug), {"sub_group_by": "priority"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
