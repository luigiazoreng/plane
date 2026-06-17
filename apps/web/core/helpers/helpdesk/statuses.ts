import type { IHelpdeskAutoAssignmentConfig, IHelpdeskRequest, IHelpdeskStatus } from "@plane/types";

const HELP_DESK_FALLBACK_INACTIVE_NAMES = ["resolved", "closed"];

export const getHelpdeskActiveStatusIds = (
  statuses: IHelpdeskStatus[],
  config?: Partial<IHelpdeskAutoAssignmentConfig> | null
): string[] => {
  const configuredIds = Array.isArray(config?.active_status_ids) ? config.active_status_ids.filter(Boolean) : [];
  if (configuredIds.length > 0) {
    return statuses.filter((status) => configuredIds.includes(status.id)).map((status) => status.id);
  }

  return statuses
    .filter((status) => !HELP_DESK_FALLBACK_INACTIVE_NAMES.some((name) => status.name.toLowerCase().includes(name)))
    .map((status) => status.id);
};

export const isHelpdeskRequestActive = (
  request: IHelpdeskRequest,
  statuses: IHelpdeskStatus[],
  config?: Partial<IHelpdeskAutoAssignmentConfig> | null
): boolean => {
  if (!request.status) return true;
  return getHelpdeskActiveStatusIds(statuses, config).includes(request.status);
};
