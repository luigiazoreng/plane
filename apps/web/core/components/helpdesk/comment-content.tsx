/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const QUOTE_DIVIDERS = [
  /\n_{3,}\s*From:/i,
  /\n-{3,}\s*Original\s*-{3,}/i,
  /\nOn\s+.*?\s+wrote:\s*\n/i,
  /\nFrom:\s+.*?<.*?>\s*\nDate:\s+/i,
  /\n-{3,}\s*Forwarded message\s*-{3,}/i,
];

/**
 * Renders a helpdesk comment body, folding the quoted tail of an email reply
 * behind a disclosure so the thread stays readable. Shared by the standalone
 * ticket page and the split (triage) view so both fold identically.
 */
export function HelpdeskCommentContent({ content }: { content: string }) {
  if (!content) return null;

  const parsed = content
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // The earliest divider wins — a forwarded chain can match several.
  let splitIndex = -1;
  for (const regex of QUOTE_DIVIDERS) {
    const match = parsed.match(regex);
    if (match && match.index !== undefined && (splitIndex === -1 || match.index < splitIndex)) {
      splitIndex = match.index;
    }
  }

  if (splitIndex === -1) return <p className="break-words whitespace-pre-wrap">{parsed}</p>;

  const mainText = parsed.substring(0, splitIndex).trim();
  const quotedText = parsed.substring(splitIndex).trim();

  return (
    <div className="flex flex-col gap-2">
      {mainText ? <p className="break-words whitespace-pre-wrap">{mainText}</p> : null}
      <details className="group">
        <summary className="cursor-pointer list-none text-11 font-medium text-tertiary select-none hover:text-secondary">
          <span className="rounded border border-subtle bg-surface-1 px-2 py-0.5">...</span>
        </summary>
        <div className="mt-2 border-l-2 border-subtle pl-3 text-11 text-tertiary opacity-70">
          <p className="break-words whitespace-pre-wrap">{quotedText}</p>
        </div>
      </details>
    </div>
  );
}
