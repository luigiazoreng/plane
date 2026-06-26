/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// local imports
import { EstimateListItem } from "./estimate-list-item";

type TEstimateList = {
  estimateIds: string[] | undefined;
  activeEstimateId?: string;
  isAdmin: boolean;
  isEstimateEnabled?: boolean;
  isEditable?: boolean;
  onEditClick?: (estimateId: string) => void;
  onDeleteClick?: (estimateId: string) => void;
  onSetActiveClick?: (estimateId: string) => void;
  onToggleActiveClick?: (estimateId: string, isActive: boolean) => void;
};

export const EstimateList = observer(function EstimateList(props: TEstimateList) {
  const {
    estimateIds,
    activeEstimateId,
    isAdmin,
    isEstimateEnabled = false,
    isEditable = false,
    onEditClick,
    onDeleteClick,
    onSetActiveClick,
    onToggleActiveClick,
  } = props;

  if (!estimateIds || estimateIds?.length <= 0) return <></>;
  return (
    <div>
      {estimateIds &&
        estimateIds.map((estimateId) => (
          <EstimateListItem
            key={estimateId}
            estimateId={estimateId}
            isAdmin={isAdmin}
            isEstimateEnabled={isEstimateEnabled}
            isActive={estimateId === activeEstimateId}
            isEditable={isEditable}
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
            onSetActiveClick={onSetActiveClick}
            onToggleActiveClick={onToggleActiveClick}
          />
        ))}
    </div>
  );
});
