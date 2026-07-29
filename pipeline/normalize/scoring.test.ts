import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { RawPlayerMatchupStat, RawSettings } from "../load/types.ts";
import { correctScore, recomputeScore } from "./scoring.ts";

/** 2017's real settings — the season with kickers, defenses and negative tiers. */
const SETTINGS: RawSettings = {
	year: 2017,
	rosterPositions: {},
	offenseSettings: {
		fum_lost: -2,
		fum_rec_td: 6,
		pass_2pt: 2,
		pass_int: -2,
		pass_td: 4,
		pass_yd: 0.04,
		rec: 0.5,
		rec_2pt: 2,
		rec_td: 6,
		rec_yd: 0.1,
		rush_2pt: 2,
		rush_td: 6,
		rush_yd: 0.1,
	},
	kickingSettings: { fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 3, fgm_50p: 5, xpm: 1 },
	dstSettings: {
		def_2pt: 2,
		def_td: 6,
		fum_rec: 2,
		int: 2,
		pts_allow_0: 10,
		pts_allow_14_20: 1,
		pts_allow_1_6: 7,
		pts_allow_21_27: 0,
		pts_allow_28_34: -1,
		pts_allow_35p: -4,
		pts_allow_7_13: 4,
		sack: 1,
		safe: 2,
	},
	otherSettings: {},
};

function record(pts: number, stats: Record<string, number>): RawPlayerMatchupStat {
	return {
		matchupId: "2017-10-4-9",
		teamId: "4",
		playerId: "1",
		pos: "DEF",
		nflTeam: "DEN",
		status: "ST",
		pts,
		stats,
	};
}

const NO_DEF_STATS = {
	def_2pt: 0,
	def_st_td: 0,
	def_td: 0,
	fum_rec: 0,
	int: 0,
	pts_allow: 0,
	sack: 0,
	safe: 0,
};

describe("recomputeScore", () => {
	test("prices defensive points-allowed through the tier table", () => {
		// Denver, week 10 2017: allowed 41 (-4) with one sack (+1) = -3.00
		const r = record(3, { ...NO_DEF_STATS, pts_allow: 41, sack: 1 });
		assert.equal(recomputeScore(r, "DEF", SETTINGS), -3);
	});

	test("values a special-teams touchdown at 6, which dstSettings omits (D12)", () => {
		const without = record(0, { ...NO_DEF_STATS, pts_allow: 24 });
		const with1 = record(0, { ...NO_DEF_STATS, pts_allow: 24, def_st_td: 1 });
		assert.equal(recomputeScore(without, "DEF", SETTINGS), 0);
		assert.equal(recomputeScore(with1, "DEF", SETTINGS), 6);
	});

	test("an all-zero stats row scores 0, not a shutout (D18)", () => {
		// The cancelled Bills-Bengals game, week 17 2022. A naive tier lookup
		// reads pts_allow: 0 as a shutout and awards +10.
		const r = record(0, { ...NO_DEF_STATS });
		assert.equal(recomputeScore(r, "DEF", SETTINGS), 0);
	});

	test("uses the real position, not the lineup slot (D3)", () => {
		// `pos` on the record says DEF, but this player is a kicker.
		const r = record(9, { fgm_30_39: 3 });
		assert.equal(recomputeScore(r, "K", SETTINGS), 9);
	});

	test("prices offensive stats", () => {
		const r = record(0, { pass_yd: 300, pass_td: 2, pass_int: 1 });
		assert.equal(recomputeScore(r, "QB", SETTINGS), 300 * 0.04 + 8 - 2);
	});
});

describe("correctScore", () => {
	test("negates a defense whose magnitude was stored", () => {
		const r = record(3, { ...NO_DEF_STATS, pts_allow: 41, sack: 1 });
		assert.deepEqual(correctScore(r, "DEF", SETTINGS), { points: -3, corrected: true });
	});

	test("negates an offensive player who went negative on turnovers", () => {
		// 20 rushing yards (2.0) with two fumbles lost (-4) = -2.00, stored as 2.00.
		const r = record(2, { rush_yd: 20, fum_lost: 2 });
		assert.deepEqual(correctScore(r, "RB", SETTINGS), { points: -2, corrected: true });
	});

	test("leaves a positive score alone", () => {
		const r = record(12.4, { rush_yd: 64, rush_td: 1 });
		assert.deepEqual(correctScore(r, "RB", SETTINGS), { points: 12.4, corrected: false });
	});

	test("leaves a negative recomputation alone when the magnitude does NOT match", () => {
		// This is the important guard. The recomputation is negative, but the
		// export does not equal its absolute value, so the two disagree for some
		// other reason — yardage drift affects ~4% of records. D6 says do not
		// substitute our arithmetic; only the provable sign case is corrected.
		const r = record(5, { rush_yd: 20, fum_lost: 2 });
		assert.deepEqual(correctScore(r, "RB", SETTINGS), { points: 5, corrected: false });
	});

	test("leaves a zero alone", () => {
		const r = record(0, { rush_yd: 0 });
		assert.deepEqual(correctScore(r, "RB", SETTINGS), { points: 0, corrected: false });
	});
});
