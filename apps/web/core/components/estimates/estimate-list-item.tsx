/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EEstimateSystem } from "@plane/constants";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";
// plane web imports
import { EstimateListItemButtons } from "@/plane-web/components/estimates";

type TEstimateListItem = {
  estimateId: string;
  isAdmin: boolean;
  isEstimateEnabled: boolean;
  isActive?: boolean;
  isEditable: boolean;
  onEditClick?: (estimateId: string) => void;
  onDeleteClick?: (estimateId: string) => void;
  onSetActiveClick?: (estimateId: string) => void;
  onToggleActiveClick?: (estimateId: string, isActive: boolean) => void;
};

export const EstimateListItem = observer(function EstimateListItem(props: TEstimateListItem) {
  const { estimateId, isActive } = props;
  // store hooks
  const { estimateById } = useProjectEstimates();
  const { estimatePointIds, estimatePointById } = useEstimate(estimateId);
  const currentEstimate = estimateById(estimateId);
  // derived values
  const estimatePointValues = estimatePointIds?.map((estimatePointId) => {
    const estimatePoint = estimatePointById(estimatePointId);
    if (estimatePoint) return estimatePoint.value;
  });

  if (!currentEstimate) return null;

  const isEstimateActive = Boolean(currentEstimate.last_used);

  return (
    <SettingsBoxedControlItem
      title={
        <span className="flex items-center gap-2">
          <span>{currentEstimate.name}</span>
          {isEstimateActive ? (
            <span className="bg-success-subtle text-success-primary rounded px-1.5 py-0.5 text-11 font-medium">Active</span>
          ) : (
            <span className="bg-layer-2 text-placeholder rounded px-1.5 py-0.5 text-11 font-medium">
              Inactive
            </span>
          )}
          {isActive && (
            <span className="bg-accent-subtle text-accent-primary rounded px-1.5 py-0.5 text-11 font-medium">
              Default
            </span>
          )}
        </span>
      }
      description={estimatePointValues
        ?.map((estimatePointValue) => {
          if (currentEstimate.type === EEstimateSystem.TIME) {
            return convertMinutesToHoursMinutesString(Number(estimatePointValue));
          }
          return estimatePointValue;
        })
        .join(", ")}
      control={<EstimateListItemButtons {...props} isEstimateActive={isEstimateActive} />}
    />
  );
});
