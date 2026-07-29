/**
 * The shared page shell and the pieces both tables need.
 *
 * Extracted when the second page arrived, so the head, nav and team cell exist
 * once rather than being copied.
 */

import { url } from "./base-path.ts";
import { html, toHtml, type SafeHtml } from "./html.ts";
import { renderNav, type RouteKey } from "./nav.ts";

export interface PageOptions {
	title: string;
	heading: string;
	/** Shown beside the page title. Decorative — the heading names the subject. */
	headingAvatar?: string;
	meta: string;
	active: RouteKey;
	body: SafeHtml;
}

export function renderPage(options: PageOptions): string {
	return toHtml(html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${options.title}</title>
<link rel="stylesheet" href="${url("assets/site.css")}">
<script type="module" src="${url("assets/js/main.js")}"></script>
</head>
<body>
${renderNav(options.active)}
<main class="page">
<h1 class="page-title">${renderHeadingAvatar(options.headingAvatar)}${options.heading}</h1>
<p class="page-meta">${options.meta}</p>
${options.body}
</main>
</body>
</html>
`);
}

/**
 * How much room a table needs before it can render as a real table rather than
 * stacked cards. The CSS turns these into container-query thresholds, so each
 * table measures its own column, not the viewport.
 *
 * Chosen from measured content widths (compact metrics, page padding included):
 * draft 235 · career 303 · most-started 343 · h2h 386 · standings 394 ·
 * all-time 457.
 */
export type TableWidth = "t-narrow" | "t-medium" | "t-wide" | "t-widest";

/**
 * Wraps a table so it can query its own available width. The width class sits on
 * the wrapper because that is the query container; the CSS then targets the
 * table inside it.
 */
export function tableWrap(width: TableWidth, table: SafeHtml): SafeHtml {
	return html`<div class="table-wrap ${width}">${table}</div>`;
}

/** Columns the browser may re-sort. The key also labels the mobile sort bar. */
export const SORT_KEYS = ["record", "winPct", "pointsFor", "pointsAgainst", "pointsPerGame"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/**
 * A sortable column header.
 *
 * Server-rendered as plain text — no button, so nothing inert appears when
 * JavaScript is off. `table-sort.ts` upgrades these into buttons and manages
 * `aria-sort`. The `data-sort` key is what the client matches cells against.
 */
export function sortableHeader(key: SortKey, label: string): SafeHtml {
	return html`<th class="col-num" scope="col" data-sort="${key}">${label}</th>`;
}

/**
 * A numeric cell carrying its raw value.
 *
 * The client sorts on `data-sort-value`, never on the rendered text: "1,848.60"
 * and the en-dash record "12–3" are display forms that `Number()` cannot parse.
 */
export function sortableCell(label: string, value: number, formatted: string, emphasis = false): SafeHtml {
	const cls = emphasis ? "col-num col-emph" : "col-num";
	return html`<td class="${cls}" data-label="${label}" data-sort-value="${value}">${formatted}</td>`;
}

/**
 * Larger avatar beside a page title. `alt=""` because the heading immediately
 * after it names the subject; width/height reserve the box so nothing shifts.
 */
function renderHeadingAvatar(avatar: string | undefined): SafeHtml {
	if (avatar === undefined) return html``;
	return html`<img class="page-title-avatar" src="${url(`assets/avatars/${avatar}`)}" width="32" height="32" alt="" decoding="async">`;
}

export interface TeamCell {
	displayName: string;
	avatar?: string;
	/** Muted secondary text, e.g. the season's own team name where it differed. */
	secondary?: string;
}

/**
 * Avatar plus name.
 *
 * The avatar is decorative: the name sits immediately beside it, so alt text
 * would make a screen reader announce the same team twice. Hence `alt=""` on the
 * image and `aria-hidden` on the fallback.
 *
 * Both branches occupy an identical 24x24 box. The `width`/`height` attributes
 * reserve it before CSS or the image loads, so nothing shifts (CLS), and a team
 * without an avatar produces exactly the same layout as one with.
 *
 * A missing avatar has two causes and one treatment: the manager used NFL's
 * `DEF.png` placeholder, or the asset they chose has since 404'd (the 2018
 * Raiders logo). Both arrive here as an absent `avatar` and both render the
 * initial, so there is no unreachable branch for the rarer case.
 */
export function renderTeamCell(cell: TeamCell): SafeHtml {
	return html`<span class="team-cell">${renderAvatar(cell)}<span class="team-text"><span class="team-name">${cell.displayName}</span>${renderSecondary(cell)}</span></span>`;
}

function renderAvatar(cell: TeamCell): SafeHtml {
	if (cell.avatar === undefined) {
		return html`<span class="avatar avatar-fallback" aria-hidden="true">${initial(cell.displayName)}</span>`;
	}
	return html`<img class="avatar" src="${url(`assets/avatars/${cell.avatar}`)}" width="24" height="24" alt="" loading="lazy" decoding="async">`;
}

/** First character of the canonical name, for the §12.4 fallback. */
function initial(displayName: string): string {
	return [...displayName.trim()][0]?.toUpperCase() ?? "?";
}

function renderSecondary(cell: TeamCell): SafeHtml {
	if (cell.secondary === undefined) return html``;
	return html`<span class="team-alias"> · ${cell.secondary}</span>`;
}
