/**
 * One season's regular-season standings, joined to manager identity.
 *
 * Authority rule for this stage: `regular-season-standings-history.json` is the
 * source for every figure. Nothing here is derived from `matchup-history.json`
 * or from player statistics — see `crossCheckPointsFor` for why the matchup file
 * is read at all.
 */

import type { RawLeague, RawSeason } from "../load/types.ts";
import type { ManagerId, SeasonStandings, StandingRow } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";

export function normalizeStandings(
	league: RawLeague,
	year: number,
	teamToManager: Map<string, ManagerId>,
	v: ValidationCollector,
): SeasonStandings | null {
	const season = league.seasons.find((s) => s.year === year);
	if (!season) {
		v.error(CODES.SEASON_NOT_FOUND, `Season ${year} was not loaded.`, {
			league: league.folderName,
			year,
		});
		return null;
	}

	const regularSeasonWeeks = deriveRegularSeasonWeeks(league.folderName, season, v);
	if (regularSeasonWeeks === null) return null;

	const rows: StandingRow[] = [];
	for (const raw of season.regularSeasonStandings) {
		const managerId = teamToManager.get(raw.teamId);
		if (managerId === undefined) {
			v.error(
				CODES.UNRESOLVED_MANAGER,
				`teamId "${raw.teamId}" in ${year} has no manager; cross-season identity is impossible.`,
				{ league: league.folderName, year, file: "regular-season-standings-history.json" },
			);
			return null;
		}
		rows.push({
			managerId,
			teamId: raw.teamId,
			overallRank: raw.overallRank,
			wins: raw.wins,
			losses: raw.losses,
			draws: raw.draws,
			pointsFor: raw.pointsFor,
			pointsAgainst: raw.pointsAgainst,
		});
	}

	// The league's own rank carries its tiebreak, which we do not know and must
	// not reinvent (§13.3). Ordering by it is not the same as sorting by record.
	rows.sort((a, b) => a.overallRank - b.overallRank);

	crossCheckPointsFor(league.folderName, season, regularSeasonWeeks, v);

	return { year, regularSeasonWeeks, rows };
}

/**
 * D5: regular-season length is derived per season, never hardcoded. It really
 * does vary — 15 weeks, except 14 in 2018-2020.
 */
function deriveRegularSeasonWeeks(
	league: string,
	season: RawSeason,
	v: ValidationCollector,
): number | null {
	const counts = new Set(season.regularSeasonStandings.map((r) => r.wins + r.losses + r.draws));

	if (counts.size !== 1) {
		v.error(
			CODES.INCONSISTENT_GAME_COUNT,
			`Teams in ${season.year} played differing numbers of games (${[...counts].sort((a, b) => a - b).join(", ")}), ` +
				`so the regular-season length cannot be derived.`,
			{ league, year: season.year, file: "regular-season-standings-history.json" },
		);
		return null;
	}

	return [...counts][0] ?? null;
}

/**
 * Cross-check, not a substitution.
 *
 * `pointsFor` is displayed exactly as the league recorded it. But trusting a
 * file blindly is how a corrupted one renders plausibly, so we independently sum
 * weeks `1..regularSeasonWeeks` from `matchup-history.json` and report any
 * divergence. The computed value is never displayed and never overwrites the
 * recorded one — `matchup-history` is authoritative for *game* scores, and the
 * standings file for *season* totals.
 *
 * Verified to agree to the cent for all ten teams in all nine seasons.
 */
function crossCheckPointsFor(
	league: string,
	season: RawSeason,
	regularSeasonWeeks: number,
	v: ValidationCollector,
): void {
	const summed = new Map<string, number>();
	for (const game of season.matchups) {
		// Weeks arrive lexically sorted in the export; comparing numerically is
		// what makes this boundary correct (D8).
		if (Number(game.week) > regularSeasonWeeks) continue;
		summed.set(game.team1Id, (summed.get(game.team1Id) ?? 0) + game.team1Points);
		summed.set(game.team2Id, (summed.get(game.team2Id) ?? 0) + game.team2Points);
	}

	for (const row of season.regularSeasonStandings) {
		const computed = round2(summed.get(row.teamId) ?? 0);
		if (Math.abs(computed - row.pointsFor) > 0.005) {
			v.error(
				CODES.POINTS_FOR_MISMATCH,
				`teamId "${row.teamId}": standings records pointsFor ${row.pointsFor.toFixed(2)}, ` +
					`but weeks 1-${regularSeasonWeeks} of matchup-history sum to ${computed.toFixed(2)}. ` +
					`The standings figure is displayed regardless; this is a data integrity warning.`,
				{ league, year: season.year, file: "regular-season-standings-history.json" },
			);
		}
	}
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
