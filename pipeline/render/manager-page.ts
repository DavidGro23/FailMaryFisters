/**
 * One manager's profile.
 *
 * Order follows the request: championships and top-scorer seasons lead, then
 * career totals, records, most-started players, and trades.
 */

import type {
	GameRecord,
	HeadToHeadRow,
	ManagerProfile,
	ScopeRecords,
	SeasonTrades,
	StarterRow,
	TradeView,
} from "../aggregate/manager-profile.ts";
import { url } from "./base-path.ts";
import { points, percent, record } from "./format.ts";
import { html, type SafeHtml } from "./html.ts";
import { managerRoute, seasonRoute } from "./nav.ts";
import {
	renderPage,
	renderPlayerCell,
	renderTeamCell,
	sortableCell,
	sortableHeader,
	tableWrap,
	type TeamCell,
} from "./page.ts";

export function renderManagerPage(profile: ManagerProfile, all: readonly ManagerProfile[]): string {
	const span =
		profile.seasons.length === 0
			? "no seasons"
			: `${profile.seasons[0]}–${profile.seasons[profile.seasons.length - 1]}`;

	return renderPage({
		title: `${profile.displayName} — Fail Mary Fisters`,
		heading: profile.displayName,
		// Spread rather than assigned, so the key is absent instead of
		// present-and-undefined under `exactOptionalPropertyTypes`.
		...(profile.avatar === undefined ? {} : { headingAvatar: profile.avatar }),
		meta: `${profile.seasons.length} season${profile.seasons.length === 1 ? "" : "s"} · ${span}`,
		active: "managers",
		body: html`${renderSwitcher(profile, all)}
${renderHonours(profile)}
${renderCareer(profile)}
${renderRecords(profile)}
${renderHeadToHead(profile)}
${renderStarters(profile)}
${renderTrades(profile)}`,
	});
}

/** Plain links, so every team stays reachable with JavaScript off. */
function renderSwitcher(profile: ManagerProfile, all: readonly ManagerProfile[]): SafeHtml {
	return html`<nav class="seasons teams-switcher" aria-label="Team">
${all.map((other) => {
		const cell: TeamCell = { displayName: other.displayName };
		if (other.avatar !== undefined) cell.avatar = other.avatar;
		const current = other.managerId === profile.managerId;
		return current
			? html`<a class="season-link" href="${url(managerRoute(other.slug))}" aria-current="page">${renderTeamCell(cell)}</a>`
			: html`<a class="season-link" href="${url(managerRoute(other.slug))}">${renderTeamCell(cell)}</a>`;
	})}
</nav>`;
}

/** The two headline counts, as requested. */
function renderHonours(profile: ManagerProfile): SafeHtml {
	return html`<section>
<div class="honours">
${renderHonour("Championships", profile.championships, "title", profile)}
${renderHonour("Top scorer", profile.topScorerSeasons, "season", profile)}
</div>
</section>`;
}

function renderHonour(
	label: string,
	years: readonly number[],
	noun: string,
	profile: ManagerProfile,
): SafeHtml {
	const highlight = years.length > 0 ? "honour honour-earned" : "honour";
	return html`<div class="${highlight}">
<p class="honour-count">${years.length}</p>
<p class="honour-label">${label}</p>
<p class="honour-years">${years.length === 0 ? `no ${noun}s` : years.map((y) => html`<a href="${url(seasonRoute(y))}">${y}</a>`)}</p>
</div>`;
}

function renderCareer(profile: ManagerProfile): SafeHtml {
	const c = profile.career;
	return html`<section>
<h2 class="section-title">Career, regular season</h2>
<p class="section-note">All-time rank ${c.rank} of ${c.seasonsPlayed === 0 ? "—" : "12"}. Same figures as the all-time table.</p>
${tableWrap(
		"t-narrow",
		html`<table class="standings">
<thead>
<tr>
<th class="col-num" scope="col">Seasons</th>
<th class="col-num" scope="col">Record</th>
<th class="col-num" scope="col">Win %</th>
<th class="col-num" scope="col">PF</th>
<th class="col-num" scope="col">PA</th>
<th class="col-num" scope="col">PPG</th>
</tr>
</thead>
<tbody>
<tr>
<td class="col-num" data-label="Seasons">${c.seasonsPlayed}</td>
<td class="col-num" data-label="Record">${record(c.wins, c.losses, c.draws)}</td>
<td class="col-num" data-label="Win %">${percent(c.winPct)}</td>
<td class="col-num" data-label="PF">${points(c.pointsFor)}</td>
<td class="col-num" data-label="PA">${points(c.pointsAgainst)}</td>
<td class="col-num col-emph" data-label="PPG">${points(c.pointsPerGame)}</td>
</tr>
</tbody>
</table>`,
	)}
</section>`;
}

