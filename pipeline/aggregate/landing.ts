/**
 * The landing page's data: a hall of fame, league records, and links into
 * everything else (§10). Pure, no I/O.
 *
 * Everything here is derived from views the other pages already use, so the
 * front page cannot drift from the pages it links to.
 */

import type { ManagerId, PlayerGame, SeasonStandings, Year } from "../model.ts";
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
