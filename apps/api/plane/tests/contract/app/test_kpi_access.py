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
from django.utils import timezone

from plane.db.models import (
    Workspace,
    HelpdeskMember,
    Project,
    ProjectMember,
    User,
    WorkspaceKpiAccess,
    WorkspaceMember,
)


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


@pytest.mark.django_db
class TestProjectKpiPanelAccess:
    """The project KPI panel scores the people working on that project.

    Only its ADMIN opens it. Workspace admins are covered by allow_permission,
    which treats a workspace admin as project ADMIN -- but only when they are
    already a member of the project (upstream PR #7749).
    """

    @pytest.fixture
    def project(self, workspace, create_user):
        return Project.objects.create(
            name="Scored", identifier="SCO", workspace=workspace, created_by=create_user, kpi_view=True
        )

    def _urls(self, workspace, project):
        kwargs = {"slug": workspace.slug, "project_id": project.id}
        return [
            reverse("kpi-issues", kwargs=kwargs),
            reverse("kpi-member-aggregates", kwargs=kwargs),
            reverse("kpi-project-config", kwargs=kwargs),
        ]

    def test_project_member_is_denied(self, api_client, workspace, project):
        member = _member(workspace, "proj-member@plane.so", ws_role=15)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)
        api_client.force_authenticate(user=member)

        for url in self._urls(workspace, project):
            assert api_client.get(url).status_code == 403, url

    def test_project_guest_is_denied(self, api_client, workspace, project):
        guest = _member(workspace, "proj-guest@plane.so", ws_role=15)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        api_client.force_authenticate(user=guest)

        for url in self._urls(workspace, project):
            assert api_client.get(url).status_code == 403, url

    def test_project_admin_is_allowed(self, api_client, workspace, project):
        admin = _member(workspace, "proj-admin@plane.so", ws_role=15)
        ProjectMember.objects.create(project=project, member=admin, role=20, is_active=True)
        api_client.force_authenticate(user=admin)

        for url in self._urls(workspace, project):
            assert api_client.get(url).status_code == 200, url

    def test_workspace_admin_who_is_a_project_member_is_allowed(self, api_client, workspace, project):
        """Upstream rule: workspace admin + any project role -> treated as project ADMIN."""
        ws_admin = _member(workspace, "ws-admin@plane.so", ws_role=20)
        ProjectMember.objects.create(project=project, member=ws_admin, role=5, is_active=True)
        api_client.force_authenticate(user=ws_admin)

        for url in self._urls(workspace, project):
            assert api_client.get(url).status_code == 200, url

    def test_workspace_admin_outside_the_project_is_denied(self, api_client, workspace, project):
        """The other half of the upstream rule, and the reason the workspace-level
        panels needed their own gate rather than reusing this one."""
        ws_admin = _member(workspace, "ws-admin-outside@plane.so", ws_role=20)
        api_client.force_authenticate(user=ws_admin)

        for url in self._urls(workspace, project):
            assert api_client.get(url).status_code == 403, url

    def test_project_config_writes_are_admin_only(self, api_client, workspace, project):
        member = _member(workspace, "writer@plane.so", ws_role=15)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)
        api_client.force_authenticate(user=member)

        url = reverse("kpi-project-config", kwargs={"slug": workspace.slug, "project_id": project.id})
        assert api_client.put(url, {"k": 0.5}, format="json").status_code == 403
        assert api_client.delete(url).status_code == 403


@pytest.fixture
def other_workspace(db, create_user):
    """A second workspace the fixture user owns, for isolation checks."""
    other = Workspace.objects.create(name="Other Workspace", owner=create_user, slug="other-workspace")
    WorkspaceMember.objects.create(workspace=other, member=create_user, role=20, is_active=True)
    return other


