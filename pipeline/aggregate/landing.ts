/**
 * The landing page's data: a hall of fame, league records, and links into
 * everything else (§10). Pure, no I/O.
 *
 * Everything here is derived from views the other pages already use, so the
 * front page cannot drift from the pages it links to.
 */

import type { ManagerId, PlayerGame, SeasonStandings, TeamGame, Year } from "../model.ts";
import type { ManagerProfile } from "./manager-profile.ts";

const TOP_PLAYER_COUNT = 3;

export interface ChampionEntry {
	year: Year;
	managerId: ManagerId;
	displayName: string;
	slug: string;
	avatar?: string;
}

export interface LeagueRecord {
	label: string;
	/** Drives the tile's colour without the renderer parsing the label. */
	kind: "high" | "low";
	value: string;
	detail: string;
	slug: string;
	displayName: string;
	/** Set only when the record is shared, naming the other holders. */
	sharedWith?: string;
}

/**
 * Records that share a scope and a span, so the heading can say it once instead
 * of every tile repeating it. Keeping the groups distinct is also what makes
 * rule 7's regular/playoff split visible rather than implied.
 */
export interface LeagueRecordGroup {
	title: string;
	records: LeagueRecord[];
}

export interface LandingView {
	seasons: Year[];
	teamCount: number;
	/** Newest season first. */
	hallOfFame: ChampionEntry[];
	recordGroups: LeagueRecordGroup[];
	/** Managers with at least one title, most titles first. */
	mostTitles: Array<{ profile: ManagerProfile; titles: number }>;
}

export function buildLandingView(
	profiles: readonly ManagerProfile[],
	seasons: readonly SeasonStandings[],
	playerGames: readonly PlayerGame[] = [],
	games: readonly TeamGame[] = [],
): LandingView {
	const hallOfFame: ChampionEntry[] = [];
	for (const profile of profiles) {
		for (const year of profile.championships) {
			const entry: ChampionEntry = {
				year,
				managerId: profile.managerId,
				displayName: profile.displayName,
				slug: profile.slug,
			};
			if (profile.avatar !== undefined) entry.avatar = profile.avatar;
			hallOfFame.push(entry);
		}
	}
	hallOfFame.sort((a, b) => b.year - a.year);

	const mostTitles = profiles
		.filter((p) => p.championships.length > 0)
		.map((profile) => ({ profile, titles: profile.championships.length }))
		.sort(
			(a, b) => b.titles - a.titles || (a.profile.displayName < b.profile.displayName ? -1 : 1),
		);

	// Three groups: single game in each scope, then the full-season totals.
	// Rule 7 forbids merging the scopes, so a playoff blowout is never allowed
	// to displace the regular-season record.
	const groups: LeagueRecordGroup[] = [
		{ title: "Regular season · single game", records: gameExtremes(profiles, "regular") },
		// Semifinals, the final and the third-place game. Consolation games — the
		// 5th- and 7th-place brackets — are not playoff games to this league (D20).
		{ title: "Playoffs · single game", records: gameExtremes(profiles, "playoff") },
		{ title: "Regular season · full season", records: seasonRecords(profiles, seasons) },
		{ title: "Regular season · longest streaks", records: streakRecords(profiles, games) },
		{
			title: "Regular season · best player, single game",
			records: topPlayerGames(profiles, playerGames, "regular"),
		},
	].filter((group) => group.records.length > 0);

	return {
		seasons: seasons.map((s) => s.year).sort((a, b) => a - b),
		teamCount: profiles.length,
		hallOfFame,
		recordGroups: groups,
		mostTitles,
	};
}

interface Extreme {
	profile: ManagerProfile;
	points: number;
	year: Year;
	week: number;
}

