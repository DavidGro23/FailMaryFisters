import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Manager, ManagerId, SeasonStandings, SeasonTeam, StandingRow } from "../model.ts";
import { buildAllTimeTable } from "./all-time.ts";

function manager(id: string, displayName: string, teams: Record<number, SeasonTeam> = {}): Manager {
	// Mirrors normalize: newest season with an avatar wins.
	const latestAvatar = Object.keys(teams)
		.map(Number)
		.sort((a, b) => b - a)
		.map((y) => teams[y]?.avatar)
		.find((a) => a !== undefined);

	return {
		id,
		displayName,
		slug: id,
		teamsByYear: teams,
		...(latestAvatar === undefined ? {} : { latestAvatar }),
	};
}

function row(managerId: string, partial: Partial<StandingRow> = {}): StandingRow {
	return {
		managerId,
		teamId: "1",
		overallRank: 1,
		wins: 0,
		losses: 0,
		draws: 0,
		pointsFor: 0,
		pointsAgainst: 0,
		...partial,
	};
}

function season(year: number, rows: StandingRow[], regularSeasonWeeks = 15): SeasonStandings {
	return { year, regularSeasonWeeks, rows };
}

describe("career totals", () => {
	test("cover only the seasons a player actually managed", () => {
		const managers = new Map<ManagerId, Manager>([
			["long", manager("long", "Long")],
			["short", manager("short", "Short")],
		]);
		const table = buildAllTimeTable(
			[
				season(2024, [row("long", { wins: 10, losses: 5 }), row("short", { wins: 1, losses: 14 })]),
				season(2025, [row("long", { wins: 8, losses: 7 })]),
			],
			managers,
		);

		const long = table.rows.find((r) => r.managerId === "long");
		const short = table.rows.find((r) => r.managerId === "short");
		assert.equal(long?.seasonsPlayed, 2);
		assert.equal(long?.games, 30);
		assert.equal(short?.seasonsPlayed, 1);
		assert.equal(short?.games, 15);
		assert.deepEqual([short?.firstYear, short?.lastYear], [2024, 2024]);
	});

	test("one row per userId, even when a teamId is inherited", () => {
		// teamId 5 passes from one player to another: two careers, never merged.
		const managers = new Map<ManagerId, Manager>([
			["alex", manager("alex", "Soft Gay Fisting")],
			["chris", manager("chris", "Crazy caught carps")],
		]);
		const table = buildAllTimeTable(
			[
				season(2018, [row("alex", { teamId: "5", wins: 6, losses: 8 })], 14),
				season(2019, [row("chris", { teamId: "5", wins: 8, losses: 6 })], 14),
			],
			managers,
		);
		assert.equal(table.rows.length, 2);
		assert.deepEqual(table.rows.map((r) => r.games), [14, 14]);
	});
});

describe("PPG is recomputed from totals, never averaged", () => {
	test("differs from the mean of season PPGs when season lengths differ", () => {
		// 14-game season at 70.00 PPG, then a 15-game season at 140.00 PPG.
		//   totals    : (980 + 2100) / 29           = 106.2069
		//   mean of PPG: (70 + 140) / 2             = 105.0000
		// Averaging would over-weight the shorter season.
		const managers = new Map<ManagerId, Manager>([["m", manager("m", "M")]]);
		const table = buildAllTimeTable(
			[
				season(2018, [row("m", { wins: 7, losses: 7, pointsFor: 980 })], 14),
				season(2019, [row("m", { wins: 7, losses: 8, pointsFor: 2100 })], 15),
			],
			managers,
		);

		const only = table.rows[0];
		assert.ok(only);
		assert.equal(only.games, 29);
		assert.equal(only.pointsFor, 3080);
		assert.equal(Math.round(only.pointsPerGame * 10000) / 10000, 106.2069);

		const meanOfSeasonPpg = (980 / 14 + 2100 / 15) / 2;
		assert.equal(meanOfSeasonPpg, 105);
		assert.notEqual(Math.round(only.pointsPerGame * 100) / 100, Math.round(meanOfSeasonPpg * 100) / 100);
	});

	test("matches the real-data case that motivated the rule", () => {
		// Alex: 2017 (15 games) and 2018 (14 games) — 13-16, 3061.70 points.
		const managers = new Map<ManagerId, Manager>([["alex", manager("alex", "Soft Gay Fisting")]]);
		const table = buildAllTimeTable(
			[
				season(2017, [row("alex", { wins: 9, losses: 6, pointsFor: 1664.86 })], 15),
				season(2018, [row("alex", { wins: 4, losses: 10, pointsFor: 1396.84 })], 14),
			],
			managers,
		);
		const only = table.rows[0];
		assert.ok(only);
		assert.equal(only.games, 29);
		assert.equal(Math.round(only.pointsPerGame * 100) / 100, 105.58);
	});
});

