/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { TEstimatePointsObject, TEstimateSystemKeys, TEstimateTypeErrorObject } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Spinner } from "@plane/ui";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";

export type TEstimatePointDelete = {
  workspaceSlug: string;
  projectId: string;
  estimateId: string;
  estimatePointId: string;
  estimatePoints: TEstimatePointsObject[];
  callback: () => void;
  onDeleteSuccess?: () => void;
  estimatePointError?: TEstimateTypeErrorObject | undefined;
  handleEstimatePointError?: (newValue: string, message: string | undefined, mode?: "add" | "delete") => void;
  estimateSystem: TEstimateSystemKeys;
};

export function EstimatePointDelete(props: TEstimatePointDelete) {
  const { workspaceSlug, projectId, estimateId, estimatePointId, callback, onDeleteSuccess } = props;
  const { deleteEstimatePoint } = useEstimate(estimateId);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteEstimatePoint(workspaceSlug, projectId, estimatePointId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Estimate modified",
        message: "The estimate has been updated in your project.",
      });
      onDeleteSuccess?.();
      callback();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Estimate modification failed",
        message: "We were unable to modify the estimate, please try again",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative my-1 flex items-center gap-2 rounded-sm border border-subtle px-2 py-2 text-13">
      <div className="w-full text-secondary">Remove this estimate value?</div>
      <button
        type="button"
        className="rounded-xs px-2 py-1 text-secondary transition-colors hover:bg-layer-1"
        onClick={callback}
        disabled={isDeleting}
      >
        Cancel
      </button>
      <button
        type="button"
        className="bg-danger-primary rounded-xs px-2 py-1 text-white transition-opacity hover:opacity-90 disabled:opacity-70"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? <Spinner className="h-3.5 w-3.5" /> : "Delete"}
      </button>
    </div>
  );
}
