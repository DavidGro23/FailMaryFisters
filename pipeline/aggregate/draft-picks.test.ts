import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Manager, ManagerId, Trade } from "../model.ts";
import { buildFuturePicks } from "./draft-picks.ts";

const YEAR = 2026;

function manager(id: string, displayName: string): Manager {
	return { id, displayName, slug: displayName.toLowerCase(), teamsByYear: {} };
}

const MANAGERS = new Map<ManagerId, Manager>([
	["a", manager("a", "Alpha")],
	["b", manager("b", "Beta")],
	["c", manager("c", "Gamma")],
]);
const TEAMS: ManagerId[] = ["a", "b", "c"];

/** One pick moving from `fromId` to `toId` on `date`. */
function pickTrade(date: string, fromId: string, toId: string, round: number, year = YEAR): Trade {
	return {
		year: 2025,
		date,
		week: 5,
		participantIds: [fromId, toId],
		legs: [{ fromId, toId, items: [{ kind: "pick", year, round }] }],
	};
}

function view(trades: Trade[]) {
	const result = buildFuturePicks(trades, MANAGERS, TEAMS, YEAR);
	assert.ok(result);
	return result;
}

function teamOf(trades: Trade[], id: string) {
	const found = view(trades).teams.find((t) => t.managerId === id);
	assert.ok(found, `expected a team for ${id}`);
	return found;
}

describe("buildFuturePicks", () => {
	test("every team starts with its own 15 picks", () => {
		const v = view([]);
		for (const team of v.teams) {
			assert.equal(team.picks.length, 15);
			assert.ok(team.picks.every((p) => p.own));
			assert.equal(team.acquired, 0);
			assert.equal(team.tradedAway, 0);
		}
		assert.deepEqual(v.unbalanced, []);
	});

	test("a traded pick moves, and keeps its original owner", () => {
		const trades = [pickTrade("2025-10-01T12:00:00", "a", "b", 3)];

		const beta = teamOf(trades, "b");
		const acquired = beta.picks.filter((p) => !p.own);
		assert.equal(acquired.length, 1);
		assert.equal(acquired[0]?.round, 3);
		assert.equal(acquired[0]?.originalOwnerName, "Alpha", "the pick is still Alpha's");
		assert.equal(beta.picks.length, 16);

		const alpha = teamOf(trades, "a");
		assert.equal(alpha.picks.length, 14);
		assert.equal(alpha.tradedAway, 1);
		assert.ok(!alpha.picks.some((p) => p.round === 3), "Alpha no longer holds a 3rd");
	});

	/**
	 * The reconstruction's one judgement call. A team holding two picks of a round
	 * is assumed to send its own first, so replay order decides which pick each leg
	 * moved. Getting this backwards silently mislabels the original owner.
	 */
	test("a team holding two picks of a round sends its own first", () => {
		const trades = [
			pickTrade("2025-10-01T12:00:00", "a", "b", 7), // Beta now holds Alpha's 7th and its own
			pickTrade("2025-11-01T12:00:00", "b", "c", 7),
		];

		const gamma = teamOf(trades, "c");
		const got = gamma.picks.filter((p) => !p.own);
		assert.equal(got.length, 1);
		assert.equal(got[0]?.originalOwnerName, "Beta", "Beta sent its own 7th, not Alpha's");

		const beta = teamOf(trades, "b");
		assert.deepEqual(
			beta.picks.filter((p) => p.round === 7).map((p) => p.originalOwnerName),
			["Alpha"],
			"Beta keeps the one it acquired",
		);
	});

	test("replays in date order, not file order", () => {
		const outOfOrder = [
			pickTrade("2025-11-01T12:00:00", "b", "c", 7),
			pickTrade("2025-10-01T12:00:00", "a", "b", 7),
		];
		const gamma = teamOf(outOfOrder, "c");
		assert.equal(gamma.picks.filter((p) => !p.own)[0]?.originalOwnerName, "Beta");
	});

	/**
	 * Trading a round back is genuinely ambiguous — the export records only
	 * `{year, round}`, so "Beta sends a 4th to Alpha" cannot say *which* 4th. The
	 * documented tiebreak applies: Beta sends its own, and Alpha's original 4th
	 * stays with Beta. Both teams still hold 15, which is the part that must hold
	 * whichever way the ambiguity is resolved.
	 */
	test("a round traded back resolves by the same own-first rule", () => {
		const trades = [
			pickTrade("2025-10-01T12:00:00", "a", "b", 4),
			pickTrade("2025-11-01T12:00:00", "b", "a", 4),
		];

		const alpha = teamOf(trades, "a");
		assert.equal(alpha.picks.length, 15);
		assert.deepEqual(
			alpha.picks.filter((p) => p.round === 4).map((p) => p.originalOwnerName),
			["Beta"],
			"Alpha gets Beta's own 4th, not its own back",
		);
		assert.equal(alpha.tradedAway, 1, "Alpha's own 4th is still with Beta");

		const beta = teamOf(trades, "b");
		assert.equal(beta.picks.length, 15);
		assert.deepEqual(
			beta.picks.filter((p) => p.round === 4).map((p) => p.originalOwnerName),
			["Alpha"],
		);
		assert.deepEqual(view(trades).unbalanced, [], "both teams still hold exactly 15");
	});

	test("ignores picks for other years", () => {
		const trades = [pickTrade("2025-10-01T12:00:00", "a", "b", 3, 2027)];
		assert.equal(teamOf(trades, "a").picks.length, 15);
	});

	test("picks are ordered by round ascending, own pick first within a round", () => {
		const trades = [pickTrade("2025-10-01T12:00:00", "a", "b", 2)];
		const beta = teamOf(trades, "b");
		const rounds = beta.picks.map((p) => p.round);
		assert.deepEqual([...rounds].sort((x, y) => x - y), rounds, "rounds ascend");

		const secondRound = beta.picks.filter((p) => p.round === 2);
		assert.deepEqual(secondRound.map((p) => p.own), [true, false]);
	});

	test("a send from a team holding no such pick is skipped, not invented", () => {
		const trades = [
			pickTrade("2025-10-01T12:00:00", "a", "b", 9),
			// Alpha no longer has a 9th; this leg cannot be honoured.
			pickTrade("2025-11-01T12:00:00", "a", "c", 9),
		];
		const v = view(trades);
		assert.equal(v.teams.reduce((n, t) => n + t.picks.length, 0), 45, "still 3 x 15 picks");
		assert.equal(teamOf(trades, "c").picks.length, 15);
	});

	test("reports teams that do not hold exactly 15 picks", () => {
		assert.deepEqual(view([pickTrade("2025-10-01T12:00:00", "a", "b", 3)]).unbalanced, [
			"Alpha",
			"Beta",
		]);
	});

	test("returns null with no teams", () => {
		assert.equal(buildFuturePicks([], MANAGERS, [], YEAR), null);
	});
});