function gameExtremes(
	profiles: readonly ManagerProfile[],
	scopeKey: "regular" | "playoff",
): LeagueRecord[] {
	let highest: Extreme | null = null;
	let lowest: Extreme | null = null;

	for (const profile of profiles) {
		const { best, worst } = profile[scopeKey];
		if (best && (!highest || best.points > highest.points)) {
			highest = { profile, points: best.points, year: best.year, week: best.week };
		}
		if (worst && (!lowest || worst.points < lowest.points)) {
			lowest = { profile, points: worst.points, year: worst.year, week: worst.week };
		}
	}

	const toRecord = (label: string, kind: "high" | "low", e: Extreme): LeagueRecord => ({
		label,
		kind,
		value: e.points.toFixed(2),
		detail: `${e.profile.displayName} · ${e.year} week ${e.week}`,
		slug: e.profile.slug,
		displayName: e.profile.displayName,
	});

	const records: LeagueRecord[] = [];
	// Labels drop the scope: the group heading above them already says it.
	if (highest) records.push(toRecord("Highest score", "high", highest));
	if (lowest) records.push(toRecord("Lowest score", "low", lowest));
	return records;
}

/**
 * The best individual performances in one game.
 *
 * Counts **started** players only: a monster week from someone's bench never
 * happened as far as the league is concerned, and it is the kind of number that
 * would otherwise quietly top the list.
 *
 * Points are the sign-corrected values (D17), and each entry is one performance
 * rather than one player — the same player appearing twice would be two entries,
 * which is what "the best single games" means. In the current data the top three
 * are three different players.
 */
function topPlayerGames(
	profiles: readonly ManagerProfile[],
	playerGames: readonly PlayerGame[],
	scope: PlayerGame["type"],
): LeagueRecord[] {
	const byId = new Map(profiles.map((p) => [p.managerId, p]));

	return playerGames
		.filter((g) => g.started && g.type === scope)
		.sort(
			(a, b) =>
				b.points - a.points ||
				a.year - b.year ||
				a.week - b.week ||
				(a.playerName < b.playerName ? -1 : a.playerName > b.playerName ? 1 : 0),
		)
		.slice(0, TOP_PLAYER_COUNT)
		.flatMap((game): LeagueRecord[] => {
			const profile = byId.get(game.managerId);
			if (!profile) return [];
			return [
				{
					label: game.playerName,
					kind: "high",
					value: game.points.toFixed(2),
					detail: `${profile.displayName} · ${game.year} week ${game.week}`,
					slug: profile.slug,
					displayName: profile.displayName,
				},
			];
		});
}

/**
 * The longest runs of consecutive wins and losses.
 *
 * **Streaks run across seasons.** A manager who ends one year on four wins and
 * opens the next with three is on a seven-game streak — the calendar is not a
 * reset. Both current records depend on this: the joint-best 7-win streak spans
 * 2023-24, as does a 9-game losing run.
 *
 * **Regular season only** (rule 7, D20). Playoff *and* consolation games are
 * excluded, which is why this reads `type === "regular"` rather than "not a
 * playoff game" — treating consolation as regular would splice fixtures into the
 * middle of a streak that the league does not count.
 *
 * **A draw breaks both streaks.** It is not a win and not a loss, and a "run of
 * consecutive wins" interrupted by a tie has plainly stopped. Two drawn
 * team-games exist, both in 2019.
 */
