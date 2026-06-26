/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IEstimateFormData, TEstimatePointsObject, TEstimateTypeError } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { EstimatePointCreateRoot } from "@/components/estimates/points";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";

type TUpdateEstimateModal = {
  workspaceSlug: string;
  projectId: string;
  estimateId: string | undefined;
  isOpen: boolean;
  handleClose: () => void;
};

export const UpdateEstimateModal = observer(function UpdateEstimateModal(props: TUpdateEstimateModal) {
  const { workspaceSlug, projectId, estimateId, isOpen, handleClose } = props;
  const { updateEstimate } = useProjectEstimates();
  const { asJson: estimate, estimatePointIds, estimatePointById } = useEstimate(estimateId);
  const [estimateName, setEstimateName] = useState("");
  const [estimatePoints, setEstimatePoints] = useState<TEstimatePointsObject[] | undefined>(undefined);
  const [estimatePointError, setEstimatePointError] = useState<TEstimateTypeError>({});
  const [buttonLoader, setButtonLoader] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const currentEstimatePoints: TEstimatePointsObject[] =
      estimatePointIds?.reduce<TEstimatePointsObject[]>((acc, currentEstimatePointId) => {
        const estimatePoint = estimatePointById(currentEstimatePointId);
        if (!estimatePoint?.key || !estimatePoint.value) return acc;

        acc.push({
          id: estimatePoint.id,
          key: estimatePoint.key,
          value: estimatePoint.value,
        });

        return acc;
      }, []) ?? [];

    setEstimatePoints(currentEstimatePoints);
    setEstimateName(estimate?.name ?? "");
    setEstimatePointError({});
  }, [estimate?.name, estimatePointById, estimatePointIds, isOpen]);

  const handleEstimatePointError = (
    key: number,
    oldValue: string,
    newValue: string,
    message: string | undefined,
    mode: "add" | "delete" = "add"
  ) => {
    setEstimatePointError((prev) => {
      if (mode === "add") {
        return { ...prev, [key]: { oldValue, newValue, message } };
      }

      const newError = { ...prev };
      delete newError[key];
      return newError;
    });
  };

  const validateEstimatePointError = () => {
    let estimateError = false;
    if (!estimatePointError) return estimateError;

    Object.keys(estimatePointError).forEach((key) => {
      const currentKey = Number(key);
      if (
        estimatePointError[currentKey]?.oldValue !== estimatePointError[currentKey]?.newValue ||
        estimatePointError[currentKey]?.newValue === "" ||
        estimatePointError[currentKey]?.message
      ) {
        estimateError = true;
      }
    });

    return estimateError;
  };

  const handleUpdateEstimate = async () => {
    if (!workspaceSlug || !projectId || !estimateId || !estimate?.type || !estimatePoints) return;
    const trimmedEstimateName = estimateName.trim();
    if (!trimmedEstimateName) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Estimate name is required.",
      });
      return;
    }

    if (validateEstimatePointError()) {
      setEstimatePointError((prev) => {
        const newError = { ...prev };
        Object.keys(newError || {}).forEach((key) => {
          const currentKey = Number(key);
          if (
            newError[currentKey]?.newValue !== "" &&
            newError[currentKey]?.oldValue === newError[currentKey]?.newValue
          ) {
            delete newError[currentKey];
          } else {
            newError[currentKey].message =
              newError[currentKey].message || "Estimate can't be empty. Enter a value in each field or remove it.";
          }
        });
        return newError;
      });
      return;
    }

    try {
      setButtonLoader(true);
      const payload: IEstimateFormData = {
        estimate: {
          name: trimmedEstimateName,
          type: estimate.type,
        },
        estimate_points: estimatePoints.map((estimatePoint, index) => ({
          id: estimatePoint.id,
          key: index + 1,
          value: estimatePoint.value,
        })),
      };
      await updateEstimate(workspaceSlug, projectId, estimateId, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Estimate modified",
        message: "The estimate has been updated in your project.",
      });
      handleClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Estimate modification failed",
        message: "We were unable to modify the estimate, please try again",
      });
    } finally {
      setButtonLoader(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="relative space-y-6 py-5">
        <div className="relative flex items-center justify-between gap-2 px-5">
          <div className="text-18 font-medium text-primary">Edit estimate system</div>
        </div>

        <div className="space-y-5 px-5">
          <div className="space-y-1.5">
            <label className="text-13 font-medium text-secondary" htmlFor="edit-estimate-name">
              Estimate name
            </label>
            <Input
              id="edit-estimate-name"
              value={estimateName}
              onChange={(e) => setEstimateName(e.target.value)}
              placeholder="Estimate name"
              maxLength={255}
            />
          </div>
          {estimate?.type && estimatePoints && (
            <EstimatePointCreateRoot
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              estimateId={estimateId}
              estimateType={estimate.type}
              estimatePoints={estimatePoints}
              setEstimatePoints={setEstimatePoints}
              estimatePointError={estimatePointError}
              handleEstimatePointError={handleEstimatePointError}
            />
          )}
        </div>

        <div className="relative flex items-center justify-end gap-3 border-t border-subtle px-5 pt-5">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={buttonLoader}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={handleUpdateEstimate} disabled={buttonLoader}>
            {buttonLoader ? "Saving" : "Save changes"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
