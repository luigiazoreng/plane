# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import Profile, User, WorkspaceMember, WorkspaceMemberInvite


@pytest.fixture
def invited_user(db):
    """A user who signed up and finished profile setup but belongs to no workspace yet."""
    user = User.objects.create(
        email="invitee@plane.so",
        username=uuid.uuid4().hex,
        first_name="In",
        last_name="Vitee",
    )
    user.set_password("test-password")
    user.save()
    Profile.objects.create(
        user=user,
        onboarding_step={
            "profile_complete": True,
            "workspace_create": False,
            "workspace_invite": False,
            "workspace_join": False,
        },
    )
    return user


@pytest.fixture
def pending_invite(db, workspace, invited_user):
    """A pending member invite addressed to ``invited_user``."""
    return WorkspaceMemberInvite.objects.create(
        workspace=workspace,
        email=invited_user.email,
        token=uuid.uuid4().hex,
        role=15,
    )


@pytest.mark.contract
class TestWorkspaceJoinEndpoint:
    """Accepting a workspace invite must leave the invitee out of onboarding."""

    @pytest.mark.django_db
    @patch("plane.bgtasks.event_tracking_task.track_event.delay")
    def test_accepting_invite_records_workspace_on_profile(
        self, _mock_track_event, api_client, workspace, invited_user, pending_invite
    ):
        url = reverse("workspace-join", kwargs={"slug": workspace.slug, "pk": pending_invite.id})

        response = api_client.post(url, {"accepted": True, "token": pending_invite.token}, format="json")

        assert response.status_code == status.HTTP_200_OK

        # The invitee is now a member with the invited role
        membership = WorkspaceMember.objects.get(workspace=workspace, member=invited_user)
        assert membership.is_active is True
        assert membership.role == 15

        # ...and their profile reflects it, so onboarding does not trap them on the
        # "create or join a workspace" step with no invite left to accept.
        profile = Profile.objects.get(user=invited_user)
        assert profile.last_workspace_id == workspace.id
        assert profile.onboarding_step["workspace_join"] is True
        assert profile.is_onboarded is True

    @pytest.mark.django_db
    @patch("plane.bgtasks.event_tracking_task.track_event.delay")
    def test_accepting_invite_keeps_incomplete_profile_in_onboarding(
        self, _mock_track_event, api_client, workspace, invited_user, pending_invite
    ):
        """A user who never finished profile setup still has an onboarding step to run."""
        profile = Profile.objects.get(user=invited_user)
        profile.onboarding_step = {
            "profile_complete": False,
            "workspace_create": False,
            "workspace_invite": False,
            "workspace_join": False,
        }
        profile.save()

        url = reverse("workspace-join", kwargs={"slug": workspace.slug, "pk": pending_invite.id})

        response = api_client.post(url, {"accepted": True, "token": pending_invite.token}, format="json")

        assert response.status_code == status.HTTP_200_OK

        profile.refresh_from_db()
        assert profile.last_workspace_id == workspace.id
        assert profile.onboarding_step["workspace_join"] is True
        assert profile.is_onboarded is False

    @pytest.mark.django_db
    def test_rejecting_invite_leaves_profile_untouched(self, api_client, workspace, invited_user, pending_invite):
        url = reverse("workspace-join", kwargs={"slug": workspace.slug, "pk": pending_invite.id})

        response = api_client.post(url, {"accepted": False, "token": pending_invite.token}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert not WorkspaceMember.objects.filter(workspace=workspace, member=invited_user).exists()

        profile = Profile.objects.get(user=invited_user)
        assert profile.last_workspace_id is None
        assert profile.onboarding_step["workspace_join"] is False
        assert profile.is_onboarded is False

    @pytest.mark.django_db
    def test_wrong_token_is_rejected(self, api_client, workspace, invited_user, pending_invite):
        url = reverse("workspace-join", kwargs={"slug": workspace.slug, "pk": pending_invite.id})

        response = api_client.post(url, {"accepted": True, "token": "not-the-token"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not WorkspaceMember.objects.filter(workspace=workspace, member=invited_user).exists()
        assert Profile.objects.get(user=invited_user).is_onboarded is False
