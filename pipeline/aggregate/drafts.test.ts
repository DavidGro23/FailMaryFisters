import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DraftPick, Manager, ManagerId, SeasonDraft } from "../model.ts";
import { buildDraftViews } from "./drafts.ts";

function manager(id: string, displayName: string): Manager {
	return { id, displayName, slug: displayName.toLowerCase(), teamsByYear: {} };
}

const MANAGERS = new Map<ManagerId, Manager>([
	["a", manager("a", "Alpha")],
	["b", manager("b", "Beta")],
]);

function pick(overall: number, round: number, managerId: string, playerName: string): DraftPick {
	return { round, overall, managerId, playerId: playerName, playerName };
}

function draft(year: number, picks: DraftPick[]): Map<number, SeasonDraft> {
	return new Map([
		[year, { year, rounds: Math.max(...picks.map((p) => p.round)), picks }],
	]);
}

describe("draft board", () => {
	test("groups picks by team, in draft order", () => {
		const view = buildDraftViews(
			draft(2025, [
				pick(1, 1, "a", "First"),
				pick(2, 1, "b", "Second"),
				pick(3, 2, "b", "Third"),
				pick(4, 2, "a", "Fourth"),
			]),
			MANAGERS,
		)[0];

		assert.ok(view);
		const alpha = view.teams.find((t) => t.displayName === "Alpha");
		assert.deepEqual(alpha?.picks.map((p) => p.playerName), ["First", "Fourth"]);
		assert.deepEqual(alpha?.picks.map((p) => p.overall), [1, 4]);
	});

	test("orders teams by who picked first, which sets the default team", () => {
		const view = buildDraftViews(
			draft(2025, [pick(1, 1, "b", "B1"), pick(2, 1, "a", "A1")]),
			MANAGERS,
		)[0];
		assert.deepEqual(view?.teams.map((t) => t.displayName), ["Beta", "Alpha"]);
		assert.equal(view?.teams[0]?.firstPick, 1);
	});

	test("handles a team with two picks in one round and none in another", () => {
		// The real shape from 2019 onward: picks get traded, so a round is not a
		// reliable row identity.
		const view = buildDraftViews(
			draft(2025, [
				pick(1, 1, "a", "R1a"),
				pick(2, 1, "a", "R1b"),
				pick(3, 2, "b", "R2b"),
			]),
			MANAGERS,
		)[0];

		const alpha = view?.teams.find((t) => t.displayName === "Alpha");
		assert.equal(alpha?.picks.length, 2);
		assert.deepEqual(alpha?.picks.map((p) => p.round), [1, 1]);
		assert.deepEqual(alpha?.picks.map((p) => p.extraInRound), [false, true]);

		const beta = view?.teams.find((t) => t.displayName === "Beta");
		assert.deepEqual(beta?.picks.map((p) => p.round), [2], "Beta has no first-rounder");
	});

	test("a team whose earliest pick is late still sorts correctly", () => {
		// 2023 Railgunners had no first-round pick at all.
		const view = buildDraftViews(
			draft(2023, [pick(1, 1, "a", "A1"), pick(11, 2, "b", "B2")]),
			MANAGERS,
		)[0];
		assert.deepEqual(view?.teams.map((t) => t.displayName), ["Alpha", "Beta"]);
		assert.equal(view?.teams[1]?.firstPick, 11);
	});

	test("reports rounds and total picks", () => {
		const view = buildDraftViews(
			draft(2025, [pick(1, 1, "a", "A"), pick(2, 1, "b", "B"), pick(3, 2, "a", "C")]),
			MANAGERS,
		)[0];
		assert.equal(view?.rounds, 2);
		assert.equal(view?.totalPicks, 3);
	});

	test("returns one view per season, oldest first", () => {
		const combined = new Map([
			...draft(2025, [pick(1, 1, "a", "X")]),
			...draft(2017, [pick(1, 1, "b", "Y")]),
		]);
		assert.deepEqual(buildDraftViews(combined, MANAGERS).map((v) => v.year), [2017, 2025]);
	});

	test("falls back visibly for an unknown manager", () => {
		const view = buildDraftViews(draft(2025, [pick(1, 1, "ghost", "X")]), new Map())[0];
		assert.equal(view?.teams[0]?.displayName, "Unknown manager (ghost)");
	});
});
