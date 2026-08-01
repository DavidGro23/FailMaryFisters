import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Manager, ManagerId, RosterEntry, SeasonDraft, Year } from "../model.ts";
import type { AcquisitionVia } from "../normalize/acquisitions.ts";
import { buildKeeperView, keeperValueOf, type KeeperInputs } from "./keepers.ts";

const YEAR = 2025;

function manager(id: string, displayName: string): Manager {
	return { id, displayName, slug: displayName.toLowerCase().replace(/ /g, "-"), teamsByYear: {} };
}

const MANAGERS = new Map<ManagerId, Manager>([
	["a", manager("a", "Alpha")],
	["b", manager("b", "Beta")],
]);

function rosterEntry(partial: Partial<RosterEntry> & { playerId: string }): RosterEntry {
	return {
		year: YEAR,
		managerId: "a",
		playerName: `Player ${partial.playerId}`,
		position: "WR",
		onIr: false,
		...partial,
	};
}

/** `picks` as `[playerId, round, managerId?]`. */
function draft(picks: Array<[string, number, string?]>): SeasonDraft {
	return {
		year: YEAR,
		rounds: 15,
		picks: picks.map(([playerId, round, managerId], i) => ({
			round,
			overall: i + 1,
			managerId: managerId ?? "a",
			playerId,
			playerName: `Player ${playerId}`,
		})),
	};
}

function inputs(overrides: Partial<KeeperInputs> = {}): KeeperInputs {
	return {
		rosters: [],
		drafts: new Map<Year, SeasonDraft>([[YEAR, draft([])]]),
		managers: MANAGERS,
		acquisitions: new Map<Year, Map<string, AcquisitionVia>>(),
		year: YEAR,
		...overrides,
	};
}

function teamOf(id: string, given: Partial<KeeperInputs>) {
	const view = buildKeeperView(inputs(given));
	assert.ok(view, "expected a view");
	const found = view.teams.find((t) => t.managerId === id);
	assert.ok(found, `expected a team for ${id}`);
	return found;
}

describe("keeperValueOf — the rule set", () => {
	test("a drafted player costs his round minus one", () => {
		assert.deepEqual(keeperValueOf("p", 10, undefined), {
			value: 9,
			basis: { kind: "drafted", round: 10 },
		});
		assert.equal(keeperValueOf("p", 15, undefined).value, 14);
		assert.equal(keeperValueOf("p", 2, undefined).value, 1);
	});

	test("a first-round pick cannot be kept and has no value", () => {
		const result = keeperValueOf("p", 1, undefined);
		assert.equal(result.value, undefined);
		assert.deepEqual(result.basis, { kind: "firstRound" });
	});

	test("an undrafted player claimed off waivers costs round 10", () => {
		assert.deepEqual(keeperValueOf("p", undefined, "waiver"), {
			value: 10,
			basis: { kind: "waiver" },
		});
	});

	test("an undrafted player added as a free agent costs round 12", () => {
		assert.deepEqual(keeperValueOf("p", undefined, "freeAgent"), {
			value: 12,
			basis: { kind: "freeAgent" },
		});
	});

	test("an undrafted player with no record is left blank, never guessed", () => {
		const result = keeperValueOf("p", undefined, undefined);
		assert.equal(result.value, undefined, "must not fall back to 10 or 12");
		assert.deepEqual(result.basis, { kind: "unrecorded" });
	});

	// Called out twice when this was specified, and the easiest rule to get
	// backwards: the acquisition only matters if the player was never drafted.
	test("a drafted player keeps his draft value even if later re-acquired", () => {
		assert.equal(keeperValueOf("p", 8, "waiver").value, 7, "waiver must not override round 8");
		assert.equal(keeperValueOf("p", 8, "freeAgent").value, 7, "nor must a free-agent pickup");
		assert.equal(keeperValueOf("p", 13, "waiver").value, 12);
	});
});

