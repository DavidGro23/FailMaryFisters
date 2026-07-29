/**
 * Stage 1 entry point: `raw-data/` in, parsed records plus a validation report out.
 *
 * Stage boundary (CLAUDE.md): this stage knows raw file shapes and nothing else.
 * It does not build the manager registry, classify games, resolve player names,
 * derive display names, or reconcile the FLEX/WRRB_FLEX slot vocabularies. All
 * of that is stage 2's job, and putting any of it here would smear per-year
 * weirdness across stage boundaries.
 */

import {
	checkHandWrittenFiles,
	checkSeasonFiles,
	discoverLeagues,
	type DiscoveredLeague,
	type DiscoveredSeason,
} from "./discover.ts";
import {
	parseDraft,
	parseEndRoster,
	parseEndStandings,
	parseManagers,
	parseMatchups,
	parsePlayers,
	parsePlayerStats,
	parsePlayoffs,
	parseRegularSeasonStandings,
	parseSettings,
	parseTrades,
} from "./parsers.ts";
import type { RawLeague, RawPlayer, RawSeason } from "./types.ts";
import {
	CODES,
	ValidationCollector,
	type IssueLocation,
	type ValidationReport,
} from "./validation.ts";

export interface LoadResult {
	leagues: RawLeague[];
	validation: ValidationReport;
	/** True if no error-severity issue was raised. */
	ok: boolean;
}

export function loadRawData(rawDataRoot: string): LoadResult {
	const v = new ValidationCollector();
	const leagues: RawLeague[] = [];

	for (const discovered of discoverLeagues(rawDataRoot, v)) {
		leagues.push(loadLeague(discovered, v));
	}

	return { leagues, validation: v.report(), ok: v.errorCount === 0 };
}

function loadLeague(league: DiscoveredLeague, v: ValidationCollector): RawLeague {
	const where: Omit<IssueLocation, "file"> = { league: league.folderName };

	const players = parsePlayers(league.path, where, v);
	const handWritten = checkHandWrittenFiles(league, v);

	const seasons: RawSeason[] = [];
	for (const season of league.seasons) {
		const parsed = loadSeason(league, season, v);
		if (parsed) seasons.push(parsed);
	}

	reportRegistryCoverage(league.folderName, seasons, players.records, v);

	return {
		leagueId: league.leagueId,
		slug: league.slug,
		folderName: league.folderName,
		players: players.records,
		seasons,
		handWritten,
	};
}

function loadSeason(
	league: DiscoveredLeague,
	season: DiscoveredSeason,
	v: ValidationCollector,
): RawSeason | null {
	const where: Omit<IssueLocation, "file"> = { league: league.folderName, year: season.year };

	if (!checkSeasonFiles(league.folderName, season, v)) {
		v.error(CODES.SEASON_SKIPPED, `Season ${season.year} skipped: expected files are missing.`, where);
		return null;
	}

	const dir = season.path;
	const managers = parseManagers(dir, where, v);
	const regularSeasonStandings = parseRegularSeasonStandings(dir, where, v);
	const endStandings = parseEndStandings(dir, where, v);
	const matchups = parseMatchups(dir, where, v);
	const playoffs = parsePlayoffs(dir, where, v);
	const draft = parseDraft(dir, where, v);
	const endRoster = parseEndRoster(dir, where, v);
	const playerStats = parsePlayerStats(dir, where, v);
	const trades = parseTrades(dir, where, v);
	const settings = parseSettings(dir, where, v);

	const allOk =
		managers.ok &&
		regularSeasonStandings.ok &&
		endStandings.ok &&
		matchups.ok &&
		playoffs.ok &&
		draft.ok &&
		endRoster.ok &&
		playerStats.ok &&
		trades.ok &&
		settings.ok;

	if (!allOk || !settings.settings) {
		v.error(CODES.SEASON_SKIPPED, `Season ${season.year} skipped: one or more files failed validation.`, where);
		return null;
	}

	const parsed: RawSeason = {
		year: season.year,
		managers: managers.records,
		regularSeasonStandings: regularSeasonStandings.records,
		endStandings: endStandings.records,
		matchups: matchups.records,
		playoffs: playoffs.records,
		draft: draft.records,
		endRoster: endRoster.records,
		playerStats: playerStats.records,
		trades: trades.records,
		settings: settings.settings,
	};

	checkSeasonYears(league.folderName, parsed, v);
	checkTeamReferences(league.folderName, parsed, v);

	return parsed;
}

/**
 * Every record carrying a `year` must agree with the folder it came from.
 * A mismatch means a file was copied into the wrong season directory — which
 * would silently attribute a whole season's games to the wrong year.
 */
