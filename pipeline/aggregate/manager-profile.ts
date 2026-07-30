/**
 * One profile per manager. Pure functions, no I/O.
 *
 * Scope discipline (rule 7): regular season and playoffs are computed separately
 * and never merged. Best and worst game are records, so each exists once per
 * scope rather than once overall.
 *
 * **The playoff scope is the `Championship` bracket only** (D20) — semifinals,
 * the final, and the third-place game. Consolation games are classified in the
 * model but deliberately absent from every scope here: the league does not count
 * them as playoff games, and they must not be folded into the regular season
 * either.
 */

import type {
	Manager,
	ManagerId,
	PlayerGame,
	PlayoffBracket,
	SeasonStandings,
	TeamGame,
	Trade,
	Year,
} from "../model.ts";
import type { AllTimeRow, AllTimeTable } from "./all-time.ts";
import { winPercentage } from "./standings.ts";

export interface GameRecord {
	year: Year;
	week: number;
	points: number;
	opponentName: string;
	opponentPoints: number;
	won: boolean;
}

export interface ScopeRecords {
	best?: GameRecord;
	worst?: GameRecord;
	games: number;
}

export interface HeadToHeadRow {
	opponentId: ManagerId;
	opponentName: string;
	avatar?: string;
	wins: number;
	losses: number;
	draws: number;
	games: number;
	pointsFor: number;
	pointsAgainst: number;
	winPct: number;
	/** Points per meeting, not per season. */
	pointsPerGame: number;
}

export interface StarterRow {
	playerId: string;
	playerName: string;
	starts: number;
	/** Points scored *while started* — bench appearances are excluded. */
	points: number;
	pointsPerStart: number;
}

export interface TradeSideView {
	direction: "in" | "out";
	otherName: string;
	items: string[];
}

export interface TradeView {
	date: string;
	week: number;
	otherName: string;
	/** What this manager received, and what they gave up. */
	sides: TradeSideView[];
}

export interface SeasonTrades {
	year: Year;
	trades: TradeView[];
}

export interface ManagerProfile {
	managerId: ManagerId;
	displayName: string;
	slug: string;
	avatar?: string;
	seasons: Year[];
	championships: Year[];
	topScorerSeasons: Year[];
	career: AllTimeRow;
	regular: ScopeRecords;
	/** `Championship` bracket only — never consolation games (D20). */
	playoff: ScopeRecords;
	/** Head-to-head, per scope. Rule 7 names H2H explicitly: never merged. */
	h2hRegular: HeadToHeadRow[];
	h2hPlayoff: HeadToHeadRow[];
	topStarters: StarterRow[];
	tradesByYear: SeasonTrades[];
	tradeCount: number;
}

export interface ProfileInputs {
	managers: ReadonlyMap<ManagerId, Manager>;
	seasons: readonly SeasonStandings[];
	playoffs: ReadonlyMap<Year, PlayoffBracket>;
	games: readonly TeamGame[];
	playerGames: readonly PlayerGame[];
	trades: readonly Trade[];
	allTime: AllTimeTable;
}

const TOP_STARTER_COUNT = 10;