describe("ordering", () => {
	const managers = new Map<ManagerId, Manager>([
		["a", manager("a", "Alpha")],
		["b", manager("b", "Beta")],
		["c", manager("c", "Gamma")],
	]);

	test("sorts by wins descending", () => {
		const table = buildAllTimeTable(
			[
				season(2025, [
					row("a", { wins: 5, losses: 10 }),
					row("b", { wins: 12, losses: 3 }),
					row("c", { wins: 8, losses: 7 }),
				]),
			],
			managers,
		);
		assert.deepEqual(table.rows.map((r) => r.displayName), ["Beta", "Gamma", "Alpha"]);
		assert.deepEqual(table.rows.map((r) => r.rank), [1, 2, 3]);
	});

	test("breaks a wins tie on points for", () => {
		// The real 66-66 (Oakland / OHood) and 60-72 (SG / Magico) cases.
		const table = buildAllTimeTable(
			[
				season(2025, [
					row("a", { wins: 8, losses: 7, pointsFor: 1500 }),
					row("b", { wins: 8, losses: 7, pointsFor: 1700 }),
				]),
			],
			managers,
		);
		assert.deepEqual(table.rows.map((r) => r.displayName), ["Beta", "Alpha"]);
	});

	test("ranks by raw wins, not by rate", () => {
		// A one-season 8-7 manager has the better win percentage but fewer wins
		// than a two-season 12-18 manager, and must still rank below them.
		const table = buildAllTimeTable(
			[
				season(2024, [row("a", { wins: 6, losses: 9, pointsFor: 1000 })]),
				season(2025, [
					row("a", { wins: 6, losses: 9, pointsFor: 1000 }),
					row("b", { wins: 8, losses: 7, pointsFor: 1000 }),
				]),
			],
			managers,
		);
		const a = table.rows.find((r) => r.displayName === "Alpha");
		const b = table.rows.find((r) => r.displayName === "Beta");
		assert.ok(a && b);
		assert.ok(a.winPct < b.winPct, "fixture: the longer career has the worse rate");
		assert.ok(a.wins > b.wins, "fixture: but more total wins");
		assert.deepEqual(table.rows.map((r) => r.displayName), ["Alpha", "Beta"]);
	});

	test("falls back to display name so the order is total", () => {
		const table = buildAllTimeTable(
			[season(2025, [row("b", { wins: 8, losses: 7, pointsFor: 1500 }), row("a", { wins: 8, losses: 7, pointsFor: 1500 })])],
			managers,
		);
		assert.deepEqual(table.rows.map((r) => r.displayName), ["Alpha", "Beta"]);
	});
});

describe("avatar comes from the latest season the player managed", () => {
	test("uses the last one they ever set, for a manager who has left", () => {
		// Alex last played 2018; the export runs to 2025. His 2018 avatar is the
		// most recent he ever used, so that is what shows.
		const managers = new Map<ManagerId, Manager>([
			[
				"alex",
				manager("alex", "Soft Gay Fisting", {
					2017: { teamId: "5", teamName: "Soft Gay Fisting", avatar: "old.jpg" },
					2018: { teamId: "5", teamName: "Soft Gay Fisting", avatar: "latest.jpg" },
				}),
			],
		]);
		const table = buildAllTimeTable(
			[
				season(2017, [row("alex", { wins: 9, losses: 6 })]),
				season(2018, [row("alex", { wins: 4, losses: 10 })], 14),
				season(2025, []),
			],
			managers,
		);
		assert.equal(table.rows[0]?.avatar, "latest.jpg");
	});

	test("reaches back past a season that had none", () => {
		// Reverting to the platform placeholder must not erase an avatar the
		// manager used for years.
		const managers = new Map<ManagerId, Manager>([
			[
				"slow",
				manager("slow", "SG Drugs-Bucs", {
					2024: { teamId: "9", teamName: "SG Drugs-Bucs", avatar: "kept.jpg" },
					2025: { teamId: "9", teamName: "SG Drugs-Bucs" },
				}),
			],
		]);
		const table = buildAllTimeTable(
			[season(2024, [row("slow", { wins: 5, losses: 10 })]), season(2025, [row("slow", { wins: 1, losses: 14 })])],
			managers,
		);
		assert.equal(table.rows[0]?.avatar, "kept.jpg");
	});

	test("stays undefined for a manager who never set one", () => {
		const managers = new Map<ManagerId, Manager>([
			["none", manager("none", "No Avatar", { 2025: { teamId: "9", teamName: "No Avatar" } })],
		]);
		const table = buildAllTimeTable([season(2025, [row("none", { wins: 1, losses: 14 })])], managers);
		assert.equal(table.rows[0]?.avatar, undefined);
	});
});
