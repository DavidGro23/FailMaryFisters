import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Manager, ManagerId, PlayoffBracket, PlayoffGame } from "../model.ts";
import { buildBracketView } from "./playoffs.ts";

function manager(id: string, displayName: string, avatarByYear: Record<number, string> = {}): Manager {
	const teamsByYear: Record<number, { teamId: string; teamName: string; avatar?: string }> = {};
	for (const [year, avatar] of Object.entries(avatarByYear)) {
		teamsByYear[Number(year)] = { teamId: "1", teamName: displayName, avatar };
	}
	// Mirrors normalize: newest season with an avatar wins.
	const years = Object.keys(avatarByYear).map(Number).sort((a, b) => b - a);
	const latestAvatar = years.length > 0 ? avatarByYear[years[0] as number] : undefined;

	return {
		id,
		displayName,
		slug: id,
		teamsByYear,
		...(latestAvatar === undefined ? {} : { latestAvatar }),
	};
}

function game(
	aId: string,
	aPts: number,
	bId: string,
	bPts: number,
	label = "Semifinal",
	week = 16,
): PlayoffGame {
	return {
		week,
		roundLabel: label,
		a: { managerId: aId, teamId: "1", seed: 1, points: aPts },
		b: { managerId: bId, teamId: "2", seed: 4, points: bPts },
		winner: aPts > bPts ? aId : bId,
	};
}

const managers = new Map<ManagerId, Manager>([
	["w", manager("w", "Railgunners", { 2025: "rail.jpg" })],
	["x", manager("x", "NHS Bengalz")],
	["y", manager("y", "OHood Cardinals")],
	["z", manager("z", "Saintology")],
]);

const bracket: PlayoffBracket = {
	semifinals: [game("w", 196.76, "x", 90.1), game("y", 139.12, "z", 109.5)],
	final: game("w", 146.26, "y", 92.22, "Fantasy Super Bowl", 17),
	thirdPlace: game("x", 117.64, "z", 80, "3rd Place Game", 17),
};

describe("bracket view", () => {
	const view = buildBracketView(2025, bracket, managers, 2025);

	test("marks exactly one winner per game", () => {
		for (const g of [...view.semifinals, view.final, view.thirdPlace!]) {
			assert.equal(g.sides.filter((s) => s.won).length, 1, `${g.label} must have one winner`);
		}
	});

	test("the winner is the higher-scoring side", () => {
		for (const g of [...view.semifinals, view.final]) {
			const [a, b] = g.sides;
			const winner = a.won ? a : b;
			const loser = a.won ? b : a;
			assert.ok(winner.points > loser.points, `${g.label}: winner must have more points`);
		}
	});

	test("names the champion from the final", () => {
		assert.equal(view.championName, "Railgunners");
		assert.equal(view.championId, "w");
	});

	test("computes the margin", () => {
		assert.equal(Math.round(view.final.margin * 100) / 100, 54.04);
		assert.equal(Math.round(view.semifinals[0]!.margin * 100) / 100, 106.66);
	});

	test("keeps the export's own round label", () => {
		// The title game is "Championship" in 2017-2018 and "Fantasy Super Bowl"
		// from 2019, so the label is displayed but never matched on (D11).
		assert.equal(view.final.label, "Fantasy Super Bowl");
		assert.equal(view.thirdPlace?.label, "3rd Place Game");
	});

	test("falls back to a readable label when the export ships an empty one", () => {
		const empty: PlayoffBracket = {
			semifinals: [game("w", 10, "x", 5, "")],
			final: game("w", 10, "y", 5, ""),
		};
		const v = buildBracketView(2025, empty, managers, 2025);
		assert.equal(v.semifinals[0]?.label, "Semifinal");
		assert.equal(v.final.label, "Final");
	});
});

describe("display identity", () => {
	test("uses the canonical name, not a per-season one", () => {
		const view = buildBracketView(2025, bracket, managers, 2025);
		assert.deepEqual(view.final.sides.map((s) => s.displayName), ["Railgunners", "OHood Cardinals"]);
	});

	test("uses the latest avatar even on a historical bracket", () => {
		// A 2017 bracket shows the picture the manager uses now, not the one they
		// had then — the same rule the canonical display name follows (D15).
		const withOld = new Map<ManagerId, Manager>([
			["w", manager("w", "Railgunners", { 2017: "old.jpg", 2025: "new.jpg" })],
			["x", manager("x", "NHS Bengalz")],
			["y", manager("y", "OHood Cardinals")],
			["z", manager("z", "Saintology")],
		]);
		const view2017 = buildBracketView(2017, bracket, withOld, 2017);
		assert.equal(view2017.final.sides[0]?.avatar, "new.jpg");

		const view2025 = buildBracketView(2025, bracket, withOld, 2025);
		assert.equal(view2025.final.sides[0]?.avatar, "new.jpg");
	});

	test("leaves the avatar undefined when that season had none", () => {
		const view = buildBracketView(2025, bracket, managers, 2025);
		const bengalz = view.semifinals[0]?.sides.find((s) => s.displayName === "NHS Bengalz");
		assert.equal(bengalz?.avatar, undefined);
	});
});
