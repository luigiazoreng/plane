/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// editor
import type { TEmbedConfig } from "@plane/editor";
// plane types
import type { TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
// plane web components
import { IssueEmbedUpgradeCard } from "@/plane-web/components/pages";

export type TIssueEmbedHookProps = {
  fetchEmbedSuggestions?: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  projectId?: string;
  workspaceSlug?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useIssueEmbed = (props: TIssueEmbedHookProps) => {
  const { projectId, workspaceSlug } = props;
  const widgetCallback = ({
    issueId,
    projectId: embeddedProjectId,
    workspaceSlug: embeddedWorkspaceSlug,
  }: {
    issueId: string;
    projectId: string | undefined;
    workspaceSlug: string | undefined;
  }) => (
    <IssueEmbedUpgradeCard
      issueId={issueId}
      projectId={embeddedProjectId ?? projectId}
      workspaceSlug={embeddedWorkspaceSlug ?? workspaceSlug}
    />
  );

  const issueEmbedProps: TEmbedConfig["issue"] = {
    widgetCallback,
  };

  return {
    issueEmbedProps,
  };
};
