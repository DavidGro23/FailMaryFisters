/**
 * One team's draft board for one season.
 *
 * Two switchers: season, then team within that season. Both are plain links, so
 * every combination is reachable with JavaScript off and each has its own URL.
 */

import type { DraftTeam, SeasonDraftView } from "../aggregate/drafts.ts";
import { url } from "./base-path.ts";
import { html, type SafeHtml } from "./html.ts";
import { draftRoute } from "./nav.ts";
import { renderPage, renderTeamCell, type TeamCell } from "./page.ts";

export function renderDraftPage(
	view: SeasonDraftView,
	team: DraftTeam,
	allYears: readonly number[],
): string {
	return renderPage({
		title: `${view.year} draft — ${team.displayName} — Fail Mary Fisters`,
		heading: `${view.year} draft`,
		meta: `${view.rounds} rounds · ${view.totalPicks} picks · ${view.teams.length} teams`,
		active: "drafts",
		body: html`${renderSeasonSwitcher(view.year, allYears)}
${renderTeamSwitcher(view, team)}
<section>
<h2 class="section-title">${team.displayName}</h2>
<p class="section-note">${team.picks.length} picks, in draft order. Picks are tradeable, so a team can hold two in one round and none in another.</p>
${renderPicks(team)}
</section>`,
	});
}

/** Keeps the same team selected when switching season, where that team played. */
function renderSeasonSwitcher(current: number, allYears: readonly number[]): SafeHtml {
	return html`<nav class="seasons" aria-label="Season">
${allYears.map((year) =>
		year === current
			? html`<a class="season-link" href="${url(draftRoute(year))}" aria-current="page">${year}</a>`
			: html`<a class="season-link" href="${url(draftRoute(year))}">${year}</a>`,
	)}
</nav>`;
}

function renderTeamSwitcher(view: SeasonDraftView, current: DraftTeam): SafeHtml {
	return html`<nav class="seasons teams-switcher" aria-label="Team">
${view.teams.map((team) => {
		const cell: TeamCell = { displayName: team.displayName };
		if (team.avatar !== undefined) cell.avatar = team.avatar;
		return team.managerId === current.managerId
			? html`<a class="season-link" href="${url(draftRoute(view.year, team.slug))}" aria-current="page">${renderTeamCell(cell)}</a>`
			: html`<a class="season-link" href="${url(draftRoute(view.year, team.slug))}">${renderTeamCell(cell)}</a>`;
	})}
</nav>`;
}

function renderPicks(team: DraftTeam): SafeHtml {
	return html`<table class="standings">
<thead>
<tr>
<th class="col-rank" scope="col">Rd</th>
<th class="col-team" scope="col">Player</th>
<th class="col-num" scope="col">Pick</th>
</tr>
</thead>
<tbody>
${team.picks.map(
		(pick) => html`<tr>
<td class="col-rank" data-label="Round"><span class="rank">${pick.round}</span></td>
<td class="col-team" data-label="Player"><span class="team-cell"><span class="team-text"><span class="team-name">${pick.playerName}</span>${
			pick.extraInRound
				? html`<span class="team-alias"> · second pick this round</span>`
				: html``
		}</span></span></td>
<td class="col-num" data-label="Pick">${pick.overall}</td>
</tr>`,
	)}
</tbody>
</table>`;
}
