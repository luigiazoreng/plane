/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceMemberInvitation, TOnboardingStep, TOnboardingSteps, TUserProfile } from "@plane/types";
import { EOnboardingSteps } from "@plane/types";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserProfile } from "@/hooks/store/user";
// local components
import { OnboardingHeader } from "./header";
import { OnboardingStepRoot } from "./steps";

type Props = {
  invitations?: IWorkspaceMemberInvitation[];
};

export const OnboardingRoot = observer(function OnboardingRoot({ invitations = [] }: Props) {
  const [currentStep, setCurrentStep] = useState<TOnboardingStep>(EOnboardingSteps.PROFILE_SETUP);
  // refs
  const hasUserActedRef = useRef(false);
  const hasResolvedInitialStepRef = useRef(false);
  const hasAutoFinishedRef = useRef(false);
  // store hooks
  const { data: user } = useUser();
  const { data: userProfile, updateUserProfile, finishUserOnboarding } = useUserProfile();
  const { workspaces } = useWorkspace();
  const { config: instanceConfig } = useInstance();

  const workspacesList = Object.values(workspaces ?? {});
  const isSelfManaged = instanceConfig?.is_self_managed;

  // Calculate total steps based on whether invitations are available
  const hasInvitations = invitations.length > 0;

  // complete onboarding
  const finishOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      await finishUserOnboarding();
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed",
        message: "Failed to finish onboarding, Please try again later.",
      });
    }
  }, [user, finishUserOnboarding]);

  // handle step change
  const stepChange = useCallback(
    async (steps: Partial<TOnboardingSteps>) => {
      if (!user) return;

      const payload: Partial<TUserProfile> = {
        onboarding_step: {
          ...userProfile.onboarding_step,
          ...steps,
        },
      };

      await updateUserProfile(payload);
    },
    [user, userProfile, updateUserProfile]
  );

  const handleStepChange = useCallback(
    (step: EOnboardingSteps, skipInvites?: boolean) => {
      // Once the user drives the flow themselves, the auto-resolution below must stay out of
      // the way — creating a workspace here makes the workspace list non-empty mid-flow.
      hasUserActedRef.current = true;
      switch (step) {
        case EOnboardingSteps.PROFILE_SETUP:
          if (isSelfManaged) {
            // Skip role & use case steps for self-hosted
            stepChange({ profile_complete: true });
            if (workspacesList.length > 0) finishOnboarding();
            else setCurrentStep(EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN);
          } else {
            setCurrentStep(EOnboardingSteps.ROLE_SETUP);
          }
          break;
        case EOnboardingSteps.ROLE_SETUP:
          setCurrentStep(EOnboardingSteps.USE_CASE_SETUP);
          break;
        case EOnboardingSteps.USE_CASE_SETUP:
          stepChange({ profile_complete: true });
          if (workspacesList.length > 0) finishOnboarding();
          else setCurrentStep(EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN);
          break;
        case EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN:
          if (skipInvites) finishOnboarding();
          else {
            setCurrentStep(EOnboardingSteps.INVITE_MEMBERS);
            stepChange({ workspace_create: true });
          }
          break;
        case EOnboardingSteps.INVITE_MEMBERS:
          stepChange({ workspace_invite: true });
          finishOnboarding();
          break;
      }
    },
    [stepChange, finishOnboarding, workspacesList, isSelfManaged]
  );

  const updateCurrentStep = (step: EOnboardingSteps) => setCurrentStep(step);

  useEffect(() => {
    const onboardingStep = userProfile?.onboarding_step;
    if (!onboardingStep) return;

    // A user who already belongs to a workspace has nothing left to create or join, so
    // onboarding is done. Without this the create/join step is a dead end for them: the invite
    // that got them in has already been consumed, so no invite is listed, and on an instance
    // where the admin restricted workspace creation there is no way forward at all. This runs
    // on every workspace-list update because the list is still being fetched on mount.
    if (
      !hasUserActedRef.current &&
      !hasAutoFinishedRef.current &&
      workspacesList.length > 0 &&
      onboardingStep.profile_complete &&
      !onboardingStep.workspace_create &&
      !onboardingStep.workspace_join
    ) {
      hasAutoFinishedRef.current = true;
      void finishOnboarding();
      return;
    }

    if (hasResolvedInitialStepRef.current) return;
    hasResolvedInitialStepRef.current = true;

    if (onboardingStep.profile_complete && !onboardingStep.workspace_create && !onboardingStep.workspace_join) {
      setCurrentStep(EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN);
    }
    if (onboardingStep.profile_complete && onboardingStep.workspace_create && !onboardingStep.workspace_invite) {
      setCurrentStep(EOnboardingSteps.INVITE_MEMBERS);
    }
  }, [userProfile?.onboarding_step, workspacesList.length, finishOnboarding]);

  return (
    <div className="flex h-full flex-col">
      {/* Header with progress */}
      <OnboardingHeader
        currentStep={currentStep}
        updateCurrentStep={updateCurrentStep}
        hasInvitations={hasInvitations}
      />

      {/* Main content area */}
      <OnboardingStepRoot currentStep={currentStep} invitations={invitations} handleStepChange={handleStepChange} />
    </div>
  );
});