/**
 * Rule 7: regular season and playoffs are never merged. Each scope gets its own
 * pair, so a playoff blowout cannot displace a regular-season high.
 *
 * "Playoffs" means the championship bracket only (D20). Consolation games are
 * excluded, which the note says out loud — a reader comparing these figures
 * against the season pages would otherwise wonder where a low score went.
 */
function renderRecords(profile: ManagerProfile): SafeHtml {
	return html`<section>
<h2 class="section-title">Best and worst games</h2>
<p class="section-note">Regular season and playoffs are kept separate — the samples are not comparable. Playoffs are the semifinals, the final and the third-place game; consolation games do not count.</p>
${renderScope("Regular season", profile.regular)}
${renderScope("Playoffs", profile.playoff)}
</section>`;
}

function renderScope(label: string, scope: ScopeRecords): SafeHtml {
	if (scope.games === 0) {
		return html`<div class="scope">
<h3 class="bracket-round-title">${label}</h3>
<p class="section-note">No games.</p>
</div>`;
	}
	return html`<div class="scope">
<h3 class="bracket-round-title">${label} · ${scope.games} games</h3>
<div class="record-grid">
${scope.best ? renderGameTile("Most points", scope.best, "high") : html``}
${scope.worst ? renderGameTile("Fewest points", scope.worst, "low") : html``}
</div>
</div>`;
}

function renderGameTile(label: string, game: GameRecord, kind: "high" | "low"): SafeHtml {
	return html`<div class="record-tile record-tile-${kind}">
<p class="record-label">${label}</p>
<p class="record-points">${points(game.points)}</p>
<p class="record-detail">
<a href="${url(seasonRoute(game.year))}">${game.year}</a> · week ${game.week} ·
${game.won ? html`<span class="record-outcome-won">won</span>` : html`<span class="record-outcome-lost">lost</span>`}
</p>
<p class="record-detail">vs ${game.opponentName} ${points(game.opponentPoints)}</p>
</div>`;
}

/**
 * Head-to-head. Two tables, because rule 7 names H2H among the things that are
 * never merged — a nine-season rivalry and a single playoff meeting are not
 * comparable samples.
 */
function renderHeadToHead(profile: ManagerProfile): SafeHtml {
	return html`<section>
<h2 class="section-title">Head to head</h2>
<p class="section-note">Ordered by record. Regular season and playoffs are kept separate; consolation games do not count.</p>
${renderH2hTable("Regular season", profile.h2hRegular)}
${renderH2hTable("Playoffs", profile.h2hPlayoff)}
</section>`;
}

function renderH2hTable(label: string, rows: readonly HeadToHeadRow[]): SafeHtml {
	if (rows.length === 0) {
		return html`<div class="scope">
<h3 class="bracket-round-title">${label}</h3>
<p class="section-note">No meetings.</p>
</div>`;
	}

	return html`<div class="scope">
<h3 class="bracket-round-title">${label} · ${rows.length} opponent${rows.length === 1 ? "" : "s"}</h3>
${tableWrap(
		"t-wide",
		html`<table class="standings" data-sortable>
<thead>
<tr>
<th class="col-team" scope="col">Opponent</th>
${sortableHeader("record", "Record")}
${sortableHeader("winPct", "Win %")}
${sortableHeader("pointsFor", "PF")}
${sortableHeader("pointsAgainst", "PA")}
${sortableHeader("pointsPerGame", "PPG")}
</tr>
</thead>
<tbody>
${rows.map(renderH2hRow)}
</tbody>
</table>`,
	)}
</div>`;
}