@pytest.mark.django_db
class TestWorkspaceKpiAccessIsolation:
    """A grant is scoped to the workspace that issued it.

    Every filter in has_workspace_kpi_access carries a workspace, but nothing
    stops a future refactor from dropping one -- and the failure mode is silent
    and severe: performance data about one company's team readable from another
    workspace. These tests make that failure loud.
    """

    def test_grant_does_not_carry_to_another_workspace(self, api_client, workspace, other_workspace):
        member = _member(workspace, "scoped@plane.so", ws_role=15)
        WorkspaceMember.objects.create(workspace=other_workspace, member=member, role=15, is_active=True)
        # Granted in the first workspace only.
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=member, is_active=True)
        api_client.force_authenticate(user=member)

        allowed = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        denied = reverse("workspace-kpi-overview", kwargs={"slug": other_workspace.slug})
        assert api_client.get(allowed).status_code == 200
        assert api_client.get(denied).status_code == 403

    def test_admin_of_another_workspace_is_denied(self, api_client, workspace, other_workspace):
        outsider = _member(other_workspace, "other-admin@plane.so", ws_role=20)
        api_client.force_authenticate(user=outsider)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 403

    def test_panel_never_reaches_into_another_workspace(self, session_client, workspace, other_workspace, create_user):
        """_workspace_kpi_projects dropped the membership filter; the workspace
        filter is now the only thing bounding it."""
        Project.objects.create(
            name="Mine", identifier="MIN", workspace=workspace, created_by=create_user, kpi_view=True
        )
        Project.objects.create(
            name="Theirs", identifier="THE", workspace=other_workspace, created_by=create_user, kpi_view=True
        )

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        body = session_client.get(url).json()
        assert [row["identifier"] for row in body["projects"]] == ["MIN"]

    def test_grant_list_never_shows_another_workspace(self, session_client, workspace, other_workspace):
        member = _member(other_workspace, "elsewhere@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=other_workspace, member=member, is_active=True)

        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        assert session_client.get(url).json() == []

    def test_cannot_grant_to_a_member_of_another_workspace(self, session_client, workspace, other_workspace):
        outsider = _member(other_workspace, "foreign@plane.so", ws_role=15)

        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        response = session_client.post(url, {"members": [str(outsider.id)]}, format="json")
        assert response.status_code == 400
        assert not WorkspaceKpiAccess.objects.filter(workspace=workspace, member=outsider).exists()

    def test_cannot_revoke_a_grant_from_another_workspace(self, session_client, workspace, other_workspace):
        member = _member(other_workspace, "victim@plane.so", ws_role=15)
        grant = WorkspaceKpiAccess.objects.create(workspace=other_workspace, member=member, is_active=True)

        url = reverse("workspace-kpi-access-detail", kwargs={"slug": workspace.slug, "pk": grant.id})
        assert session_client.delete(url).status_code == 404
        grant.refresh_from_db()
        assert grant.is_active is True


@pytest.mark.django_db
class TestWorkspaceKpiPanelScope:
    """What the workspace panels count, now that membership no longer bounds them."""

    def test_archived_projects_stay_out(self, session_client, workspace, create_user):
        Project.objects.create(
            name="Live", identifier="LIV", workspace=workspace, created_by=create_user, kpi_view=True
        )
        Project.objects.create(
            name="Done", identifier="DON", workspace=workspace, created_by=create_user,
            kpi_view=True, archived_at=timezone.now(),
        )

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        body = session_client.get(url).json()
        assert [row["identifier"] for row in body["projects"]] == ["LIV"]


@pytest.mark.django_db
class TestWorkspaceKpiAccessManagementNegativePaths:
    def test_non_admin_cannot_revoke(self, api_client, workspace):
        target = _member(workspace, "granted-target@plane.so", ws_role=15)
        grant = WorkspaceKpiAccess.objects.create(workspace=workspace, member=target, is_active=True)
        # Being granted access to the panels is not permission to manage the list.
        api_client.force_authenticate(user=target)

        url = reverse("workspace-kpi-access-detail", kwargs={"slug": workspace.slug, "pk": grant.id})
        assert api_client.delete(url).status_code == 403
        grant.refresh_from_db()
        assert grant.is_active is True

    def test_revoking_an_unknown_grant_is_404(self, session_client, workspace):
        url = reverse(
            "workspace-kpi-access-detail",
            kwargs={"slug": workspace.slug, "pk": "00000000-0000-0000-0000-000000000000"},
        )
        assert session_client.delete(url).status_code == 404

    def test_revoking_twice_is_404(self, session_client, workspace):
        target = _member(workspace, "double-revoke@plane.so", ws_role=15)
        grant = WorkspaceKpiAccess.objects.create(workspace=workspace, member=target, is_active=True)
        url = reverse("workspace-kpi-access-detail", kwargs={"slug": workspace.slug, "pk": grant.id})

        assert session_client.delete(url).status_code == 204
        assert session_client.delete(url).status_code == 404

    def test_deactivated_workspace_member_cannot_be_granted(self, session_client, workspace):
        former = _member(workspace, "former@plane.so", ws_role=15)
        WorkspaceMember.objects.filter(workspace=workspace, member=former).update(is_active=False)

        url = reverse("workspace-kpi-access", kwargs={"slug": workspace.slug})
        assert session_client.post(url, {"members": [str(former.id)]}, format="json").status_code == 400

    def test_grant_stops_working_when_membership_is_deactivated(self, api_client, workspace):
        """Leaving the workspace must close the panels even if the grant row survives."""
        member = _member(workspace, "leaver@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=member, is_active=True)
        api_client.force_authenticate(user=member)

        url = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        assert api_client.get(url).status_code == 200

        WorkspaceMember.objects.filter(workspace=workspace, member=member).update(is_active=False)
        assert api_client.get(url).status_code == 403


@pytest.mark.django_db
class TestExecutiveDashboardDataSources:
    """The Executive Dashboard reads two endpoints with two different gates.

    That split is deliberate and the web app relies on it: only the KPI call is
    gated by this page's permission, so a helpdesk 403 must degrade the helpdesk
    sections rather than deny the page. Coupling the two again would lock out the
    exact person the grant exists for.
    """

    def test_granted_member_without_a_helpdesk_role_reads_kpi_but_not_helpdesk(self, api_client, workspace):
        director = _member(workspace, "director@plane.so", ws_role=15)
        WorkspaceKpiAccess.objects.create(workspace=workspace, member=director, is_active=True)
        api_client.force_authenticate(user=director)

        kpi = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        helpdesk = reverse("helpdesk-analytics", kwargs={"slug": workspace.slug})
        assert api_client.get(kpi).status_code == 200
        assert api_client.get(helpdesk).status_code == 403

    def test_workspace_admin_reads_both(self, session_client, workspace):
        """get_helpdesk_role hands workspace admins ADMIN outright, so they never
        hit the split above."""
        kpi = reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})
        helpdesk = reverse("helpdesk-analytics", kwargs={"slug": workspace.slug})
        assert session_client.get(kpi).status_code == 200
        assert session_client.get(helpdesk).status_code == 200
