/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type {
  IHelpdeskCustomerStats,
  IHelpdeskPortal,
  IHelpdeskRequest,
  IHelpdeskRequestIntakeIssue,
  IHelpdeskRequestIssue,
  IHelpdeskStatus,
  IHelpdeskTeam,
  TIssue,
  TIssuePriorities,
} from "@plane/types";
import { Popover } from "@headlessui/react";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { cn, generateWorkItemLink } from "@plane/utils";
import { ArrowUpRight, ChevronDown, ExternalLink, Plus, X } from "lucide-react";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { INTAKE_STATUS_META } from "@/components/helpdesk/intake-status";
import { HelpdeskStatusPill } from "@/components/helpdesk/status-pill";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import {
  getCustomerStats as getFallbackCustomerStats,
  getRequestChannel,
  getRequestClassification,
  getRequestPriority,
  getRequestSla,
  getRequestTags,
  getRequestTeam,
} from "./adapters";

type TDetailPanelProps = {
  workspaceSlug: string;
  request: IHelpdeskRequest;
  statusMap: Record<string, IHelpdeskStatus>;
  portal: IHelpdeskPortal | undefined;
  customerStats?: IHelpdeskCustomerStats | null;
  onAssigneesChange: (assignees: string[]) => void;
  onPriorityChange: (priority: TIssuePriorities) => void;
  teams?: IHelpdeskTeam[];
  onTeamChange?: (teamId: string | null) => void;
  intakeLinks: IHelpdeskRequestIntakeIssue[];
  isLoadingIntakeLinks: boolean;
  onForward: () => void;
  onUnlinkIntake: (linkId: string) => void;
  linkedIssues: IHelpdeskRequestIssue[];
  isLoadingLinkedIssues: boolean;
  unresolvedLinkedIssueIds: string[];
  onAddLinkedIssue: () => void;
  onUnlinkIssue: (requestIssueId: string) => void;
  getIssueById: (issueId: string) => TIssue | undefined;
  getProjectIdentifierById: (projectId: string | null | undefined) => string | undefined;
  getProjectById: (projectId: string) => { name?: string; identifier?: string } | undefined;
};

