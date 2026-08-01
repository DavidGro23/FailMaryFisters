/**
 * One team's keeper values for the coming season.
 *
 * The arithmetic is all in `aggregate/keepers.ts`; this file only formats. The
 * team switcher is plain links, so every team is reachable with JavaScript off
 * and each has its own URL.
 */

import type { PickRow, PickTeam } from "../aggregate/draft-picks.ts";
import type { KeeperBasis, KeeperRow, KeeperTeam, SeasonKeeperView } from "../aggregate/keepers.ts";
import { url } from "./base-path.ts";
import { html, type SafeHtml } from "./html.ts";
import { keeperRoute } from "./nav.ts";
import { renderPage, renderPlayerCell, renderTeamCell, tableWrap, type TeamCell } from "./page.ts";

export function renderKeeperPage(
	view: SeasonKeeperView,
	team: KeeperTeam,
	picks: PickTeam | null,
): string {
	return renderPage({
		title: `${view.keeperYear} — ${team.displayName} — Fail Mary Fisters`,
		heading: String(view.keeperYear),
		meta: `${team.displayName} · keeper values and draft picks`,
		active: "keepers",
		body: html`${renderTeamSwitcher(view, team)}
<section>
<h2 class="section-title">Keeper values</h2>
<p class="section-note">${renderNote(team)}</p>
${renderTable(team)}
</section>
${renderPicks(view, picks)}
${renderRules(view)}`,
	});
}

function renderTeamSwitcher(view: SeasonKeeperView, current: KeeperTeam): SafeHtml {
	return html`<nav class="seasons teams-switcher" aria-label="Team">
${view.teams.map((team) => {
		const cell: TeamCell = { displayName: team.displayName };
		if (team.avatar !== undefined) cell.avatar = team.avatar;
		return team.managerId === current.managerId
			? html`<a class="season-link" href="${url(keeperRoute(team.slug))}" aria-current="page">${renderTeamCell(cell)}</a>`
			: html`<a class="season-link" href="${url(keeperRoute(team.slug))}">${renderTeamCell(cell)}</a>`;
	})}
</nav>`;
}

/**
 * States the roster size and, when relevant, how many values are still missing.
 * The gap is named on the page rather than left for someone to discover by
 * counting — the site is honest about what it does not know.
 */
function renderNote(team: KeeperTeam): SafeHtml {
	const size = `${team.players.length} players, IR excluded. Ordered by keeper value, round 1 first.`;
	if (team.unrecordedCount === 0) return html`${size}`;
	return html`${size} ${team.unrecordedCount} undrafted ${
		team.unrecordedCount === 1 ? "player has" : "players have"
	} no recorded waiver or free-agent claim, so ${
		team.unrecordedCount === 1 ? "its" : "their"
	} value cannot be shown yet.`;
}

function renderTable(team: KeeperTeam): SafeHtml {
	return tableWrap(
		"t-medium",
		html`<table class="standings">
<thead>
<tr>
<th class="col-team" scope="col">Player</th>
<th class="col-num" scope="col">Pos</th>
<th class="col-num" scope="col">Keeper value</th>
<th class="col-num" scope="col">Basis</th>
</tr>
</thead>
<tbody>
${team.players.map(renderRow)}
</tbody>
</table>`,
	);
}

function renderRow(row: KeeperRow): SafeHtml {
	const cells = html`<td class="col-team" data-label="Player">${renderPlayerCell(row.playerName)}</td>
<td class="col-num" data-label="Pos">${row.position === "" ? "—" : row.position}</td>
<td class="col-num col-emph" data-label="Keeper value">${renderValue(row)}</td>
<td class="col-num" data-label="Basis">${renderBasis(row.basis)}</td>`;

	// Muted rather than flagged: a player who cannot be kept is a normal outcome,
	// not an error. Branching here instead of interpolating an attribute keeps
	// every value in the template escaped.
	return row.value === undefined
		? html`<tr class="keeper-row-none">${cells}</tr>`
		: html`<tr>${cells}</tr>`;
}