function streakRecords(
	profiles: readonly ManagerProfile[],
	games: readonly TeamGame[],
): LeagueRecord[] {
	if (games.length === 0) return [];

	const byId = new Map(profiles.map((p) => [p.managerId, p]));

	interface Streak {
		managerId: ManagerId;
		length: number;
		from: TeamGame;
		to: TeamGame;
	}

	const longest = (wanted: "W" | "L"): Streak[] => {
		const perManager = new Map<ManagerId, TeamGame[]>();
		for (const game of games) {
			if (game.type !== "regular") continue;
			const list = perManager.get(game.managerId);
			if (list) list.push(game);
			else perManager.set(game.managerId, [game]);
		}

		const best: Streak[] = [];
		for (const [managerId, list] of perManager) {
			// Chronological across the whole career — the season boundary is just
			// another gap between two games.
			list.sort((a, b) => a.year - b.year || a.week - b.week);

			let run = 0;
			let start: TeamGame | undefined;
			let top: Streak | null = null;

			for (const game of list) {
				const outcome =
					game.points > game.opponentPoints ? "W" : game.points < game.opponentPoints ? "L" : "D";
				if (outcome !== wanted) {
					run = 0;
					continue;
				}
				if (run === 0) start = game;
				run++;
				if (start && (!top || run > top.length)) {
					top = { managerId, length: run, from: start, to: game };
				}
			}
			if (top) best.push(top);
		}

		// Longest first; ties broken by who got there first, so the order is total
		// and the primary holder is the one who did it earliest.
		return best.sort(
			(a, b) =>
				b.length - a.length ||
				a.from.year - b.from.year ||
				a.from.week - b.from.week ||
				(a.managerId < b.managerId ? -1 : 1),
		);
	};

	const span = (streak: Streak): string =>
		streak.from.year === streak.to.year
			? `${streak.from.year} weeks ${streak.from.week}–${streak.to.week}`
			: `${streak.from.year} week ${streak.from.week} – ${streak.to.year} week ${streak.to.week}`;

	const toRecord = (label: string, kind: "high" | "low", all: Streak[]): LeagueRecord | null => {
		const top = all[0];
		if (!top) return null;
		const profile = byId.get(top.managerId);
		if (!profile) return null;

		const record: LeagueRecord = {
			label,
			kind,
			value: String(top.length),
			detail: `${profile.displayName} · ${span(top)}`,
			slug: profile.slug,
			displayName: profile.displayName,
		};

		// A shared record is named rather than hidden: the win streak really is
		// tied, and showing one holder would read as an outright claim.
		const shared = all
			.filter((s) => s.length === top.length && s.managerId !== top.managerId)
			.map((s) => {
				const other = byId.get(s.managerId);
				return other ? `${other.displayName} (${span(s)})` : null;
			})
			.filter((text): text is string => text !== null);

		if (shared.length > 0) record.sharedWith = shared.join(", ");
		return record;
	};

	const records: LeagueRecord[] = [];
	const wins = toRecord("Longest winning streak", "high", longest("W"));
	const losses = toRecord("Longest losing streak", "low", longest("L"));
	if (wins) records.push(wins);
	if (losses) records.push(losses);
	return records;
}

/**
 * Season point totals.
 *
 * These come from the regular-season standings, so they are regular season by
 * construction. The game count is shown in the detail line rather than hidden,
 * because season length is not constant — 2018-2020 ran 14 games and every
 * other season 15 — so a raw total slightly favours the longer seasons. Rule 8
 * makes PPG the metric for genuine cross-season comparison; this is a headline
 * number, and it says how many games it took.
 */
function seasonRecords(
	profiles: readonly ManagerProfile[],
	seasons: readonly SeasonStandings[],
): LeagueRecord[] {
	const byId = new Map(profiles.map((p) => [p.managerId, p]));

	interface SeasonExtreme {
		managerId: ManagerId;
		points: number;
		year: Year;
		games: number;
	}

	let most: SeasonExtreme | null = null;
	let fewest: SeasonExtreme | null = null;

	for (const season of seasons) {
		for (const row of season.rows) {
			const entry: SeasonExtreme = {
				managerId: row.managerId,
				points: row.pointsFor,
				year: season.year,
				games: row.wins + row.losses + row.draws,
			};
			if (!most || entry.points > most.points) most = entry;
			if (!fewest || entry.points < fewest.points) fewest = entry;
		}
	}

	const toRecord = (
		label: string,
		kind: "high" | "low",
		entry: SeasonExtreme,
	): LeagueRecord | null => {
		const profile = byId.get(entry.managerId);
		if (!profile) return null;
		return {
			label,
			kind,
			value: entry.points.toFixed(2),
			detail: `${profile.displayName} · ${entry.year} · ${entry.games} games`,
			slug: profile.slug,
			displayName: profile.displayName,
		};
	};

	const records: LeagueRecord[] = [];
	const high = most ? toRecord("Most points", "high", most) : null;
	const low = fewest ? toRecord("Fewest points", "low", fewest) : null;
	if (high) records.push(high);
	if (low) records.push(low);
	return records;
}
