import type {
  IHelpdeskAutoAssignmentConfig,
  IHelpdeskFieldType,
  IHelpdeskFormField,
  IHelpdeskPortal,
} from "@plane/types";
import { Calendar, ChevronDown, ListTree, RectangleHorizontal, SquareCheck } from "lucide-react";

export const HELPDESK_CUSTOM_FIELD_TYPES: {
  type: IHelpdeskFieldType;
  label: string;
  icon: typeof RectangleHorizontal;
}[] = [
  { type: "short_text", label: "Short text", icon: RectangleHorizontal },
  { type: "long_text", label: "Long text", icon: RectangleHorizontal },
  { type: "select", label: "Dropdown", icon: ChevronDown },
  { type: "cascade_select", label: "Cascading dropdown", icon: ListTree },
  { type: "checkbox", label: "Checkbox", icon: SquareCheck },
  { type: "date", label: "Date", icon: Calendar },
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
    label: `New ${fieldType.replace(/_/g, " ")}`,
    field_type: fieldType,
    sequence: (selectedFormFields.at(-1)?.sequence ?? 0) + 10000,
    required: false,
    options: fieldType === "select" ? [{ label: "Option 1", value: "option-1" }] : [],
    validation: {},
    ui_props: {},
    is_system: false,
    parent_field_key: "",
  };
};

/**
 * Renders a ticket_id_pattern with current date and a sample counter for preview purposes.
 * Tokens: YYYY, YY, MM, DD, ###.. (any number of #)
 */
export const previewTicketIdPattern = (pattern: string, counter = 1): string => {
  if (!pattern) return "";
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let result = pattern.replace(/YYYY/g, yyyy).replace(/YY/g, yy).replace(/MM/g, mm).replace(/DD/g, dd);

  result = result.replace(/#+/g, (match) => String(counter).padStart(match.length, "0"));

  return result;
};
