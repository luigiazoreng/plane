/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { IHelpdeskDisplayFilters, THelpdeskGroupBy, THelpdeskOrderBy } from "@plane/types";
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters/header/helpers/dropdown";
import { FilterHeader } from "@/components/issues/issue-layouts/filters/header/helpers/filter-header";
import { FilterOption } from "@/components/issues/issue-layouts/filters/header/helpers/filter-option";

type Props = {
  displayFilters: IHelpdeskDisplayFilters;
  onChange: (data: Partial<IHelpdeskDisplayFilters>) => void;
};

const GROUP_BY_OPTIONS: { value: THelpdeskGroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "portal", label: "Portal" },
  { value: "form", label: "Form" },
  { value: "source", label: "Source" },
  { value: "none", label: "None" },
];

const ORDER_BY_OPTIONS: { value: THelpdeskOrderBy; label: string }[] = [
  { value: "-created_at", label: "Last created" },
  { value: "created_at", label: "First created" },
  { value: "-updated_at", label: "Last updated" },
  { value: "updated_at", label: "First updated" },
  { value: "title", label: "Title (A-Z)" },
];

export function HelpdeskDisplayDropdown(props: Props) {
  const { displayFilters, onChange } = props;
  const [groupPreview, setGroupPreview] = useState(true);
  const [orderPreview, setOrderPreview] = useState(true);

  return (
    <FiltersDropdown title="Display" placement="bottom-end" icon={<SlidersHorizontal className="size-3.5" />}>
      <div className="flex h-full w-full flex-col overflow-hidden p-2.5">
        <div className="vertical-scrollbar flex scrollbar-sm flex-col gap-2 overflow-y-auto">
          {/* Group by */}
          <div>
            <FilterHeader
              title="Group by"
              isPreviewEnabled={groupPreview}
              handleIsPreviewEnabled={() => setGroupPreview((p) => !p)}
            />
            {groupPreview &&
              GROUP_BY_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.value}
                  isChecked={displayFilters.group_by === opt.value}
                  onClick={() => onChange({ group_by: opt.value })}
                  title={opt.label}
                  multiple={false}
                />
              ))}
          </div>

          {/* Order by */}
          <div>
            <FilterHeader
              title="Order by"
              isPreviewEnabled={orderPreview}
              handleIsPreviewEnabled={() => setOrderPreview((p) => !p)}
            />
            {orderPreview &&
              ORDER_BY_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.value}
                  isChecked={displayFilters.order_by === opt.value}
                  onClick={() => onChange({ order_by: opt.value })}
                  title={opt.label}
                  multiple={false}
                />
              ))}
          </div>
        </div>
      </div>
    </FiltersDropdown>
  );
}
