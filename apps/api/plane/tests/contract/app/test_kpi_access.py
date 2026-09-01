# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Access-control contract for the workspace-level KPI and Executive panels.

These panels carry per-person performance data -- individual scores, rankings
and a "below target" flag -- so who can read them is part of the contract, not
an implementation detail. Every test here pins a gate that a refactor could
silently loosen.
"""

import pytest
from django.urls import reverse

from plane.db.models import HelpdeskMember, Project, User, WorkspaceKpiAccess, WorkspaceMember


def _member(workspace, email, ws_role):
    """A second workspace member at the given role, distinct from create_user."""
    user = User.objects.create(email=email, username=email.split("@")[0], first_name="Test", last_name="User")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=ws_role, is_active=True)
    return user


@pytest.mark.django_db
class TestHelpdeskAnalyticsAccess:
    """The Executive Dashboard's Team Performance table is fed by this endpoint.

    Helpdesk membership alone used to open it, which let a workspace GUEST who
    held any helpdesk role read ``top_agents`` -- agent names, ticket volumes and
    per-agent SLA percentages for the whole workspace.
    """

    def test_workspace_guest_with_helpdesk_role_is_denied(self, api_client, workspace):
        guest = _member(workspace, "hd-guest@plane.so", ws_role=5)
        HelpdeskMember.objects.create(workspace=workspace, member=guest, role=20, is_active=True)
        api_client.force_authenticate(user=guest)

        url = reverse("helpdesk-analytics", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_workspace_member_with_helpdesk_role_is_allowed(self, api_client, workspace):
        agent = _member(workspace, "hd-agent@plane.so", ws_role=15)
        HelpdeskMember.objects.create(workspace=workspace, member=agent, role=15, is_active=True)
        api_client.force_authenticate(user=agent)

        url = reverse("helpdesk-analytics", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 200

    def test_workspace_member_without_helpdesk_role_is_denied(self, api_client, workspace):
        """The workspace floor is additive: it must not replace the helpdesk check."""
        outsider = _member(workspace, "no-helpdesk@plane.so", ws_role=15)
        api_client.force_authenticate(user=outsider)

        url = reverse("helpdesk-analytics", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403


@pytest.mark.django_db
class TestWorkspaceKpiMemberAggregateAccess:
    """Same per-person Vp/Vf that WorkspaceKpiOverviewEndpoint guards.

    This endpoint used to allow GUEST while the overview required ADMIN/MEMBER,
    which made the stronger gate decorative -- the data was one URL away. The two
    now share has_workspace_kpi_access, and these tests pin them together.
    """

    def test_guest_is_denied(self, api_client, workspace):
        guest = _member(workspace, "kpi-guest@plane.so", ws_role=5)
        api_client.force_authenticate(user=guest)

        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_ungranted_member_is_denied(self, api_client, workspace):
        member = _member(workspace, "kpi-member@plane.so", ws_role=15)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_granted_member_is_allowed(self, api_client, workspace):
        member = _member(workspace, "kpi-granted@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=member, is_active=True)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 200

    def test_admin_is_allowed(self, session_client, workspace):
        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        assert session_client.get(url).status_code == 200

    def test_guest_is_denied_on_overview_too(self, api_client, workspace):
        """Pins the pair: both endpoints expose per-member figures, both exclude GUEST."""
        guest = _member(workspace, "kpi-guest2@plane.so", ws_role=5)
        api_client.force_authenticate(user=guest)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403


@pytest.mark.django_db
class TestWorkspaceKpiGrant:
    """Admin by default, plus the exceptions an admin opens explicitly."""

    def test_member_without_grant_is_denied(self, api_client, workspace):
        member = _member(workspace, "ungranted@plane.so", ws_role=15)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_member_with_grant_is_allowed(self, api_client, workspace):
        member = _member(workspace, "granted@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=member, is_active=True)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 200

    def test_guest_with_grant_is_allowed(self, api_client, workspace):
        """The grant is the authority, not the workspace role: an admin may hand
        the panel to someone who is otherwise a GUEST."""
        guest = _member(workspace, "granted-guest@plane.so", ws_role=5)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=guest, is_active=True)
        api_client.force_authenticate(user=guest)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 200

    def test_revoked_grant_is_denied(self, api_client, workspace):
        member = _member(workspace, "revoked@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=member, is_active=False)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_admin_needs_no_grant(self, session_client, workspace):
        """create_user is the workspace admin and has no row in the grant table."""
        assert not WorkspaceKpiAccess.objects.filter(workspace=workspace).exists()

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert session_client.get(url).status_code == 200

    def test_panel_covers_projects_the_requester_does_not_belong_to(self, session_client, workspace):
        """The whole point of an executive panel: someone who joined no project
        must still see every project with the KPI panel enabled."""
        outsider = User.objects.create(email="owner@plane.so", username="owner", first_name="P", last_name="O")
        Project.objects.create(
            name="Foreign", identifier="FOR", workspace=workspace, created_by=outsider, kpi_view=True
        )

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        response = session_client.get(url)
        assert response.status_code == 200
        assert [row["identifier"] for row in response.json()["projects"]] == ["FOR"]

    def test_kpi_disabled_projects_stay_out(self, session_client, workspace, create_user):
        Project.objects.create(
            name="Disabled", identifier="DIS", workspace=workspace, created_by=create_user, kpi_view=False
        )

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        response = session_client.get(url)
        assert response.status_code == 200
        assert response.json()["projects"] == []


@pytest.mark.django_db
class TestWorkspaceKpiAccessManagement:
    """Only workspace admins may read or change the grant list."""

    def test_non_admin_cannot_list(self, api_client, workspace):
        member = _member(workspace, "nosy@plane.so", ws_role=15)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_non_admin_cannot_grant(self, api_client, workspace):
        member = _member(workspace, "climber@plane.so", ws_role=15)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        assert api_client.post(url, {"members": [str(member.id)]}, format="json").status_code == 403

    def test_admin_grants_and_revokes(self, session_client, workspace, create_user):
        member = _member(workspace, "target@plane.so", ws_role=15)
        overview = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})

        created = session_client.post(url, {"members": [str(member.id)]}, format="json")
        assert created.status_code == 201
        assert created.json()[0]["member_detail"]["id"] == str(member.id)
        grant_id = created.json()[0]["id"]

        session_client.force_authenticate(user=member)
        assert session_client.get(overview).status_code == 200

        session_client.force_authenticate(user=create_user)
        detail = reverse("workspace-kpi-access-detail", kwargs={"slug": workspace.slug, "pk": grant_id})
        assert session_client.delete(detail).status_code == 204

        session_client.force_authenticate(user=member)
        assert session_client.get(overview).status_code == 403

    def test_granting_twice_revives_instead_of_duplicating(self, session_client, workspace):
        member = _member(workspace, "twice@plane.so", ws_role=15)
        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})

        first = session_client.post(url, {"members": [str(member.id)]}, format="json")
        grant_id = first.json()[0]["id"]
        detail = reverse("workspace-kpi-access-detail", kwargs={"slug": workspace.slug, "pk": grant_id})
        session_client.delete(detail)

        again = session_client.post(url, {"members": [str(member.id)]}, format="json")
        assert again.status_code == 201
        assert WorkspaceKpiAccess.objects.filter(workspace=workspace, member=member).count() == 1

    def test_cannot_grant_to_a_non_member(self, session_client, workspace):
        outsider = User.objects.create(email="stranger@plane.so", username="stranger", first_name="O", last_name="U")

        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        response = session_client.post(url, {"members": [str(outsider.id)]}, format="json")
        assert response.status_code == 400
        assert not WorkspaceKpiAccess.objects.filter(member=outsider).exists()

    def test_empty_payload_is_rejected(self, session_client, workspace):
        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        assert session_client.post(url, {"members": []}, format="json").status_code == 400


@pytest.mark.django_db
class TestWorkspaceMemberMeKpiFlag:
    """The web app reads this flag instead of re-deriving the rule from a role."""

    def test_admin_flag_is_true(self, session_client, workspace):
        url = reverse("workspace-member-details", kwargs={"slug": workspace.slug})
        assert session_client.get(url).json()["can_view_workspace_kpi"] is True

    def test_ungranted_member_flag_is_false(self, api_client, workspace):
        member = _member(workspace, "flag-off@plane.so", ws_role=15)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-member-details", kwargs={"slug": workspace.slug})
        assert api_client.get(url).json()["can_view_workspace_kpi"] is False

    def test_granted_member_flag_is_true(self, api_client, workspace):
        member = _member(workspace, "flag-on@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=member, is_active=True)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-member-details", kwargs={"slug": workspace.slug})
        assert api_client.get(url).json()["can_view_workspace_kpi"] is True
