/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PROJECT_SETTINGS_TRACKER_ELEMENTS } from "@plane/constants";
import { EditIcon, TrashIcon } from "@plane/propel/icons";
import { ToggleSwitch } from "@plane/ui";

type TEstimateListItem = {
  estimateId: string;
  isAdmin: boolean;
  isEstimateEnabled: boolean;
  isActive?: boolean;
  isEstimateActive?: boolean;
  isEditable: boolean;
  onEditClick?: (estimateId: string) => void;
  onDeleteClick?: (estimateId: string) => void;
  onSetActiveClick?: (estimateId: string) => void;
  onToggleActiveClick?: (estimateId: string, isActive: boolean) => void;
};

export const EstimateListItemButtons = observer(function EstimateListItemButtons(props: TEstimateListItem) {
  const {
    estimateId,
    isAdmin,
    isActive,
    isEstimateActive = false,
    isEditable,
    onEditClick,
    onDeleteClick,
    onSetActiveClick,
    onToggleActiveClick,
  } = props;

  if (!isAdmin || !isEditable) return <></>;
  return (
    <div className="relative flex items-center gap-2">
      <ToggleSwitch
        value={isEstimateActive}
        onChange={(value) => onToggleActiveClick?.(estimateId, value)}
        label="Toggle estimate active"
        disabled={!isAdmin || !isEditable}
        size="sm"
      />
      {!isActive && (
        <button
          className="text-tertiary hover:text-primary relative flex h-6 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm px-2 text-11 transition-colors hover:bg-layer-1"
          onClick={() => onSetActiveClick && onSetActiveClick(estimateId)}
          data-ph-element={PROJECT_SETTINGS_TRACKER_ELEMENTS.ESTIMATES_LIST_ITEM}
        >
          Set default
        </button>
      )}
      <button
        className="relative flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm transition-colors hover:bg-layer-1"
        onClick={() => onEditClick && onEditClick(estimateId)}
        data-ph-element={PROJECT_SETTINGS_TRACKER_ELEMENTS.ESTIMATES_LIST_ITEM}
      >
        <EditIcon width={12} height={12} />
      </button>
      <button
        className="relative flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm transition-colors hover:bg-layer-1"
        onClick={() => onDeleteClick && onDeleteClick(estimateId)}
        data-ph-element={PROJECT_SETTINGS_TRACKER_ELEMENTS.ESTIMATES_LIST_ITEM}
      >
        <TrashIcon width={12} height={12} />
      </button>
    </div>
  );
});
