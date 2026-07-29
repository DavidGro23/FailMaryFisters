/**
 * The landing page: roll of honour, all-time summary, and links into
 * everything else (§10).
 *
 * No arithmetic here beyond formatting — every figure arrives computed.
 */

import type {
	ChampionEntry,
	LandingView,
	LeagueRecord,
	LeagueRecordGroup,
} from "../aggregate/landing.ts";
import type { ManagerProfile } from "../aggregate/manager-profile.ts";
import { url } from "./base-path.ts";
import { html, type SafeHtml } from "./html.ts";
import { draftRoute, managerRoute, ROUTES, seasonRoute } from "./nav.ts";
import { renderPage, renderTeamCell, type TeamCell } from "./page.ts";

export function renderLandingPage(view: LandingView, profiles: readonly ManagerProfile[]): string {
	const first = view.seasons[0];
	const last = view.seasons[view.seasons.length - 1];

	return renderPage({
		title: "Fail Mary Fisters",
		heading: "Fail Mary Fisters",
		meta: `${view.seasons.length} seasons · ${first}–${last} · ${view.teamCount} teams`,
		active: "home",
		body: html`${renderHallOfFame(view)}
${renderRecords(view)}
${renderBrowse(view, profiles)}`,
	});
}

/** The centrepiece: every champion, newest first. */
function renderHallOfFame(view: LandingView): SafeHtml {
	if (view.hallOfFame.length === 0) return html``;

	return html`<section>
<h2 class="section-title">Hall of Fame</h2>
<ul class="hall-of-fame">
${view.hallOfFame.map(renderChampion)}
</ul>
${renderTitleCounts(view)}
</section>`;
}

function renderChampion(entry: ChampionEntry): SafeHtml {
	const cell: TeamCell = { displayName: entry.displayName };
	if (entry.avatar !== undefined) cell.avatar = entry.avatar;

	return html`<li class="hall-of-fame-item">
<a class="hall-of-fame-year" href="${url(seasonRoute(entry.year))}">${entry.year}</a>
<a class="hall-of-fame-team" href="${url(managerRoute(entry.slug))}">${renderTeamCell(cell)}</a>
</li>`;
}

function renderTitleCounts(view: LandingView): SafeHtml {
	if (view.mostTitles.length === 0) return html``;
	return html`<p class="section-note hall-of-fame-counts">
${view.mostTitles.map(
		(entry) =>
			html`<span class="title-count"><a href="${url(managerRoute(entry.profile.slug))}">${entry.profile.displayName}</a> ${entry.titles}</span>`,
	)}
</p>`;
}

/**
 * Grouped by scope and span, so a heading says "Playoffs · single game" once
 * rather than every tile repeating it — and so the regular/postseason split
 * rule 7 requires is visible at a glance.
 */
function renderRecords(view: LandingView): SafeHtml {
	if (view.recordGroups.length === 0) return html``;

	return html`<section>
<h2 class="section-title">League records</h2>
${view.recordGroups.map(renderRecordGroup)}
</section>`;
}

function renderRecordGroup(group: LeagueRecordGroup): SafeHtml {
	return html`<div class="scope">
<h3 class="bracket-round-title">${group.title}</h3>
<div class="record-grid">
${group.records.map(renderRecordTile)}
</div>
</div>`;
}

function renderRecordTile(entry: LeagueRecord): SafeHtml {
	return html`<div class="record-tile record-tile-${entry.kind}">
<p class="record-label">${entry.label}</p>
<p class="record-points">${entry.value}</p>
<p class="record-detail"><a href="${url(managerRoute(entry.slug))}">${entry.detail}</a></p>
</div>`;
}

/** Every route on the site, so the landing page is a real index. */
function renderBrowse(view: LandingView, profiles: readonly ManagerProfile[]): SafeHtml {
	return html`<section>
<h2 class="section-title">Browse</h2>

<h3 class="bracket-round-title">Seasons</h3>
<nav class="seasons" aria-label="All seasons">
${[...view.seasons].reverse().map((year) => html`<a class="season-link" href="${url(seasonRoute(year))}">${year}</a>`)}
</nav>

<h3 class="bracket-round-title">Teams</h3>
<nav class="seasons teams-switcher" aria-label="All teams">
${profiles.map((profile) => {
		const cell: TeamCell = { displayName: profile.displayName };
		if (profile.avatar !== undefined) cell.avatar = profile.avatar;
		return html`<a class="season-link" href="${url(managerRoute(profile.slug))}">${renderTeamCell(cell)}</a>`;
	})}
</nav>

<h3 class="bracket-round-title">Drafts</h3>
<nav class="seasons" aria-label="All drafts">
${[...view.seasons].reverse().map((year) => html`<a class="season-link" href="${url(draftRoute(year))}">${year}</a>`)}
</nav>

<h3 class="bracket-round-title">Everything else</h3>
<nav class="seasons" aria-label="Other pages">
<a class="season-link" href="${url(ROUTES.allTime)}">All-time table</a>
<a class="season-link" href="${url(ROUTES.rulebook)}">Rulebook</a>
</nav>
</section>`;
}
