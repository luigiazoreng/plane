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

export type TEstimateMenuSelection = { propertyId: string; estimatePointId: string | null };

type Props = {
  handleSelect: (selection: TEstimateMenuSelection) => void;
  workItemDetails: TIssue;
};

export const PowerKWorkItemEstimatesMenu = observer(function PowerKWorkItemEstimatesMenu(props: Props) {
  const { handleSelect, workItemDetails } = props;
  // store hooks
  const {
    getEstimateById,
    activeEstimatePropertyIdsByProjectId,
    estimateSystemPropertyIdsByProjectId,
    estimatePropertyById,
    issueEstimatePropertyValueFor,
  } = useProjectEstimates();
  const estimateSystemPropertyIds = workItemDetails.project_id
    ? estimateSystemPropertyIdsByProjectId(workItemDetails.project_id) ?? []
    : [];
  const estimatePropertyIds = workItemDetails.project_id
    ? activeEstimatePropertyIdsByProjectId(workItemDetails.project_id) ?? []
    : [];
  // translation
  const { t } = useTranslation();

  return (
    <>
      {estimateSystemPropertyIds.map((propertyId) => {
        const property = estimatePropertyById(propertyId);
        if (!property) return null;
        const estimate = getEstimateById(property.estimate);
        if (!estimate) return null;
        const currentValue = issueEstimatePropertyValueFor(workItemDetails.id, propertyId)?.estimate_point ?? null;
        const estimatePoints = (estimate.estimatePointIds ?? [])
          .map((estimatePointId) => estimate.estimatePointById(estimatePointId))
          .filter((point): point is NonNullable<typeof point> => !!point);

        return (
          <Command.Group key={propertyId} heading={estimate.name}>
            <PowerKModalCommandItem
              icon={Triangle}
              label={t("project_settings.estimates.no_estimate")}
              isSelected={currentValue === null}
              onSelect={() => handleSelect({ propertyId, estimatePointId: null })}
            />
            {estimatePoints.length > 0 ? (
              estimatePoints.map((estimatePoint) => (
                <PowerKModalCommandItem
                  key={estimatePoint.id}
                  icon={Triangle}
                  label={
                    estimate.type === EEstimateSystem.TIME
                      ? convertMinutesToHoursMinutesString(Number(estimatePoint.value))
                      : (estimatePoint.value ?? "")
                  }
                  isSelected={currentValue === estimatePoint.id}
                  onSelect={() => handleSelect({ propertyId, estimatePointId: estimatePoint.id ?? null })}
                />
              ))
            ) : (
              <div className="text-center">No estimate found</div>
            )}
          </Command.Group>
        );
      })}
      {estimatePropertyIds.map((propertyId) => {
        const property = estimatePropertyById(propertyId);
        if (!property) return null;
        const estimate = getEstimateById(property.estimate);
        if (!estimate) return null;
        const currentValue = issueEstimatePropertyValueFor(workItemDetails.id, propertyId)?.estimate_point ?? null;
        const estimatePoints = (estimate.estimatePointIds ?? [])
          .map((estimatePointId) => estimate.estimatePointById(estimatePointId))
          .filter((point): point is NonNullable<typeof point> => !!point);

        return (
          <Command.Group key={propertyId} heading={property.name}>
            <PowerKModalCommandItem
              icon={Triangle}
              label={t("project_settings.estimates.no_estimate")}
              isSelected={currentValue === null}
              onSelect={() => handleSelect({ propertyId, estimatePointId: null })}
            />
            {estimatePoints.length > 0 ? (
              estimatePoints.map((estimatePoint) => (
                <PowerKModalCommandItem
                  key={estimatePoint.id}
                  icon={Triangle}
                  label={
                    estimate.type === EEstimateSystem.TIME
                      ? convertMinutesToHoursMinutesString(Number(estimatePoint.value))
                      : (estimatePoint.value ?? "")
                  }
                  isSelected={currentValue === estimatePoint.id}
                  onSelect={() => handleSelect({ propertyId, estimatePointId: estimatePoint.id ?? null })}
                />
              ))
            ) : (
              <div className="text-center">No estimate found</div>
            )}
          </Command.Group>
        );
      })}
    </>
  );
});
