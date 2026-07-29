/**
 * D17 — the sign correction.
 *
 * The export cannot represent a negative number. Across 22,637 player-stat
 * records and every end-roster total the minimum value is 0, so a player whose
 * true score was negative appears with the minus sign stripped: a defense that
 * scored −4.00 is stored as 4.00. Offensive players reach negative scores
 * through `fum_lost: -2` and `pass_int: -2`.
 *
 * The correction is deliberately narrow. Each record is recomputed from that
 * season's own settings, and the exported value is negated **if and only if**
 * the recomputation is negative *and* the export equals its absolute value. In
 * every other case the exported value is used untouched — this never
 * substitutes a recomputed score for a disagreeing one, and it never alters a
 * team total, which remains authoritative (D6).
 *
 * Measured over the whole export: 107 records recompute negative, 106 lose the
 * sign, and there are zero counter-examples.
 */

import type { RawPlayerMatchupStat, RawSettings } from "../load/types.ts";

/**
 * `def_st_td` has no counterpart in `dstSettings` — the export simply omits its
 * value. It is worth 6 points, supplied by the league owner and then verified:
 * applying 6 reconciles all 29 records containing a special-teams touchdown
 * (D12).
 */
const SPECIAL_TEAMS_TD_POINTS = 6;

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** `pts_allow` maps to seven tier keys rather than to one scoring key. */
function pointsAllowedTier(allowed: number, dst: Record<string, number>): number {
	if (allowed === 0) return dst["pts_allow_0"] ?? 0;
	if (allowed <= 6) return dst["pts_allow_1_6"] ?? 0;
	if (allowed <= 13) return dst["pts_allow_7_13"] ?? 0;
	if (allowed <= 20) return dst["pts_allow_14_20"] ?? 0;
	if (allowed <= 27) return dst["pts_allow_21_27"] ?? 0;
	if (allowed <= 34) return dst["pts_allow_28_34"] ?? 0;
	return dst["pts_allow_35p"] ?? 0;
}

/** Sums whichever stat keys the given scoring block prices. */
function scoreFromTable(stats: Record<string, number>, table: Record<string, number>): number {
	let total = 0;
	for (const [key, value] of Object.entries(stats)) {
		const price = table[key];
		if (price !== undefined) total += value * price;
	}
	return round2(total);
}

function scoreDefense(stats: Record<string, number>, dst: Record<string, number>): number {
	// D18: an all-zero row means the game was never played, not that the defense
	// pitched a shutout. Only occurrence is the cancelled Bills-Bengals game of
	// week 17, 2022, which would otherwise score +10 off the `pts_allow_0` tier.
	if (Object.values(stats).every((v) => v === 0)) return 0;

	return round2(
		pointsAllowedTier(stats["pts_allow"] ?? 0, dst) +
			scoreFromTable({ ...stats, pts_allow: 0 }, dst) +
			(stats["def_st_td"] ?? 0) * SPECIAL_TEAMS_TD_POINTS,
	);
}

/**
 * Recomputes a player's score from the season's rules.
 *
 * `position` is the player's real position from `players.json`, never the `pos`
 * field on the record — that is the lineup slot (D3).
 */
export function recomputeScore(
	record: RawPlayerMatchupStat,
	position: string,
	settings: RawSettings,
): number {
	if (position === "DEF") return scoreDefense(record.stats, settings.dstSettings);
	if (position === "K") return scoreFromTable(record.stats, settings.kickingSettings);
	return scoreFromTable(record.stats, settings.offenseSettings);
}

export interface CorrectedScore {
	points: number;
	/** True when the stored magnitude was negated. */
	corrected: boolean;
}

export function correctScore(
	record: RawPlayerMatchupStat,
	position: string,
	settings: RawSettings,
): CorrectedScore {
	const recomputed = recomputeScore(record, position, settings);

	// Both conditions are required. A negative recomputation whose magnitude does
	// NOT match the export means the two disagree for some other reason — most
	// often the yardage drift affecting ~4% of records — and D6 says leave that
	// alone rather than substitute our arithmetic.
	if (recomputed < 0 && Math.abs(record.pts - Math.abs(recomputed)) < 0.005) {
		return { points: -record.pts, corrected: true };
	}

	return { points: record.pts, corrected: false };
}
