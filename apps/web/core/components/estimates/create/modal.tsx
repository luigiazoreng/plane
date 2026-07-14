/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EEstimateSystem, ESTIMATE_SYSTEMS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronLeftIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IEstimateFormData, TEstimateSystemKeys, TEstimatePointsObject, TEstimateTypeError } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
// local imports
import { EstimatePointCreateRoot } from "../points";
import { EstimateCreateStageOne } from "./stage-one";

type TCreateEstimateModal = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  handleClose: () => void;
};

export const CreateEstimateModal = observer(function CreateEstimateModal(props: TCreateEstimateModal) {
  // props
  const { workspaceSlug, projectId, isOpen, handleClose } = props;
  // hooks
  const { createEstimate } = useProjectEstimates();
  const { t } = useTranslation();
  // states
  const [estimateSystem, setEstimateSystem] = useState<TEstimateSystemKeys>(EEstimateSystem.POINTS);
  const [estimateName, setEstimateName] = useState(ESTIMATE_SYSTEMS[EEstimateSystem.POINTS].name);
  const [estimatePoints, setEstimatePoints] = useState<TEstimatePointsObject[] | undefined>(undefined);
  const [estimatePointError, setEstimatePointError] = useState<TEstimateTypeError>(undefined);
  const [buttonLoader, setButtonLoader] = useState(false);

  const handleUpdatePoints = (newPoints: TEstimatePointsObject[] | undefined) => setEstimatePoints(newPoints);

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
      } else {
        const newError = { ...prev };
        delete newError[key];
        return newError;
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      setEstimateSystem(EEstimateSystem.POINTS);
      setEstimateName(ESTIMATE_SYSTEMS[EEstimateSystem.POINTS].name);
      setEstimatePoints(undefined);
      setEstimatePointError({});
    }
  }, [isOpen]);

  const handleEstimateSystem = (system: TEstimateSystemKeys) => {
    setEstimateSystem(system);
    setEstimateName(ESTIMATE_SYSTEMS[system]?.name ?? "");
  };

  const validateEstimatePointError = () => {
    let estimateError = false;
    if (!estimatePointError) return estimateError;

    Object.keys(estimatePointError || {}).forEach((key) => {
      const currentKey = key as unknown as number;
      if (
        estimatePointError[currentKey]?.oldValue != estimatePointError[currentKey]?.newValue ||
        estimatePointError[currentKey]?.newValue === "" ||
        estimatePointError[currentKey]?.message
      ) {
        estimateError = true;
      }
    });

    return estimateError;
  };

  const handleCreateEstimate = async () => {
    if (!validateEstimatePointError()) {
      try {
        if (!workspaceSlug || !projectId || !estimatePoints) return;
        const trimmedEstimateName = estimateName.trim();
        if (!trimmedEstimateName) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error",
            message: "Estimate name is required.",
          });
          return;
        }
        setButtonLoader(true);
        const payload: IEstimateFormData = {
          estimate: {
            name: trimmedEstimateName,
            type: estimateSystem,
            // Don't force this estimate active: a project's first-ever estimate
            // is auto-activated by the backend regardless, but a second (or
            // later) estimate might be a KPI-only lookup table (see
            // KpiConfig.difficulty_estimate/repetitive_estimate, which don't
            // require last_used) that shouldn't silently replace the project's
            // current active numeric estimate. Admins can still explicitly
            // activate it via "Set default" in the estimates list.
            last_used: false,
          },
          estimate_points: estimatePoints,
        };
        await createEstimate(workspaceSlug, projectId, payload);
        setButtonLoader(false);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_settings.estimates.toasts.created.success.title"),
          message: t("project_settings.estimates.toasts.created.success.message"),
        });
        handleClose();
      } catch {
        setButtonLoader(false);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("project_settings.estimates.toasts.created.error.title"),
          message: t("project_settings.estimates.toasts.created.error.message"),
        });
      }
    } else {
      setEstimatePointError((prev) => {
        const newError = { ...prev };
        Object.keys(newError || {}).forEach((key) => {
          const currentKey = key as unknown as number;
          if (
            newError[currentKey]?.newValue != "" &&
            newError[currentKey]?.oldValue === newError[currentKey]?.newValue
          ) {
            delete newError[currentKey];
          } else {
            newError[currentKey].message =
              newError[currentKey].message || t("project_settings.estimates.validation.remove_empty");
          }
        });
        return newError;
      });
    }
  };

  // derived values
  const renderEstimateStepsCount = useMemo(() => (estimatePoints ? "2" : "1"), [estimatePoints]);
  // const isEstimatePointError = useMemo(() => {
  //   if (!estimatePointError) return false;
  //   return Object.keys(estimatePointError).length > 0;
  // }, [estimatePointError]);

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="relative space-y-6 py-5">
        {/* heading */}
        <div className="relative flex items-center justify-between gap-2 px-5">
          <div className="relative flex items-center gap-1">
            {estimatePoints && (
              <button
                type="button"
                onClick={() => {
                  handleUpdatePoints(undefined);
                }}
                className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            )}
            <div className="text-18 font-medium text-primary">{t("project_settings.estimates.new")}</div>
          </div>
          <div className="text-gray-400 text-11">
            {t("project_settings.estimates.create.step", {
              step: renderEstimateStepsCount,
              total: 2,
            })}
          </div>
        </div>

        {/* estimate steps */}
        <div className="space-y-5 px-5">
          <div className="space-y-1.5">
            <label className="text-13 font-medium text-secondary" htmlFor="estimate-name">
              Estimate name
            </label>
            <Input
              id="estimate-name"
              value={estimateName}
              onChange={(e) => setEstimateName(e.target.value)}
              placeholder="Estimate name"
              maxLength={255}
            />
          </div>
          {!estimatePoints && (
            <EstimateCreateStageOne
              estimateSystem={estimateSystem}
              handleEstimateSystem={handleEstimateSystem}
              handleEstimatePoints={(templateType: string) =>
                handleUpdatePoints(ESTIMATE_SYSTEMS[estimateSystem].templates[templateType].values)
              }
            />
          )}
          {estimatePoints && (
            <EstimatePointCreateRoot
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              estimateId={undefined}
              estimateType={estimateSystem}
              estimatePoints={estimatePoints}
              setEstimatePoints={setEstimatePoints}
              estimatePointError={estimatePointError}
              handleEstimatePointError={handleEstimatePointError}
            />
          )}
          {/* {isEstimatePointError && (
            <div className="pt-5 text-13 text-danger-primary">
              Estimate points can&apos;t be empty. Enter a value in each field or remove those you don&apos;t have
              values for.
            </div>
          )} */}
        </div>

        <div className="relative flex items-center justify-end gap-3 border-t border-subtle px-5 pt-5">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={buttonLoader}>
            {t("common.cancel")}
          </Button>
          {estimatePoints && (
            <Button variant="primary" size="lg" onClick={handleCreateEstimate} disabled={buttonLoader}>
              {buttonLoader ? t("common.creating") : t("project_settings.estimates.create.label")}
            </Button>
          )}
        </div>
      </div>
    </ModalCore>
  );
});
