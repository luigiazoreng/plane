/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon, EstimatePropertyIcon, ChevronDownIcon } from "@plane/propel/icons";
import { EEstimateSystem } from "@plane/types";
import { ComboDropDown } from "@plane/ui";
import { convertMinutesToHoursMinutesString, cn } from "@plane/utils";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";
import { useDropdown } from "@/hooks/use-dropdown";
// components
import { DropdownButton } from "./buttons";
import { BUTTON_VARIANTS_WITH_TEXT } from "./constants";
// types
import type { TDropdownProps } from "./types";

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  onChange: (val: string | undefined) => void;
  onClose?: () => void;
  estimateId?: string;
  projectId: string | undefined;
  value: string | undefined | null;
  renderByDefault?: boolean;
};

type DropdownOptions =
  | {
      value: string | null;
      query: string;
      content: React.ReactNode;
    }[]
  | undefined;

export const EstimateDropdown = observer(function EstimateDropdown(props: Props) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    estimateId,
    hideIcon = false,
    onChange,
    onClose,
    placeholder = "",
    placement,
    projectId,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
  } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const {
    areEstimateEnabledByProjectId,
    activeEstimateIdsByProjectId,
    currentActiveEstimateIdByProjectId,
    estimateByEstimatePointId,
    estimatePointById: projectEstimatePointById,
    getProjectEstimates,
    getEstimateById,
  } = useProjectEstimates();
  const isSpecificEstimateMode = !!estimateId;
  const resolvedEstimateId = estimateId ?? (projectId ? currentActiveEstimateIdByProjectId(projectId) : undefined);
  const projectEstimateIds = projectId ? (activeEstimateIdsByProjectId(projectId) ?? []) : [];
  const isEstimateEnabled = isSpecificEstimateMode
    ? !!resolvedEstimateId
    : projectId
      ? areEstimateEnabledByProjectId(projectId)
      : false;
  const { estimatePointIds, estimatePointById } = useEstimate(resolvedEstimateId);

  const currentActiveEstimate = resolvedEstimateId ? getEstimateById(resolvedEstimateId) : undefined;

  const formatEstimateValue = (estimate: typeof currentActiveEstimate, valueToFormat: string | undefined) =>
    estimate?.type === EEstimateSystem.TIME ? convertMinutesToHoursMinutesString(Number(valueToFormat)) : valueToFormat;

  const options: DropdownOptions = (
    isSpecificEstimateMode
      ? (estimatePointIds ?? [])
          ?.map((estimatePoint) => {
            const currentEstimatePoint = estimatePointById(estimatePoint);
            if (!currentEstimatePoint) return undefined;

            return {
              value: currentEstimatePoint.id,
              query: `${currentEstimatePoint?.value}`,
              content: (
                <div className="flex items-center gap-2">
                  <EstimatePropertyIcon className="h-3 w-3 flex-shrink-0" />
                  <span className="flex-grow truncate">
                    {formatEstimateValue(currentActiveEstimate, currentEstimatePoint.value)}
                  </span>
                </div>
              ),
            };
          })
          .filter((estimatePointDropdownOption) => estimatePointDropdownOption != undefined)
      : projectEstimateIds.flatMap((projectEstimateId) => {
          const estimate = getEstimateById(projectEstimateId);
          if (!estimate) return [];

          return (estimate.estimatePointIds ?? [])
            .map((estimatePointId) => {
              const estimatePoint = estimate.estimatePointById(estimatePointId);
              if (!estimatePoint) return undefined;

              const formattedValue = formatEstimateValue(estimate, estimatePoint.value);

              return {
                value: estimatePoint.id,
                query: `${estimate.name ?? ""} ${estimatePoint.value ?? ""}`,
                content: (
                  <div className="flex min-w-0 items-center gap-2">
                    <EstimatePropertyIcon className="h-3 w-3 flex-shrink-0" />
                    <span className="min-w-0 flex-grow truncate">{formattedValue}</span>
                    <span className="text-custom-text-400 max-w-20 flex-shrink-0 truncate">{estimate.name}</span>
                  </div>
                ),
              };
            })
            .filter((estimatePointDropdownOption) => estimatePointDropdownOption != undefined);
        })
  ) as DropdownOptions;
  options?.unshift({
    value: null,
    query: t("project_settings.estimates.no_estimate"),
    content: (
      <div className="flex items-center gap-2">
        <EstimatePropertyIcon className="h-3 w-3 flex-shrink-0" />
        <span className="flex-grow truncate">{t("project_settings.estimates.no_estimate")}</span>
      </div>
    ),
  });

  const filteredOptions =
    query === "" ? options : options?.filter((o) => o.query.toLowerCase().includes(query.toLowerCase()));

  const selectedEstimatePoint =
    value && estimatePointById
      ? isSpecificEstimateMode
        ? estimatePointById(value)
        : projectEstimatePointById(value, projectId)
      : undefined;
  const selectedEstimate = value
    ? isSpecificEstimateMode
      ? currentActiveEstimate
      : estimateByEstimatePointId(value, projectId)
    : undefined;

  const onOpen = async () => {
    if (
      workspaceSlug &&
      projectId &&
      (projectEstimateIds.length === 0 || (resolvedEstimateId && !getEstimateById(resolvedEstimateId)))
    )
      await getProjectEstimates(workspaceSlug.toString(), projectId);
  };

  const { handleClose, handleKeyDown, handleOnClick, searchInputKeyDown } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    onOpen,
    query,
    setIsOpen,
    setQuery,
  });

  const dropdownOnChange = (val: string | undefined) => {
    onChange(val);
    handleClose();
  };

  const comboButton = (
    <>
      {button ? (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn("clickable block h-full w-full outline-none", buttonContainerClassName)}
          onClick={handleOnClick}
          disabled={disabled}
        >
          {button}
        </button>
      ) : (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn(
            "clickable block h-full max-w-full outline-none",
            {
              "cursor-not-allowed text-secondary": disabled,
              "cursor-pointer": !disabled,
            },
            buttonContainerClassName
          )}
          onClick={handleOnClick}
          disabled={disabled}
        >
          <DropdownButton
            className={buttonClassName}
            isActive={isOpen}
            tooltipHeading={t("project_settings.estimates.label")}
            tooltipContent={
              selectedEstimatePoint
                ? `${selectedEstimate?.name ? `${selectedEstimate.name}: ` : ""}${selectedEstimatePoint.value}`
                : placeholder
            }
            showTooltip={showTooltip}
            variant={buttonVariant}
            renderToolTipByDefault={renderByDefault}
          >
            {!hideIcon && <EstimatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
            {(selectedEstimatePoint || placeholder) && BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (
              <span className="truncate">
                {selectedEstimatePoint ? (
                  isSpecificEstimateMode ? (
                    formatEstimateValue(selectedEstimate, selectedEstimatePoint.value)
                  ) : (
                    `${selectedEstimate?.name ? `${selectedEstimate.name}: ` : ""}${formatEstimateValue(
                      selectedEstimate,
                      selectedEstimatePoint.value
                    )}`
                  )
                ) : (
                  <span className="text-placeholder">{placeholder}</span>
                )}
              </span>
            )}
            {dropdownArrow && (
              <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
            )}
          </DropdownButton>
        </button>
      )}
    </>
  );

  return (
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("h-full w-full", className)}
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && (
        <Combobox.Options className="fixed z-10" static>
          <div
            className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search.placeholder")}
                displayValue={(assigned: any) => assigned?.name}
                onKeyDown={searchInputKeyDown}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              {!isEstimateEnabled ? (
                <div
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 text-secondary select-none`}
                >
                  {/* NOTE: This condition renders when estimates are not enabled for the project */}
                  <div className="flex flex-grow items-center gap-2">
                    <EstimatePropertyIcon className="h-3 w-3 flex-shrink-0" />
                    <span className="flex-grow truncate">{t("project_settings.estimates.no_estimate")}</span>
                  </div>
                </div>
              ) : (
                <>
                  {filteredOptions ? (
                    filteredOptions.length > 0 ? (
                      filteredOptions.map((option) => (
                        <Combobox.Option key={option.value} value={option.value}>
                          {({ active, selected }) => (
                            <div
                              className={cn(
                                "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                                {
                                  "bg-layer-transparent-hover": active,
                                  "text-primary": selected,
                                  "text-secondary": !selected,
                                }
                              )}
                            >
                              <span className="flex-grow truncate">{option.content}</span>
                              {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                            </div>
                          )}
                        </Combobox.Option>
                      ))
                    ) : (
                      <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matching_results")}</p>
                    )
                  ) : (
                    <p className="px-1.5 py-1 text-placeholder italic">{t("common.loading")}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
});