export function DetailPanel({
  workspaceSlug,
  request,
  statusMap,
  portal,
  customerStats: customerStatsProp,
  onAssigneesChange,
  onPriorityChange,
  teams = [],
  onTeamChange,
  intakeLinks,
  isLoadingIntakeLinks,
  onForward,
  onUnlinkIntake,
  linkedIssues,
  isLoadingLinkedIssues,
  unresolvedLinkedIssueIds,
  onAddLinkedIssue,
  onUnlinkIssue,
  getIssueById,
  getProjectIdentifierById,
  getProjectById,
}: TDetailPanelProps) {
  const status = request.status ? statusMap[request.status] : undefined;
  const priority = getRequestPriority(request);
  const team = getRequestTeam(request);
  const sla = getRequestSla(request, portal);
  const tags = getRequestTags(request);
  const classification = getRequestClassification(request);
  const customerStats = customerStatsProp ?? getFallbackCustomerStats(request);

  return (
    <aside className="hidden w-[300px] min-w-[300px] flex-col overflow-y-auto border-l border-subtle bg-surface-2 xl:flex">
      {/* ---------------- Ticket ---------------- */}
      <Section title="Ticket">
        <Row label="Status">{status ? <HelpdeskStatusPill status={status} /> : <Empty />}</Row>
        <Row label="Priority">
          <PriorityDropdown
            value={request.priority}
            onChange={onPriorityChange}
            buttonVariant={priority ? "border-with-text" : "border-without-text"}
            highlightUrgent
          />
        </Row>
        <Row label="Assignee">
          <MemberDropdown
            value={request.assignees}
            onChange={onAssigneesChange}
            multiple
            buttonVariant={request.assignees.length > 0 ? "transparent-without-text" : "border-without-text"}
            buttonClassName={request.assignees.length > 0 ? "hover:bg-transparent px-0" : ""}
            placeholder="Assign"
          />
        </Row>
        <Row label="Team">
          <Popover className="relative">
            <Popover.Button
              type="button"
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 text-secondary hover:border-strong transition-colors"
            >
              {request.team_detail ? (
                <>
                  <span className="size-2 rounded-full" style={{ backgroundColor: request.team_detail.color || "#3B82F6" }} />
                  <span>{request.team_detail.name}</span>
                </>
              ) : team ? (
                <span>{team}</span>
              ) : (
                <span className="text-tertiary">—</span>
              )}
              <ChevronDown className="size-3 text-tertiary" />
            </Popover.Button>
            <Popover.Panel className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-subtle bg-surface-1 p-1 shadow-md">
              {({ close }: { close: () => void }) => (
                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto text-12">
                  <button
                    type="button"
                    onClick={() => {
                      if (onTeamChange) onTeamChange(null);
                      close();
                    }}
                    className="rounded px-2.5 py-1.5 text-left text-tertiary hover:bg-layer-2"
                  >
                    — Sem time —
                  </button>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (onTeamChange) onTeamChange(t.id);
                        close();
                      }}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-primary hover:bg-layer-2"
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: t.color || "#3B82F6" }} />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Popover.Panel>
          </Popover>
        </Row>

        {sla ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-12 text-tertiary">SLA</span>
              <span className={cn("text-13", sla.isBreached ? "text-danger-primary" : "text-primary")}>
                {sla.label}
              </span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-layer-2">
              <div
                className={cn("h-full rounded-full", sla.isBreached ? "bg-danger-primary" : "bg-warning-primary")}
                style={{ width: `${Math.round(sla.progress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <Row label="SLA">
            <span className="text-12 text-tertiary">Não configurado</span>
          </Row>
        )}
      </Section>

      {/* ---------------- Customer ---------------- */}
      <Section title="Customer">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-primary text-13 font-semibold text-white">
            {(request.contact_email || "?").charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-13 font-medium text-primary">
              {request.contact_email || "Authenticated customer"}
            </span>
            <Link
              to={`/${workspaceSlug}/helpdesk/customers`}
              className="inline-flex items-center gap-1 text-12 text-accent-primary hover:underline"
            >
              View full profile
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>

        {customerStats ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat value={customerStats.total} label="Past tickets" />
            <Stat value={customerStats.open} label="Open" />
            <Stat value={customerStats.resolved} label="Resolved" />
          </div>
        ) : null}

        <Row label="First contact">
          <span className="text-12 text-secondary">
            {customerStats?.firstContactAt
              ? new Date(customerStats.firstContactAt).toLocaleDateString()
              : new Date(request.created_at).toLocaleDateString()}
          </span>
        </Row>
        <Row label="Channel">
          <span className="text-12 text-secondary">{getRequestChannel(request)}</span>
        </Row>
      </Section>

      {/* ---------------- Classification ---------------- */}
      <Section title="Classification">
        {classification.length === 0 ? (
          <p className="text-12 text-tertiary">Este formulário não define categorias.</p>
        ) : (
          classification.map((entry) => (
            <Row key={entry.label} label={entry.label}>
              <span className="rounded-md border border-subtle bg-surface-1 px-2 py-0.5 text-12 text-primary">
                {entry.value}
              </span>
            </Row>
          ))
        )}
        <Row label="Tags">
          {tags.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-wrap justify-end gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex h-5 items-center gap-1 rounded-md bg-layer-2 px-2 text-11 text-secondary"
                >
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: tag.color || "var(--border-color-subtle)" }}
                  />
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </Row>
      </Section>

      {/* ---------------- Dev pipeline ---------------- */}
      <div className="border-b border-subtle">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <span className="tracking-wider text-11 font-semibold text-tertiary uppercase">Dev pipeline</span>
          <Button variant="secondary" size="sm" onClick={onForward}>
            <span className="flex items-center gap-1.5">
              Forward
              <ArrowUpRight className="size-3.5" />
            </span>
          </Button>
        </div>
        <div className="flex flex-col gap-1.5 px-4 pb-3.5">
          {isLoadingIntakeLinks && intakeLinks.length === 0 ? (
            <Spinner />
          ) : intakeLinks.length === 0 ? (
            <p className="text-12 text-tertiary">Nenhum item no dev pipeline. Use Forward para criar um.</p>
          ) : (
            intakeLinks.map((link) => {
              const project = getProjectById(link.forwarded_to_project);
              const identifier = link.project_identifier || project?.identifier;
              const meta = INTAKE_STATUS_META[link.intake_status ?? -2];
              return (
                <div key={link.id} className="group flex items-center gap-2 rounded-md bg-surface-1 p-2">
                  {identifier && (
                    <span className="font-mono rounded bg-layer-2 px-1 py-0.5 text-11 font-semibold text-tertiary">
                      {identifier}
                    </span>
                  )}
                  <Link
                    to={`/${workspaceSlug}/projects/${link.forwarded_to_project}/intake`}
                    className="min-w-0 flex-1 truncate text-13 text-primary hover:underline"
                  >
                    {project?.name || link.forwarded_to_project}
                  </Link>
                  <Badge variant={meta.variant} size="sm">
                    {meta.label}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => onUnlinkIntake(link.id)}
                    title="Remove intake link"
                    className="shrink-0 rounded p-0.5 text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ---------------- Linked issues ---------------- */}
      <div>
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <span className="tracking-wider text-11 font-semibold text-tertiary uppercase">Linked issues</span>
          <Button variant="secondary" size="sm" onClick={onAddLinkedIssue}>
            <span className="flex items-center gap-1.5">
              <Plus className="size-3.5" />
              Add
            </span>
          </Button>
        </div>
        <div className="flex flex-col gap-1.5 px-4 pb-4">
          {isLoadingLinkedIssues && linkedIssues.length === 0 ? (
            <Spinner />
          ) : linkedIssues.length === 0 ? (
            <p className="text-12 text-tertiary">Nenhuma issue vinculada.</p>
          ) : (
            linkedIssues.map((requestIssue) => {
              const issue = getIssueById(requestIssue.issue);
              const isUnavailable = unresolvedLinkedIssueIds.includes(requestIssue.issue);
              const projectIdentifier = getProjectIdentifierById(issue?.project_id);
              const workItemLink =
                issue && issue.project_id && projectIdentifier
                  ? generateWorkItemLink({
                      workspaceSlug,
                      projectId: issue.project_id,
                      issueId: requestIssue.issue,
                      projectIdentifier,
                      sequenceId: issue.sequence_id,
                    })
                  : undefined;

              return (
                <div key={requestIssue.id} className="group flex items-center gap-2 rounded-md bg-surface-1 p-2">
                  {issue && issue.project_id && projectIdentifier ? (
                    <IssueIdentifier
                      projectId={issue.project_id}
                      issueTypeId={issue.type_id}
                      projectIdentifier={projectIdentifier}
                      issueSequenceId={issue.sequence_id}
                      size="xs"
                      variant="secondary"
                    />
                  ) : (
                    <Badge variant="neutral" size="sm">
                      {isUnavailable ? "Unavailable" : "Linked"}
                    </Badge>
                  )}
                  <Link
                    to={workItemLink || "#"}
                    className="min-w-0 flex-1 truncate text-13 text-primary hover:underline"
                  >
                    {issue?.name || requestIssue.issue}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onUnlinkIssue(requestIssue.id)}
                    title="Unlink issue"
                    className="shrink-0 rounded p-0.5 text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

/* ---------------------------- primitives ---------------------------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-b border-subtle">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-tertiary transition-colors hover:text-secondary"
      >
        <span className="tracking-wider text-11 font-semibold uppercase">{title}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && <div className="flex flex-col gap-2.5 px-4 pb-3.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-12 text-tertiary">{label}</span>
      {children}
    </div>
  );
}

function Empty() {
  return <span className="text-13 text-tertiary">—</span>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-surface-1 px-1 py-2">
      <span className="text-sm font-semibold text-primary">{value}</span>
      <span className="text-center text-11 text-tertiary">{label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-4">
      <div className="size-6 animate-spin rounded-full border-b-2 border-accent-strong" />
    </div>
  );
}
