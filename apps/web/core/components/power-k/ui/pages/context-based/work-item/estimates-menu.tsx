/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Command } from "cmdk";
import { observer } from "mobx-react";
import { Triangle } from "lucide-react";
// plane types
import { useTranslation } from "@plane/i18n";
import { EEstimateSystem } from "@plane/types";
import type { TIssue } from "@plane/types";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
// local imports
import { PowerKModalCommandItem } from "../../../modal/command-item";

type Props = {
  handleSelect: (estimatePointId: string | null) => void;
  workItemDetails: TIssue;
};

export const PowerKWorkItemEstimatesMenu = observer(function PowerKWorkItemEstimatesMenu(props: Props) {
  const { handleSelect, workItemDetails } = props;
  // store hooks
  const { activeEstimateIdsByProjectId, getEstimateById } = useProjectEstimates();
  const projectEstimateIds = workItemDetails.project_id
    ? (activeEstimateIdsByProjectId(workItemDetails.project_id) ?? [])
    : [];
  // translation
  const { t } = useTranslation();
  const estimateOptions = projectEstimateIds.flatMap((estimateId) => {
    const estimate = getEstimateById(estimateId);
    if (!estimate) return [];

    return (estimate.estimatePointIds ?? []).map((estimatePointId) => ({
      estimate,
      estimatePoint: estimate.estimatePointById(estimatePointId),
    }));
  });

  return (
    <Command.Group>
      <PowerKModalCommandItem
        icon={Triangle}
        label={t("project_settings.estimates.no_estimate")}
        isSelected={workItemDetails.estimate_point === null}
        onSelect={() => handleSelect(null)}
      />
      {estimateOptions.length > 0 ? (
        estimateOptions.map(({ estimate, estimatePoint }) => {
          if (!estimatePoint) return null;

          return (
            <PowerKModalCommandItem
              key={estimatePoint.id}
              icon={Triangle}
              label={`${estimate.name ? `${estimate.name}: ` : ""}${
                estimate.type === EEstimateSystem.TIME
                  ? convertMinutesToHoursMinutesString(Number(estimatePoint.value))
                  : estimatePoint.value
              }`}
              isSelected={workItemDetails.estimate_point === estimatePoint.id}
              onSelect={() => handleSelect(estimatePoint.id ?? null)}
            />
          );
        })
      ) : (
        <div className="text-center">No estimate found</div>
      )}
    </Command.Group>
  );
});
