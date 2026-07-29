/**
 * The season standings page, one per season.
 *
 * Contains no arithmetic beyond formatting — every number arrives computed from
 * the aggregate stage.
 */

import type { BracketView } from "../aggregate/playoffs.ts";
import type { StandingsTable, StandingsTableRow } from "../aggregate/standings.ts";
import { url } from "./base-path.ts";
import { renderBracket } from "./bracket.ts";
import { points, percent, record } from "./format.ts";
import { html, type SafeHtml } from "./html.ts";
import { draftRoute, seasonRoute } from "./nav.ts";
import { renderPage, renderTeamCell, sortableCell, sortableHeader, tableWrap, type TeamCell } from "./page.ts";

export function renderStandingsPage(
	table: StandingsTable,
	allYears: readonly number[],
	bracket: BracketView | undefined,
): string {
	return renderPage({
		title: `${table.year} season — Fail Mary Fisters`,
		heading: `${table.year} season`,
		meta: `Regular season · ${table.regularSeasonWeeks} weeks · ${table.rows.length} teams`,
		active: "seasons",
		body: html`${renderSeasonSwitcher(table.year, allYears)}
<p class="section-note"><a href="${url(draftRoute(table.year))}">${table.year} draft board →</a></p>
<section>
<h2 class="section-title">Regular season standings</h2>
${renderTable(table)}
</section>
${bracket ? renderBracket(bracket) : html``}`,
	});
}

/**
 * Plain links, one per season. No JavaScript and no select element, so every
 * season is reachable — and crawlable — with scripting off.
 */
function renderSeasonSwitcher(current: number, allYears: readonly number[]): SafeHtml {
	return html`<nav class="seasons" aria-label="Season">
${allYears.map((year) =>
		year === current
			? html`<a class="season-link" href="${url(seasonRoute(year))}" aria-current="page">${year}</a>`
			: html`<a class="season-link" href="${url(seasonRoute(year))}">${year}</a>`,
	)}
</nav>`;
}

/**
 * One markup set for both layouts. CSS turns these rows into stacked cards below
 * 600px and a real table above it — a standings table must never scroll
 * horizontally on a phone (§12.3).
 *
 * Rows are emitted in `overallRank` order and stay that way with JavaScript off.
 * Client-side sorting is a view toggle and never changes this default (§13.3) —
 * the league's own tiebreak is not something we can reconstruct.
 */
function renderTable(table: StandingsTable): SafeHtml {
	return tableWrap("t-wide", html`<table class="standings" data-sortable>
<thead>
<tr>
<th class="col-rank" scope="col">#</th>
<th class="col-team" scope="col">Manager</th>
${sortableHeader("record", "Record")}
${sortableHeader("winPct", "Win %")}
${sortableHeader("pointsFor", "PF")}
${sortableHeader("pointsAgainst", "PA")}
${sortableHeader("pointsPerGame", "PPG")}
</tr>
</thead>
<tbody>
${table.rows.map(renderRow)}
</tbody>
</table>`);
}

function renderRow(row: StandingsTableRow): SafeHtml {
	const cell: TeamCell = { displayName: row.displayName };
	if (row.avatar !== undefined) cell.avatar = row.avatar;
	// D15: the canonical name is the primary label everywhere. Where a season's
	// own team name differed, it appears only as muted secondary text.
	if (row.playedAs !== undefined) cell.secondary = `played as ${row.playedAs}`;

	return html`<tr>
<td class="col-rank" data-label="Rank">${renderRank(row.overallRank)}</td>
<td class="col-team" data-label="Manager">${renderTeamCell(cell)}</td>
${sortableCell("Record", row.wins, record(row.wins, row.losses, row.draws))}
${sortableCell("Win %", row.winPct, percent(row.winPct))}
${sortableCell("PF", row.pointsFor, points(row.pointsFor))}
${sortableCell("PA", row.pointsAgainst, points(row.pointsAgainst))}
${sortableCell("PPG", row.pointsPerGame, points(row.pointsPerGame), true)}
</tr>`;
}

/**
 * Ranks 1–3 get a medal circle; 4+ a plain muted number (§12.4).
 *
 * Medals belong here because this rank is a *finishing position* the league
 * actually produced. The all-time page deliberately does not use them — see
 * `all-time-page.ts`.
 */
function renderRank(rank: number): SafeHtml {
	const medal = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;
	return medal
		? html`<span class="rank rank-${medal}">${rank}</span>`
		: html`<span class="rank">${rank}</span>`;
}