function renderH2hRow(row: HeadToHeadRow): SafeHtml {
	const cell: TeamCell = { displayName: row.opponentName };
	if (row.avatar !== undefined) cell.avatar = row.avatar;

	return html`<tr>
<td class="col-team" data-label="Opponent">${renderTeamCell(cell)}</td>
${sortableCell("Record", row.wins, record(row.wins, row.losses, row.draws))}
${sortableCell("Win %", row.winPct, percent(row.winPct))}
${sortableCell("PF", row.pointsFor, points(row.pointsFor))}
${sortableCell("PA", row.pointsAgainst, points(row.pointsAgainst))}
${sortableCell("PPG", row.pointsPerGame, points(row.pointsPerGame), true)}
</tr>`;
}

function renderStarters(profile: ManagerProfile): SafeHtml {
	if (profile.topStarters.length === 0) return html``;

	return html`<section>
<h2 class="section-title">Most-started players</h2>
<p class="section-note">Games in a lineup slot, not games on the roster. Points are those scored while started.</p>
${tableWrap(
		"t-medium",
		html`<table class="standings" data-sortable>
<thead>
<tr>
<th class="col-rank" scope="col">#</th>
<th class="col-team" scope="col">Player</th>
${sortableHeader("record", "Starts")}
${sortableHeader("pointsFor", "Points")}
${sortableHeader("pointsPerGame", "Per start")}
</tr>
</thead>
<tbody>
${profile.topStarters.map((row, index) => renderStarter(row, index + 1))}
</tbody>
</table>`,
	)}
</section>`;
}

function renderStarter(row: StarterRow, rank: number): SafeHtml {
	return html`<tr>
<td class="col-rank" data-label="Rank"><span class="rank">${rank}</span></td>
<td class="col-team" data-label="Player">${renderPlayerCell(row.playerName)}</td>
${sortableCell("Starts", row.starts, String(row.starts))}
${sortableCell("Points", row.points, points(row.points))}
${sortableCell("Per start", row.pointsPerStart, points(row.pointsPerStart), true)}
</tr>`;
}

function renderTrades(profile: ManagerProfile): SafeHtml {
	if (profile.tradesByYear.length === 0) {
		return html`<section>
<h2 class="section-title">Trades</h2>
<p class="section-note">No trades.</p>
</section>`;
	}

	return html`<section>
<h2 class="section-title">Trades</h2>
<p class="section-note">${profile.tradeCount} trade${profile.tradeCount === 1 ? "" : "s"}, newest season first.</p>
${profile.tradesByYear.map(renderTradeYear)}
</section>`;
}

function renderTradeYear(group: SeasonTrades): SafeHtml {
	return html`<div class="trade-year">
<h3 class="bracket-round-title"><a href="${url(seasonRoute(group.year))}">${group.year}</a> · ${group.trades.length} trade${group.trades.length === 1 ? "" : "s"}</h3>
${group.trades.map(renderTrade)}
</div>`;
}

function renderTrade(trade: TradeView): SafeHtml {
	return html`<div class="trade">
<p class="trade-head">with <strong>${trade.otherName}</strong> <span class="trade-when">${formatTradeDate(trade.date)}${trade.week > 0 ? `, week ${trade.week}` : ""}</span></p>
${trade.sides.map(
		(side) => html`<p class="trade-side trade-side-${side.direction}">
<span class="trade-arrow" aria-hidden="true">${side.direction === "in" ? "←" : "→"}</span>
<span class="visually-hidden">${side.direction === "in" ? "received" : "gave up"}:</span>
${side.items.join(", ")}
</p>`,
	)}
</div>`;
}

/**
 * `transactionDate` is ISO-8601 without a timezone. It is split textually rather
 * than parsed into a Date, so no timezone is ever applied (§13.1).
 */
function formatTradeDate(iso: string): string {
	const [date] = iso.split("T");
	const parts = (date ?? "").split("-");
	if (parts.length !== 3) return iso;
	return `${parts[2]}.${parts[1]}.${parts[0]}`;
}