function checkSeasonYears(league: string, season: RawSeason, v: ValidationCollector): void {
	const check = (file: string, years: Array<number | undefined>): void => {
		years.forEach((year, index) => {
			if (year !== undefined && year !== season.year) {
				v.error(
					CODES.YEAR_MISMATCH,
					`Record has year ${year} but sits in the ${season.year} folder.`,
					{ league, year: season.year, file, recordIndex: index, field: "year" },
				);
			}
		});
	};

	check("managers-history.json", season.managers.map((r) => r.year));
	check("regular-season-standings-history.json", season.regularSeasonStandings.map((r) => r.year));
	check("end-standings-history.json", season.endStandings.map((r) => r.year));
	check("matchup-history.json", season.matchups.map((r) => r.year));
	check("playoff-history.json", season.playoffs.map((r) => r.year));
	check("draft-history.json", season.draft.map((r) => r.year));
	check("end-roster-history.json", season.endRoster.map((r) => r.year));
	check("trade-history.json", season.trades.map((r) => r.year));
	check("settings-history.json", [season.settings.year]);
}

/**
 * D1: every `(year, teamId)` must resolve against that season's managers file.
 *
 * This is the only cross-file check stage 1 performs. It is pure set membership
 * over raw records — it needs nothing from the canonical model — and catching an
 * unresolvable pair here means no later code ever gets the chance to join on it
 * and silently merge two people's careers.
 */
function checkTeamReferences(league: string, season: RawSeason, v: ValidationCollector): void {
	const known = new Set(season.managers.map((m) => m.teamId));
	if (known.size === 0) return;

	const report = (file: string, index: number, field: string, teamId: string): void => {
		if (!known.has(teamId)) {
			v.error(
				CODES.UNRESOLVED_TEAM_ID,
				`teamId "${teamId}" does not appear in the ${season.year} managers file.`,
				{ league, year: season.year, file, recordIndex: index, field },
			);
		}
	};

	season.regularSeasonStandings.forEach((r, i) =>
		report("regular-season-standings-history.json", i, "teamId", r.teamId),
	);
	season.endStandings.forEach((r, i) => report("end-standings-history.json", i, "teamId", r.teamId));
	season.matchups.forEach((r, i) => {
		report("matchup-history.json", i, "team1Id", r.team1Id);
		report("matchup-history.json", i, "team2Id", r.team2Id);
	});
	season.playoffs.forEach((r, i) => {
		report("playoff-history.json", i, "team1Id", r.team1Id);
		report("playoff-history.json", i, "team2Id", r.team2Id);
		report("playoff-history.json", i, "winner", r.winner);
	});
	season.draft.forEach((r, i) => report("draft-history.json", i, "teamId", r.teamId));
	season.endRoster.forEach((r, i) => report("end-roster-history.json", i, "teamId", r.teamId));
	season.playerStats.forEach((r, i) =>
		report("player-matchup-statistics-history.json", i, "teamId", r.teamId),
	);
	season.trades.forEach((trade, i) => {
		trade.transaction.forEach((leg, legIndex) => {
			report("trade-history.json", i, `transaction[${legIndex}].from`, leg.from);
			report("trade-history.json", i, `transaction[${legIndex}].to`, leg.to);
		});
	});
}

/**
 * `players.json` is incomplete. Reported at `info` per missing id, not per
 * reference: four ids account for every gap in nine seasons, and stage 2 renders
 * them as `Unknown Player (<id>)` rather than failing.
 */
function reportRegistryCoverage(
	league: string,
	seasons: RawSeason[],
	players: RawPlayer[],
	v: ValidationCollector,
): void {
	if (players.length === 0) return;
	const known = new Set(players.map((p) => p.playerId));

	for (const season of seasons) {
		const referenced = new Set<string>();
		for (const r of season.draft) referenced.add(r.playerId);
		for (const r of season.endRoster) referenced.add(r.playerId);
		for (const r of season.playerStats) referenced.add(r.playerId);
		for (const trade of season.trades) {
			for (const leg of trade.transaction) {
				for (const send of leg.sends) {
					if (send.type === "player") referenced.add(send.playerId);
				}
			}
		}

		for (const id of [...referenced].filter((i) => !known.has(i)).sort()) {
			v.info(CODES.PLAYER_NOT_IN_REGISTRY, `playerId "${id}" is referenced but absent from players.json.`, {
				league,
				year: season.year,
				file: "players.json",
				field: "playerId",
			});
		}
	}
}