export function buildManagerProfiles(inputs: ProfileInputs): ManagerProfile[] {
	const championsByYear = championsPerYear(inputs.playoffs);
	const topScorersByYear = topScorersPerYear(inputs.seasons);
	const nameOf = (id: ManagerId): string =>
		inputs.managers.get(id)?.displayName ?? `Unknown manager (${id})`;

	const profiles: ManagerProfile[] = [];

	for (const career of inputs.allTime.rows) {
		const id = career.managerId;
		const manager = inputs.managers.get(id);
		const years = inputs.seasons
			.filter((s) => s.rows.some((r) => r.managerId === id))
			.map((s) => s.year);

		const mine = inputs.games.filter((g) => g.managerId === id);

		const profile: ManagerProfile = {
			managerId: id,
			displayName: career.displayName,
			slug: manager?.slug ?? id,
			seasons: years,
			championships: [...championsByYear].filter(([, w]) => w === id).map(([y]) => y).sort((a, b) => a - b),
			topScorerSeasons: [...topScorersByYear].filter(([, w]) => w === id).map(([y]) => y).sort((a, b) => a - b),
			career,
			regular: scopeRecords(mine, "regular", nameOf),
			playoff: scopeRecords(mine, "playoff", nameOf),
			h2hRegular: headToHead(mine, "regular", inputs.managers),
			h2hPlayoff: headToHead(mine, "playoff", inputs.managers),
			topStarters: topStarters(inputs.playerGames, id),
			tradesByYear: tradesFor(inputs.trades, id, nameOf),
			tradeCount: inputs.trades.filter((t) => t.participantIds.includes(id)).length,
		};

		// The avatar from the manager's most recent season, matching the all-time
		// table — for someone who has left, that is the last season they played.
		if (career.avatar !== undefined) profile.avatar = career.avatar;

		profiles.push(profile);
	}

	return profiles;
}

/**
 * The champion is the winner of the final — the `Championship`-bracket game in
 * the highest round. Consolation-bracket winners are not champions.
 */
function championsPerYear(playoffs: ReadonlyMap<Year, PlayoffBracket>): Map<Year, ManagerId> {
	const champions = new Map<Year, ManagerId>();
	for (const [year, bracket] of playoffs) champions.set(year, bracket.final.winner);
	return champions;
}

/** Most regular-season points in a season. Measured: no season has a tie. */
function topScorersPerYear(seasons: readonly SeasonStandings[]): Map<Year, ManagerId> {
	const tops = new Map<Year, ManagerId>();
	for (const season of seasons) {
		let leader: { id: ManagerId; points: number } | null = null;
		for (const row of season.rows) {
			if (!leader || row.pointsFor > leader.points) {
				leader = { id: row.managerId, points: row.pointsFor };
			}
		}
		if (leader) tops.set(season.year, leader.id);
	}
	return tops;
}

function scopeRecords(
	games: readonly TeamGame[],
	type: TeamGame["type"],
	nameOf: (id: ManagerId) => string,
): ScopeRecords {
	const scoped = games.filter((g) => g.type === type);
	if (scoped.length === 0) return { games: 0 };

	let best = scoped[0] as TeamGame;
	let worst = scoped[0] as TeamGame;
	for (const game of scoped) {
		if (game.points > best.points) best = game;
		if (game.points < worst.points) worst = game;
	}

	return { best: toRecord(best, nameOf), worst: toRecord(worst, nameOf), games: scoped.length };
}

function toRecord(game: TeamGame, nameOf: (id: ManagerId) => string): GameRecord {
	return {
		year: game.year,
		week: game.week,
		points: game.points,
		opponentName: nameOf(game.opponentId),
		opponentPoints: game.opponentPoints,
		won: game.points > game.opponentPoints,
	};
}

/**
 * Head-to-head against every opponent this manager has faced, within one scope.
 *
 * Rule 7 names H2H explicitly among the things that are computed twice and
 * displayed separately. A single merged table would put a nine-season rivalry of
 * 18 regular-season meetings next to a single playoff game and present them as
 * comparable.
 *
 * Ordered by record — most wins first, then win percentage, then points scored,
 * then name so the order is total (NFR-9). Draws are possible: 2019 contains one
 * drawn game, so a meeting is a draw when the two scores are equal rather than
 * being folded into a loss.
 */
