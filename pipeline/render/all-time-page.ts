/**
 * The all-time regular-season page.
 *
 * Twelve rows, one per player who has ever managed — not ten. `teamId` 5 has
 * been held by three different people, and each is a separate career.
 *
 * **Medals do not carry over to this page.** On the season page, ranks 1–3 are a
 * finishing position the league actually produced, so the §12.4 medal circles
 * mean something. Here the rank is a leaderboard position *this site computes*
 * from a win-percentage sort — nobody ever won an all-time bronze. Rendering
 * gold here would assert a distinction the league never made, and would dilute
 * the medal's meaning on the page where it is real. Ranks render as plain muted
 * numbers, which is also the quieter option CLAUDE.md asks for when §12 does not
 * settle a question.
 */

import type { AllTimeRow, AllTimeTable } from "../aggregate/all-time.ts";
import { points, percent, record } from "./format.ts";
import { html, type SafeHtml } from "./html.ts";
import { renderPage, renderTeamCell, sortableCell, sortableHeader, tableWrap, type TeamCell } from "./page.ts";

export function renderAllTimePage(table: AllTimeTable): string {
	const years = table.seasonsCovered;
	const span = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : "no seasons";

	return renderPage({
		title: "All-time — Fail Mary Fisters",
		heading: "All-time",
		meta: `Regular season · ${span} · ${table.rows.length} managers`,
		active: "allTime",
		body: html`<section>
<h2 class="section-title">All-time regular season</h2>
<p class="section-note">Ordered by wins, then points for. Careers cover only the seasons each manager played, so sample sizes differ — the seasons column shows how many.</p>
${renderTable(table)}
</section>`,
	});
}

function renderTable(table: AllTimeTable): SafeHtml {
	return tableWrap("t-widest", html`<table class="standings" data-sortable>
<thead>
<tr>
<th class="col-rank" scope="col">#</th>
<th class="col-team" scope="col">Manager</th>
<th class="col-num" scope="col">Seasons</th>
${sortableHeader("record", "Record")}
${sortableHeader("winPct", "Win %")}
${sortableHeader("pointsFor", "PF")}
${sortableHeader("pointsAgainst", "PA")}
${sortableHeader("pointsPerGame", "PPG")}
</tr>
</thead>
<tbody>
${table.rows.map((row) => renderRow(row, table.seasonsCovered.length))}
</tbody>
</table>`);
}

function renderRow(row: AllTimeRow, totalSeasons: number): SafeHtml {
	const cell: TeamCell = { displayName: row.displayName };
	if (row.avatar !== undefined) cell.avatar = row.avatar;
	// Anyone who did not play every season gets their span shown, so a one-season
	// career is not mistaken for a nine-season one at a glance.
	if (row.seasonsPlayed < totalSeasons) cell.secondary = `${row.firstYear}–${row.lastYear}`;

	return html`<tr>
<td class="col-rank" data-label="Rank"><span class="rank">${row.rank}</span></td>
<td class="col-team" data-label="Manager">${renderTeamCell(cell)}</td>
<td class="col-num" data-label="Seasons">${row.seasonsPlayed}</td>
${sortableCell("Record", row.wins, record(row.wins, row.losses, row.draws))}
${sortableCell("Win %", row.winPct, percent(row.winPct))}
${sortableCell("PF", row.pointsFor, points(row.pointsFor))}
${sortableCell("PA", row.pointsAgainst, points(row.pointsAgainst))}
${sortableCell("PPG", row.pointsPerGame, points(row.pointsPerGame), true)}
</tr>`;
}
