import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Manager, ManagerId, SeasonStandings, SeasonTeam, StandingRow } from "../model.ts";
import { buildStandingsTable, winPercentage } from "./standings.ts";

/** `teamNames` is a convenience: year -> team name, or year -> full SeasonTeam. */
function manager(
	id: string,
	displayName: string,
	teamNames: Record<number, string | SeasonTeam> = {},
): Manager {
	const teamsByYear: Record<number, SeasonTeam> = {};
	for (const [year, value] of Object.entries(teamNames)) {
		teamsByYear[Number(year)] =
			typeof value === "string" ? { teamId: "1", teamName: value } : value;
	}
	// Mirrors what normalize does: newest season with an avatar wins.
	const latestAvatar = Object.keys(teamsByYear)
		.map(Number)
		.sort((a, b) => b - a)
		.map((y) => teamsByYear[y]?.avatar)
		.find((a) => a !== undefined);

	return {
		id,
		displayName,
		slug: id,
		teamsByYear,
		...(latestAvatar === undefined ? {} : { latestAvatar }),
	};
}

function row(partial: Partial<StandingRow> & { overallRank: number; managerId: string }): StandingRow {
	return {
		teamId: "1",
		wins: 0,
		losses: 0,
		draws: 0,
		pointsFor: 0,
		pointsAgainst: 0,
		...partial,
	};
}

function standings(year: number, rows: StandingRow[], regularSeasonWeeks = 15): SeasonStandings {
	return { year, regularSeasonWeeks, rows };
}

describe("winPercentage (D9)", () => {
	test("counts a draw as half a win", () => {
		// 2019 Saintology: 7-6-1 -> (7 + 0.5) / 14
		assert.equal(winPercentage(7, 6, 1), 7.5 / 14);
	});

	test("is not W / (W + L)", () => {
		// The naive formula would give 7/13 here; the correct one divides by games.
		assert.notEqual(winPercentage(7, 6, 1), 7 / 13);
	});

	test("handles a clean record", () => {
		assert.equal(winPercentage(12, 3, 0), 0.8);
	});

	test("returns 0 rather than dividing by zero", () => {
		assert.equal(winPercentage(0, 0, 0), 0);
	});
});

describe("row ordering (§13.3)", () => {
	// The league's tiebreak is undocumented and is NOT "most points for": in the
	// real 2017 season the rank-1 team scored 1504.84 and the rank-2 team scored
	// 1574.88. Any re-sort by record-then-points would swap them.
	//
	// The rendered season (2025) cannot catch this — there, a naive sort by
	// (wins desc, PF desc) happens to reproduce the correct order. So the shape
	// is tested here with synthetic rows modelled on 2017 instead.
	const managers = new Map<ManagerId, Manager>([
		["m1", manager("m1", "OHood Cardinals")],
		["m2", manager("m2", "true 07 thugs")],
	]);

	test("preserves overallRank even when it contradicts points-for", () => {
		const table = buildStandingsTable(
			standings(2017, [
				row({ overallRank: 2, managerId: "m2", wins: 11, losses: 4, pointsFor: 1574.88 }),
				row({ overallRank: 1, managerId: "m1", wins: 11, losses: 4, pointsFor: 1504.84 }),
			]),
			managers,
		);

		assert.deepEqual(
			table.rows.map((r) => r.overallRank),
			[1, 2],
		);
		// The lower-scoring team is ranked first, as the league recorded.
		assert.equal(table.rows[0]?.displayName, "OHood Cardinals");
		assert.ok((table.rows[0]?.pointsFor ?? 0) < (table.rows[1]?.pointsFor ?? 0));
	});

	test("keeps tied records in their recorded order", () => {
		// 2025 has three teams at 7-8 at ranks 6, 7, 8.
		const tied = new Map<ManagerId, Manager>([
			["a", manager("a", "A")],
			["b", manager("b", "B")],
			["c", manager("c", "C")],
		]);
		const table = buildStandingsTable(
			standings(2025, [
				row({ overallRank: 8, managerId: "c", wins: 7, losses: 8, pointsFor: 1636.92 }),
				row({ overallRank: 6, managerId: "a", wins: 7, losses: 8, pointsFor: 1820.6 }),
				row({ overallRank: 7, managerId: "b", wins: 7, losses: 8, pointsFor: 1703.7 }),
			]),
			tied,
		);
		assert.deepEqual(
			table.rows.map((r) => r.displayName),
			["A", "B", "C"],
		);
	});
});

