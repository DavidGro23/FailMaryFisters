/**
 * The championship bracket for one season.
 *
 * Structure is derived, never matched on labels (D11): the final is the
 * `Championship`-bracket game in the highest round whose two teams are the
 * semifinal winners. The third-place game is its sibling in that round,
 * contested by the two semifinal losers. Verified to hold in all nine seasons.
 *
 * Scores come from `playoff-history.json`, which was checked against
 * `matchup-history.json` for every playoff game in every season: they agree to
 * the cent, so this does not put a second source of truth in front of D6.
 */

import type { RawLeague, RawPlayoffGame, RawSeason } from "../load/types.ts";
import type { ManagerId, PlayoffBracket, PlayoffGame, PlayoffSide } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";

export function normalizePlayoffs(
	league: RawLeague,
	season: RawSeason,
	teamToManager: Map<string, ManagerId>,
	v: ValidationCollector,
): PlayoffBracket | null {
	const where = { league: league.folderName, year: season.year, file: "playoff-history.json" };

	const championship = season.playoffs.filter((g) => g.bracketType === "Championship");
	if (championship.length === 0) {
		v.info(CODES.NO_PLAYOFF_BRACKET, `Season ${season.year} has no championship bracket.`, where);
		return null;
	}

	const finalRound = Math.max(...championship.map((g) => g.round));
	const semifinalGames = championship.filter((g) => g.round < finalRound);
	const finalRoundGames = championship.filter((g) => g.round === finalRound);

	const semifinalWinners = new Set(semifinalGames.map((g) => g.winner));
	const decider = finalRoundGames.find(
		(g) => semifinalWinners.has(g.team1Id) && semifinalWinners.has(g.team2Id),
	);

	if (semifinalGames.length === 0 || !decider) {
		v.warn(
			CODES.PLAYOFF_SHAPE_UNEXPECTED,
			`Season ${season.year}: could not identify a final contested by the semifinal winners; ` +
				`the bracket is not rendered.`,
			where,
		);
		return null;
	}

	const toGame = (raw: RawPlayoffGame): PlayoffGame | null => {
		const a = toSide(raw.team1Id, raw.team1Seed, raw.team1Points, teamToManager);
		const b = toSide(raw.team2Id, raw.team2Seed, raw.team2Points, teamToManager);
		const winner = teamToManager.get(raw.winner);
		if (!a || !b || winner === undefined) {
			v.error(
				CODES.UNRESOLVED_MANAGER,
				`Season ${season.year}: a playoff game references a teamId with no manager.`,
				where,
			);
			return null;
		}
		return { week: raw.week, roundLabel: raw.roundLabel, a, b, winner };
	};

	const semifinals: PlayoffGame[] = [];
	for (const raw of [...semifinalGames].sort(bySeed)) {
		const game = toGame(raw);
		if (!game) return null;
		semifinals.push(game);
	}

	const final = toGame(decider);
	if (!final) return null;

	const bracket: PlayoffBracket = { semifinals, final };

	const thirdRaw = finalRoundGames.find((g) => g !== decider);
	if (thirdRaw) {
		const third = toGame(thirdRaw);
		if (!third) return null;
		bracket.thirdPlace = third;
	}

	return bracket;
}

function toSide(
	teamId: string,
	seed: number,
	points: number,
	teamToManager: Map<string, ManagerId>,
): PlayoffSide | null {
	const managerId = teamToManager.get(teamId);
	if (managerId === undefined) return null;
	return { managerId, teamId, seed, points };
}

/** Higher seeds first, so the bracket reads 1-v-4 above 2-v-3. */
function bySeed(a: RawPlayoffGame, b: RawPlayoffGame): number {
	return Math.min(a.team1Seed, a.team2Seed) - Math.min(b.team1Seed, b.team2Seed);
}