function headToHead(
	games: readonly TeamGame[],
	type: TeamGame["type"],
	managers: ReadonlyMap<ManagerId, Manager>,
): HeadToHeadRow[] {
	const byOpponent = new Map<ManagerId, HeadToHeadRow>();

	for (const game of games) {
		if (game.type !== type) continue;

		let row = byOpponent.get(game.opponentId);
		if (!row) {
			const opponent = managers.get(game.opponentId);
			row = {
				opponentId: game.opponentId,
				opponentName: opponent?.displayName ?? `Unknown manager (${game.opponentId})`,
				...(opponent?.latestAvatar === undefined ? {} : { avatar: opponent.latestAvatar }),
				wins: 0,
				losses: 0,
				draws: 0,
				games: 0,
				pointsFor: 0,
				pointsAgainst: 0,
				winPct: 0,
				pointsPerGame: 0,
			};
			byOpponent.set(game.opponentId, row);
		}

		row.games++;
		row.pointsFor += game.points;
		row.pointsAgainst += game.opponentPoints;
		if (game.points > game.opponentPoints) row.wins++;
		else if (game.points < game.opponentPoints) row.losses++;
		else row.draws++;
	}

	for (const row of byOpponent.values()) {
		row.winPct = winPercentage(row.wins, row.losses, row.draws);
		row.pointsPerGame = row.games === 0 ? 0 : row.pointsFor / row.games;
	}

	return [...byOpponent.values()].sort(
		(a, b) =>
			b.wins - a.wins ||
			b.winPct - a.winPct ||
			b.pointsFor - a.pointsFor ||
			(a.opponentName < b.opponentName ? -1 : a.opponentName > b.opponentName ? 1 : 0),
	);
}

/**
 * Most-started players.
 *
 * Counts lineup appearances, not roster membership — a player who sat on the
 * bench for a season contributes nothing here. Points are likewise only those
 * scored while started, and they are already sign-corrected (D17), so a
 * negative game reduces the total instead of inflating it.
 */
function topStarters(playerGames: readonly PlayerGame[], id: ManagerId): StarterRow[] {
	const totals = new Map<string, StarterRow>();

	for (const game of playerGames) {
		if (game.managerId !== id || !game.started) continue;

		const existing = totals.get(game.playerId);
		if (existing) {
			existing.starts++;
			existing.points += game.points;
		} else {
			totals.set(game.playerId, {
				playerId: game.playerId,
				playerName: game.playerName,
				starts: 1,
				points: game.points,
				pointsPerStart: 0,
			});
		}
	}

	return [...totals.values()]
		.map((row) => ({ ...row, pointsPerStart: row.starts === 0 ? 0 : row.points / row.starts }))
		.sort(
			(a, b) =>
				b.starts - a.starts ||
				b.points - a.points ||
				(a.playerName < b.playerName ? -1 : a.playerName > b.playerName ? 1 : 0),
		)
		.slice(0, TOP_STARTER_COUNT);
}

function tradesFor(
	trades: readonly Trade[],
	id: ManagerId,
	nameOf: (id: ManagerId) => string,
): SeasonTrades[] {
	const byYear = new Map<Year, TradeView[]>();

	for (const trade of trades) {
		if (!trade.participantIds.includes(id)) continue;

		const other = trade.participantIds.find((p) => p !== id);
		const sides: TradeSideView[] = [];

		for (const leg of trade.legs) {
			const items = leg.items.map(describeItem);
			if (leg.toId === id) sides.push({ direction: "in", otherName: nameOf(leg.fromId), items });
			else if (leg.fromId === id) sides.push({ direction: "out", otherName: nameOf(leg.toId), items });
		}

		// Received first: what a manager got is the more interesting half.
		sides.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1));

		const view: TradeView = {
			date: trade.date,
			week: trade.week,
			otherName: other === undefined ? "Unknown" : nameOf(other),
			sides,
		};

		const list = byYear.get(trade.year);
		if (list) list.push(view);
		else byYear.set(trade.year, [view]);
	}

	return [...byYear]
		.sort(([a], [b]) => b - a)
		.map(([year, list]) => ({
			year,
			trades: list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
		}));
}

function describeItem(item: Trade["legs"][number]["items"][number]): string {
	return item.kind === "player" ? item.playerName : `${item.year} round ${item.round} pick`;
}