describe("computed metrics", () => {
	const managers = new Map<ManagerId, Manager>([["m", manager("m", "Railgunners")]]);

	test("points per game divides by games played, not by weeks", () => {
		// Real 2025 rank 1: 1848.60 over 15 games.
		const table = buildStandingsTable(
			standings(2025, [
				row({ overallRank: 1, managerId: "m", wins: 12, losses: 3, pointsFor: 1848.6, pointsAgainst: 1530.12 }),
			]),
			managers,
		);
		const first = table.rows[0];
		assert.ok(first);
		assert.equal(first.games, 15);
		assert.equal(Math.round(first.pointsPerGame * 100) / 100, 123.24);
	});

	test("a drawn game still counts toward games played", () => {
		// 2019 Slicerkompanie: 2-11-1 over 14 games.
		const table = buildStandingsTable(
			standings(2019, [row({ overallRank: 10, managerId: "m", wins: 2, losses: 11, draws: 1, pointsFor: 1156.24 })], 14),
			managers,
		);
		const first = table.rows[0];
		assert.ok(first);
		assert.equal(first.games, 14);
		assert.equal(Math.round(first.pointsPerGame * 100) / 100, 82.59);
	});
});

describe("manager display name (§6.5, D15)", () => {
	test("uses the canonical name, not the season's team name", () => {
		// Benjamin renamed in 2018. The 2017 standings must read "Saintology".
		const managers = new Map<ManagerId, Manager>([
			["9062581", manager("9062581", "Saintology", { 2017: "LarsVegasRaiders", 2018: "Saintology" })],
		]);
		const table = buildStandingsTable(
			standings(2017, [row({ overallRank: 4, managerId: "9062581", wins: 8, losses: 7 })]),
			managers,
		);
		assert.equal(table.rows[0]?.displayName, "Saintology");
	});

	test("carries the season name separately when it differs", () => {
		const managers = new Map<ManagerId, Manager>([
			["9062581", manager("9062581", "Saintology", { 2017: "LarsVegasRaiders" })],
		]);
		const table = buildStandingsTable(
			standings(2017, [row({ overallRank: 4, managerId: "9062581" })]),
			managers,
		);
		assert.equal(table.rows[0]?.playedAs, "LarsVegasRaiders");
	});

	test("omits the season name when it matches the canonical name", () => {
		const managers = new Map<ManagerId, Manager>([
			["9062581", manager("9062581", "Saintology", { 2025: "Saintology" })],
		]);
		const table = buildStandingsTable(
			standings(2025, [row({ overallRank: 3, managerId: "9062581" })]),
			managers,
		);
		assert.equal(table.rows[0]?.playedAs, undefined);
	});

	test("passes a vendored avatar through untouched", () => {
		const managers = new Map<ManagerId, Manager>([
			["m", manager("m", "Railgunners", { 2025: { teamId: "10", teamName: "Railgunners", avatar: "b7a3eb.jpg" } })],
		]);
		const table = buildStandingsTable(standings(2025, [row({ overallRank: 1, managerId: "m" })]), managers);
		assert.equal(table.rows[0]?.avatar, "b7a3eb.jpg");
	});

	test("shows the latest avatar on a historical season, not that season's", () => {
		// 2018 is sparse — most managers had no avatar then, and Benjamin's was a
		// stock Saints logo he later replaced. Showing the current one keeps old
		// tables populated and recognisable, the same reasoning as D15's rule for
		// the canonical name.
		const managers = new Map<ManagerId, Manager>([
			[
				"m",
				manager("m", "Saintology", {
					2018: { teamId: "6", teamName: "Saintology", avatar: "NO_1.png" },
					2025: { teamId: "6", teamName: "Saintology", avatar: "current.jpg" },
				}),
			],
		]);
		const table = buildStandingsTable(standings(2018, [row({ overallRank: 4, managerId: "m" })]), managers);
		assert.equal(table.rows[0]?.avatar, "current.jpg");
	});

	test("falls back to an earlier avatar if the latest season had none", () => {
		const managers = new Map<ManagerId, Manager>([
			[
				"m",
				manager("m", "Team", {
					2023: { teamId: "1", teamName: "Team", avatar: "kept.jpg" },
					2025: { teamId: "1", teamName: "Team" },
				}),
			],
		]);
		const table = buildStandingsTable(standings(2025, [row({ overallRank: 1, managerId: "m" })]), managers);
		assert.equal(table.rows[0]?.avatar, "kept.jpg");
	});

	test("leaves a missing avatar undefined rather than inventing a placeholder", () => {
		// The fallback is a rendering decision; aggregate must not pre-empt it by
		// substituting a default image path.
		const managers = new Map<ManagerId, Manager>([
			["m", manager("m", "SG Drugs-Bucs", { 2025: { teamId: "9", teamName: "SG Drugs-Bucs" } })],
		]);
		const table = buildStandingsTable(standings(2025, [row({ overallRank: 10, managerId: "m" })]), managers);
		assert.equal(table.rows[0]?.avatar, undefined);
		assert.equal("avatar" in (table.rows[0] ?? {}), false);
	});

	test("falls back visibly rather than silently for an unknown manager", () => {
		const table = buildStandingsTable(
			standings(2025, [row({ overallRank: 1, managerId: "ghost" })]),
			new Map(),
		);
		assert.equal(table.rows[0]?.displayName, "Unknown manager (ghost)");
	});
});
