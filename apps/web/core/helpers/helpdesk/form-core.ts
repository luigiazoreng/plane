import type {
  IHelpdeskAutoAssignmentConfig,
  IHelpdeskFieldType,
  IHelpdeskFormField,
  IHelpdeskPortal,
} from "@plane/types";
import { RectangleHorizontal, SquareCheck } from "lucide-react";

export const HELPDESK_CUSTOM_FIELD_TYPES: {
  type: IHelpdeskFieldType;
  label: string;
  icon: typeof RectangleHorizontal;
}[] = [
  { type: "short_text", label: "Short text", icon: RectangleHorizontal },
  { type: "long_text", label: "Long text", icon: RectangleHorizontal },
  { type: "select", label: "Dropdown", icon: RectangleHorizontal },
  { type: "checkbox", label: "Checkbox", icon: SquareCheck },
  { type: "date", label: "Date", icon: RectangleHorizontal },
];

export const getNormalizedHelpdeskAutoAssignmentConfig = (portal: IHelpdeskPortal): IHelpdeskAutoAssignmentConfig => ({
  version: typeof portal.auto_assignment_config?.version === "number" ? portal.auto_assignment_config.version : 1,
  member_ids: Array.isArray(portal.auto_assignment_config?.member_ids) ? portal.auto_assignment_config.member_ids : [],
  active_status_ids: Array.isArray(portal.auto_assignment_config?.active_status_ids)
    ? portal.auto_assignment_config.active_status_ids
    : [],
  capacity_limit:
    typeof portal.auto_assignment_config?.capacity_limit === "number"
      ? portal.auto_assignment_config.capacity_limit
      : null,
  round_robin_last_assignee_id:
    typeof portal.auto_assignment_config?.round_robin_last_assignee_id === "string"
      ? portal.auto_assignment_config.round_robin_last_assignee_id
      : null,
});

export const createHelpdeskFieldDraft = (
  fieldType: IHelpdeskFieldType,
  selectedFormFields: IHelpdeskFormField[]
): Partial<IHelpdeskFormField> => {
  const nextIndex = selectedFormFields.length + 1;

  return {
    key: `${fieldType}-${nextIndex}`.replace(/_/g, "-"),
    label: `New ${fieldType.replace("_", " ")}`,
    field_type: fieldType,
    sequence: (selectedFormFields.at(-1)?.sequence ?? 0) + 10000,
    required: false,
    options: fieldType === "select" ? [{ label: "Option 1", value: "option-1" }] : [],
    validation: {},
    ui_props: {},
    is_system: false,
  };
};