describe("buildKeeperView", () => {
	test("prices a player drafted by a different team from his draft round", () => {
		// Traded: drafted by Beta in round 6, finished the season on Alpha.
		const team = teamOf("a", {
			rosters: [rosterEntry({ playerId: "p1", managerId: "a" })],
			drafts: new Map([[YEAR, draft([["p1", 6, "b"]])]]),
		});
		assert.equal(team.players[0]?.value, 5, "trades must not affect keeper value");
	});

	test("excludes IR players", () => {
		const team = teamOf("a", {
			rosters: [
				rosterEntry({ playerId: "p1" }),
				rosterEntry({ playerId: "p2", onIr: true }),
				rosterEntry({ playerId: "p3" }),
			],
			drafts: new Map([[YEAR, draft([["p1", 5], ["p2", 5], ["p3", 5]])]]),
		});
		assert.deepEqual(team.players.map((p) => p.playerId), ["p1", "p3"]);
	});

	test("ignores rosters from other seasons", () => {
		const team = teamOf("a", {
			rosters: [rosterEntry({ playerId: "p1" }), rosterEntry({ playerId: "old", year: 2024 })],
			drafts: new Map([[YEAR, draft([["p1", 4]])]]),
		});
		assert.deepEqual(team.players.map((p) => p.playerId), ["p1"]);
	});

	test("orders by keeper value ascending, with unkeepable and unrecorded last", () => {
		const team = teamOf("a", {
			rosters: ["cheap", "dear", "first", "unknown"].map((id) => rosterEntry({ playerId: id })),
			drafts: new Map([
				[YEAR, draft([["cheap", 14], ["dear", 3], ["first", 1]])],
			]),
		});
		assert.deepEqual(
			team.players.map((p) => [p.playerId, p.value]),
			[
				["dear", 2],
				["cheap", 13],
				["unknown", undefined],
				["first", undefined],
			],
		);
	});

	test("ties on value fall back to name, so the order is total", () => {
		const team = teamOf("a", {
			rosters: [
				rosterEntry({ playerId: "z", playerName: "Zeta" }),
				rosterEntry({ playerId: "a", playerName: "Alpha" }),
			],
			drafts: new Map([[YEAR, draft([["z", 7], ["a", 7]])]]),
		});
		assert.deepEqual(team.players.map((p) => p.playerName), ["Alpha", "Zeta"]);
	});

	test("counts unrecorded players per team and overall", () => {
		const view = buildKeeperView(
			inputs({
				rosters: [
					rosterEntry({ playerId: "p1", managerId: "a" }),
					rosterEntry({ playerId: "p2", managerId: "a" }),
					rosterEntry({ playerId: "p3", managerId: "b" }),
				],
				drafts: new Map([[YEAR, draft([["p1", 9]])]]),
			}),
		);
		assert.ok(view);
		assert.equal(view.unrecordedCount, 2);
		assert.equal(view.teams.find((t) => t.managerId === "a")?.unrecordedCount, 1);
		assert.equal(view.teams.find((t) => t.managerId === "b")?.unrecordedCount, 1);
	});

	test("resolves an undrafted player once the acquisition file supplies him", () => {
		const team = teamOf("a", {
			rosters: [rosterEntry({ playerId: "p1" })],
			acquisitions: new Map([[YEAR, new Map<string, AcquisitionVia>([["p1", "waiver"]])]]),
		});
		assert.equal(team.players[0]?.value, 10);
		assert.deepEqual(team.players[0]?.basis, { kind: "waiver" });
	});

	test("keeper year is the season after the rosters", () => {
		const view = buildKeeperView(inputs());
		assert.ok(view);
		assert.equal(view.year, 2025);
		assert.equal(view.keeperYear, 2026);
	});

	test("returns null when the season has no draft", () => {
		assert.equal(buildKeeperView(inputs({ drafts: new Map() })), null);
	});

	test("carries the canonical display name and slug, not a per-season team name", () => {
		const team = teamOf("a", { rosters: [rosterEntry({ playerId: "p1" })] });
		assert.equal(team.displayName, "Alpha");
		assert.equal(team.slug, "alpha");
	});
});