function renderValue(row: KeeperRow): SafeHtml {
	if (row.value !== undefined) return html`Round ${row.value}`;
	return html`<span class="keeper-none">—</span>`;
}

function renderBasis(basis: KeeperBasis): SafeHtml {
	switch (basis.kind) {
		case "drafted":
			return html`Drafted round ${basis.round}`;
		case "firstRound":
			return html`<span class="keeper-none">1st round — cannot be kept</span>`;
		case "waiver":
			return html`Waiver claim`;
		case "freeAgent":
			return html`Free agent`;
		case "unrecorded":
			return html`<span class="keeper-none">Undrafted — not recorded</span>`;
	}
}

/**
 * Which picks this team holds in the coming draft.
 *
 * Round only, no pick numbers: the draft order comes from a lottery that has not
 * been held (rulebook §4.4), so a 1-150 number would be invented. The original
 * owner is shown because picks move — the export records a traded pick as just
 * `{year, round}`, and this column is the answer to "whose is it".
 */
function renderPicks(view: SeasonKeeperView, picks: PickTeam | null): SafeHtml {
	if (!picks || picks.picks.length === 0) return html``;

	return html`<section>
<h2 class="section-title">Draft picks</h2>
<p class="section-note">${picks.picks.length} picks for the ${view.keeperYear} draft, by round. ${renderPickTraffic(picks)} Pick numbers are not known yet — the draft order is drawn by lottery (§4.4).</p>
${tableWrap(
		"t-narrow",
		html`<table class="standings">
<thead>
<tr>
<th class="col-rank" scope="col">Rd</th>
<th class="col-team" scope="col">Original owner</th>
</tr>
</thead>
<tbody>
${picks.picks.map(renderPickRow)}
</tbody>
</table>`,
	)}
</section>`;
}

function renderPickTraffic(picks: PickTeam): string {
	if (picks.acquired === 0 && picks.tradedAway === 0) return "None have been traded.";

	const parts: string[] = [];
	if (picks.acquired > 0) parts.push(`${picks.acquired} acquired by trade`);
	if (picks.tradedAway > 0) parts.push(`${picks.tradedAway} of their own traded away`);
	return `${parts.join(", ")}.`;
}

function renderPickRow(pick: PickRow): SafeHtml {
	const cells = html`<td class="col-rank" data-label="Round"><span class="rank">${pick.round}</span></td>
<td class="col-team" data-label="Original owner">${
		pick.own
			? html`<span class="keeper-none">Own pick</span>`
			: renderPlayerCell(pick.originalOwnerName)
	}</td>`;

	// Acquired picks are the interesting rows, so the team's own are muted rather
	// than the other way round.
	return pick.own ? html`<tr class="keeper-row-none">${cells}</tr>` : html`<tr>${cells}</tr>`;
}

/**
 * The rules, on the page. In a league that argues about these numbers, a value
 * without its rule is an assertion; with it, it is checkable.
 */
function renderRules(view: SeasonKeeperView): SafeHtml {
	return html`<section>
<h2 class="section-title">How the value is worked out</h2>
<ul class="keeper-rules">
<li><strong>Drafted in ${view.year}</strong> — the value is that draft round minus one. A ${view.year} 10th-rounder costs a 9th-round pick.</li>
<li><strong>Drafted in the first round</strong> — cannot be kept at all.</li>
<li><strong>Never drafted</strong> — the value comes from that player's last claim: round 10 off waivers, round 12 as a free agent.</li>
<li><strong>Trades and drops do not change anything.</strong> A drafted player keeps his draft-based value however many teams he passed through, and a drafted player who was cut and re-signed still costs his draft round minus one.</li>
</ul>
${
		view.unrecordedCount > 0
			? html`<p class="section-note">The NFL export records trades but no waiver claims or free-agent adds, so ${view.unrecordedCount} undrafted players across the league have no value yet. Those are filled in from the league's transaction log rather than guessed.</p>`
			: html``
	}
<p class="section-note">A team's second and third waiver keepers are cheaper under rulebook §5.3 (rounds 9 and 8). That depends on which players a team decides to keep, so every player here is priced on his own.</p>
</section>`;
}
