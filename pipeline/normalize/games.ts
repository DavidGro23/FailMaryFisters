/**
 * Every game, from both sides, classified as regular season, playoff, or
 * consolation.
 *
 * Classification is by membership in `playoff-history.json` (D4), not by week
 * number — the playoff weeks are 16-17 in most seasons but 15-16 in 2018-2020,
 * so a week threshold would misfile three seasons.
 *
 * **Membership alone is not enough**, which was a real defect: that file holds
 * both brackets, so treating every row in it as a playoff game put 5th- and
 * 7th-place games into the playoff records. Only the `Championship` bracket
 * counts (D20). Measured across the whole export: 1320 regular, 72 playoff and
 * 72 consolation team-games, none unclassified.
 */

import type { RawLeague, RawSeason } from "../load/types.ts";
import type { GameType, ManagerId, TeamGame } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";

function gameKey(year: number, week: number, teamA: string, teamB: string): string {
	const low = Math.min(Number(teamA), Number(teamB));
	const high = Math.max(Number(teamA), Number(teamB));
	return `${year}-${week}-${low}-${high}`;
}

/**
 * Every game in `playoff-history.json`, mapped to which bracket it belongs to,
 * in the same key shape `matchupId` uses.
 *
 * Shared with the player-stat normalizer so both classify a game identically —
 * two independent rules for the same distinction would eventually disagree, and
 * this distinction is exactly the one that has already gone wrong once.
 *
 * `bracketType` is the discriminator, never `roundLabel`: D11 forbids matching
 * labels, and the consolation bracket's first round has an empty one.
 */
export function postseasonKeys(season: RawSeason): Map<string, GameType> {
	const keys = new Map<string, GameType>();
	for (const g of season.playoffs) {
		keys.set(
			gameKey(season.year, g.week, g.team1Id, g.team2Id),
			g.bracketType === "Championship" ? "playoff" : "consolation",
		);
	}
	return keys;
}

export function normalizeGames(
	league: RawLeague,
	season: RawSeason,
	teamToManager: Map<string, ManagerId>,
	v: ValidationCollector,
): TeamGame[] {
	const postseason = postseasonKeys(season);
	const games: TeamGame[] = [];

	for (const raw of season.matchups) {
		const a = teamToManager.get(raw.team1Id);
		const b = teamToManager.get(raw.team2Id);
		if (a === undefined || b === undefined) {
			v.error(
				CODES.UNRESOLVED_MANAGER,
				`Game ${raw.matchupId} references a teamId with no manager in ${season.year}.`,
				{ league: league.folderName, year: season.year, file: "matchup-history.json" },
			);
			continue;
		}

		const type: GameType =
			postseason.get(gameKey(season.year, raw.week, raw.team1Id, raw.team2Id)) ?? "regular";

		// Both sides, so a manager's games can be found without checking which
		// column they happened to land in. `team1`/`team2` carry no meaning
		// beyond ascending teamId.
		games.push({
			year: season.year,
			week: Number(raw.week),
			type,
			managerId: a,
			points: raw.team1Points,
			opponentId: b,
			opponentPoints: raw.team2Points,
		});
		games.push({
			year: season.year,
			week: Number(raw.week),
			type,
			managerId: b,
			points: raw.team2Points,
			opponentId: a,
			opponentPoints: raw.team1Points,
		});
	}

	return games;
}
