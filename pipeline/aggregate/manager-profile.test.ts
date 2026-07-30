import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
	Manager,
	ManagerId,
	PlayerGame,
	PlayoffBracket,
	PlayoffGame,
	SeasonStandings,
	StandingRow,
	TeamGame,
	Trade,
} from "../model.ts";
import { buildAllTimeTable } from "./all-time.ts";
import { buildManagerProfiles, type ProfileInputs } from "./manager-profile.ts";

function manager(id: string, displayName: string): Manager {
	return { id, displayName, slug: displayName.toLowerCase().replace(/ /g, "-"), teamsByYear: {} };
}

const MANAGERS = new Map<ManagerId, Manager>([
	["a", manager("a", "Alpha")],
	["b", manager("b", "Beta")],
	["c", manager("c", "Gamma")],
]);

function row(managerId: string, partial: Partial<StandingRow> = {}): StandingRow {
	return {
		managerId,
		teamId: "1",
		overallRank: 1,
		wins: 8,
		losses: 7,
		draws: 0,
		pointsFor: 1500,
		pointsAgainst: 1400,
		...partial,
	};
}

function season(year: number, rows: StandingRow[]): SeasonStandings {
	return { year, regularSeasonWeeks: 15, rows };
}

function playoffGame(winnerId: string, loserId: string): PlayoffGame {
	return {
		week: 17,
		roundLabel: "Final",
		a: { managerId: winnerId, teamId: "1", seed: 1, points: 120 },
		b: { managerId: loserId, teamId: "2", seed: 2, points: 100 },
		winner: winnerId,
	};
}

function bracket(winnerId: string, loserId: string): PlayoffBracket {
	return { semifinals: [], final: playoffGame(winnerId, loserId) };
}

function teamGame(partial: Partial<TeamGame> & { managerId: string; points: number }): TeamGame {
	return {
		year: 2025,
		week: 1,
		type: "regular",
		opponentId: "b",
		opponentPoints: 100,
		...partial,
	};
}

function inputs(overrides: Partial<ProfileInputs>): ProfileInputs {
	const seasons = overrides.seasons ?? [season(2025, [row("a"), row("b")])];
	const base: ProfileInputs = {
		managers: MANAGERS,
		seasons,
		playoffs: new Map(),
		games: [],
		playerGames: [],
		trades: [],
		allTime: buildAllTimeTable(seasons, MANAGERS),
		...overrides,
	};
	return { ...base, allTime: overrides.allTime ?? buildAllTimeTable(base.seasons, MANAGERS) };
}

function profileFor(id: string, given: Partial<ProfileInputs>) {
	const found = buildManagerProfiles(inputs(given)).find((p) => p.managerId === id);
	assert.ok(found, `expected a profile for ${id}`);
	return found;
}

describe("championships", () => {
	test("counts finals won, per season", () => {
		const p = profileFor("a", {
			playoffs: new Map([
				[2023, bracket("a", "b")],
				[2024, bracket("b", "a")],
				[2025, bracket("a", "b")],
			]),
		});
		assert.deepEqual(p.championships, [2023, 2025]);
	});

	test("a manager who never won a final has none", () => {
		const p = profileFor("b", { playoffs: new Map([[2025, bracket("a", "b")]]) });
		assert.deepEqual(p.championships, []);
	});
});

describe("top scorer seasons", () => {
	test("counts seasons with the most regular-season points", () => {
		const seasons = [
			season(2024, [row("a", { pointsFor: 1900 }), row("b", { pointsFor: 1500 })]),
			season(2025, [row("a", { pointsFor: 1500 }), row("b", { pointsFor: 1800 })]),
		];
		assert.deepEqual(profileFor("a", { seasons }).topScorerSeasons, [2024]);
		assert.deepEqual(profileFor("b", { seasons }).topScorerSeasons, [2025]);
	});

	test("is decided on points, not on record", () => {
		// Alpha wins more games; Beta scores more points.
		const seasons = [
			season(2025, [
				row("a", { wins: 12, losses: 3, pointsFor: 1500 }),
				row("b", { wins: 3, losses: 12, pointsFor: 1900 }),
			]),
		];
		assert.deepEqual(profileFor("a", { seasons }).topScorerSeasons, []);
		assert.deepEqual(profileFor("b", { seasons }).topScorerSeasons, [2025]);
	});
});

describe("best and worst game, per scope (rule 7)", () => {
	// The playoff high beats every regular-season score, and the playoff low
	// undercuts every regular-season score. Merging the scopes would put both
	// playoff games in the headline pair and hide the regular-season ones.
	const games: TeamGame[] = [
		teamGame({ managerId: "a", points: 150, week: 3, opponentPoints: 90 }),
		teamGame({ managerId: "a", points: 60, week: 4, opponentPoints: 95 }),
		teamGame({ managerId: "a", points: 200, week: 16, type: "playoff", opponentPoints: 110 }),
		teamGame({ managerId: "a", points: 40, week: 17, type: "playoff", opponentPoints: 105 }),
	];

	test("keeps the regular-season records free of playoff games", () => {
		const p = profileFor("a", { games });
		assert.equal(p.regular.best?.points, 150);
		assert.equal(p.regular.worst?.points, 60);
		assert.equal(p.regular.games, 2);
	});

	// D20. The reported defect: consolation games were counted as playoff games,
	// so a 7th-place blowout could hold the playoff record. The extremes here are
	// both consolation, and both must be ignored by *both* scopes — landing in
	// `regular` would be just as wrong as landing in `playoff`.
	test("excludes consolation games from the playoff records", () => {
		const p = profileFor("a", {
			games: [
				...games,
				teamGame({ managerId: "a", points: 999, week: 16, type: "consolation", opponentPoints: 50 }),
				teamGame({ managerId: "a", points: 1, week: 17, type: "consolation", opponentPoints: 120 }),
			],
		});
		assert.equal(p.playoff.games, 2, "consolation games must not inflate the playoff count");
		assert.equal(p.playoff.best?.points, 200, "a consolation game must not hold the playoff high");
		assert.equal(p.playoff.worst?.points, 40, "a consolation game must not hold the playoff low");
		assert.equal(p.regular.games, 2, "consolation games must not fall through to the regular season");
		assert.equal(p.regular.best?.points, 150);
		assert.equal(p.regular.worst?.points, 60);
	});

	test("a manager whose only postseason games are consolation reports no playoffs", () => {
		const p = profileFor("a", {
			games: [
				teamGame({ managerId: "a", points: 100, week: 3 }),
				teamGame({ managerId: "a", points: 130, week: 16, type: "consolation" }),
			],
		});
		assert.equal(p.playoff.games, 0);
		assert.equal(p.playoff.best, undefined);
		assert.equal(p.playoff.worst, undefined);
	});

	test("excludes consolation meetings from the playoff head-to-head", () => {
		const p = profileFor("a", {
			games: [
				teamGame({ managerId: "a", points: 120, opponentId: "b", opponentPoints: 90, type: "playoff" }),
				teamGame({ managerId: "a", points: 130, opponentId: "c", opponentPoints: 80, type: "consolation" }),
			],
		});
		assert.deepEqual(
			p.h2hPlayoff.map((r) => r.opponentName),
			["Beta"],
			"a consolation opponent must not appear in the playoff H2H",
		);
		assert.equal(p.h2hRegular.length, 0, "nor fall through to the regular-season H2H");
	});

	test("reports the playoff records separately", () => {
		const p = profileFor("a", { games });
		assert.equal(p.playoff.best?.points, 200);
		assert.equal(p.playoff.worst?.points, 40);
		assert.equal(p.playoff.games, 2);
	});

	test("carries the opponent, season, week and outcome", () => {
		const p = profileFor("a", { games });
		assert.equal(p.regular.best?.year, 2025);
		assert.equal(p.regular.best?.week, 3);
		assert.equal(p.regular.best?.opponentName, "Beta");
		assert.equal(p.regular.best?.opponentPoints, 90);
		assert.equal(p.regular.best?.won, true);
		assert.equal(p.regular.worst?.won, false);
	});

	test("a manager with no playoff games reports none rather than zeroes", () => {
		const p = profileFor("a", {
			games: [teamGame({ managerId: "a", points: 100 })],
		});
		assert.equal(p.playoff.games, 0);
		assert.equal(p.playoff.best, undefined);
	});
});

describe("head to head", () => {
	const games: TeamGame[] = [
		// vs Beta: 2-1 in the regular season, plus one playoff meeting.
		teamGame({ managerId: "a", points: 120, opponentId: "b", opponentPoints: 100 }),
		teamGame({ managerId: "a", points: 130, opponentId: "b", opponentPoints: 110 }),
		teamGame({ managerId: "a", points: 90, opponentId: "b", opponentPoints: 140 }),
		teamGame({ managerId: "a", points: 80, opponentId: "b", opponentPoints: 150, type: "playoff" }),
		// vs Gamma: 3-0 in the regular season, never met in the playoffs.
		teamGame({ managerId: "a", points: 100, opponentId: "c", opponentPoints: 50 }),
		teamGame({ managerId: "a", points: 100, opponentId: "c", opponentPoints: 60 }),
		teamGame({ managerId: "a", points: 100, opponentId: "c", opponentPoints: 70 }),
	];

	test("aggregates a record and points per opponent", () => {
		const p = profileFor("a", { games });
		const beta = p.h2hRegular.find((r) => r.opponentName === "Beta");
		assert.ok(beta);
		assert.deepEqual([beta.wins, beta.losses, beta.draws], [2, 1, 0]);
		assert.equal(beta.games, 3);
		assert.equal(beta.pointsFor, 340);
		assert.equal(beta.pointsAgainst, 350);
		assert.equal(Math.round(beta.pointsPerGame * 100) / 100, 113.33);
	});

	test("never merges the scopes (rule 7)", () => {
		// The playoff loss to Beta must not appear in the regular-season row.
		const p = profileFor("a", { games });
		const beta = p.h2hRegular.find((r) => r.opponentName === "Beta");
		assert.equal(beta?.games, 3, "regular-season row must exclude the playoff meeting");
		assert.equal(beta?.losses, 1);

		const betaPost = p.h2hPlayoff.find((r) => r.opponentName === "Beta");
		assert.equal(betaPost?.games, 1);
		assert.equal(betaPost?.losses, 1);
	});

	test("lists only opponents actually faced in that scope", () => {
		const p = profileFor("a", { games });
		assert.deepEqual(p.h2hRegular.map((r) => r.opponentName), ["Gamma", "Beta"]);
		assert.deepEqual(p.h2hPlayoff.map((r) => r.opponentName), ["Beta"]);
	});

	test("orders by record, most wins first", () => {
		// Gamma 3-0 outranks Beta 2-1 despite Beta being the tougher opponent.
		const p = profileFor("a", { games });
		assert.equal(p.h2hRegular[0]?.opponentName, "Gamma");
		assert.equal(p.h2hRegular[0]?.wins, 3);
	});

	test("counts an equal score as a draw, not a loss (D9)", () => {
		const p = profileFor("a", {
			games: [teamGame({ managerId: "a", points: 100, opponentId: "b", opponentPoints: 100 })],
		});
		const beta = p.h2hRegular[0];
		assert.deepEqual([beta?.wins, beta?.losses, beta?.draws], [0, 0, 1]);
		assert.equal(beta?.winPct, 0.5, "a draw is half a win");
	});
});

describe("most-started players", () => {
	function playerGame(p: Partial<PlayerGame> & { playerId: string; points: number }): PlayerGame {
		return {
			year: 2025,
			week: 1,
			type: "regular",
			managerId: "a",
			playerName: `P${p.playerId}`,
			started: true,
			...p,
		};
	}

	test("counts starts only, never bench appearances", () => {
		const p = profileFor("a", {
			playerGames: [
				playerGame({ playerId: "1", points: 10 }),
				playerGame({ playerId: "1", points: 20 }),
				playerGame({ playerId: "1", points: 99, started: false }),
			],
		});
		assert.equal(p.topStarters[0]?.starts, 2);
		assert.equal(p.topStarters[0]?.points, 30, "a benched game must not add points");
	});

	test("does not mix managers", () => {
		const p = profileFor("a", {
			playerGames: [
				playerGame({ playerId: "1", points: 10 }),
				playerGame({ playerId: "1", points: 10, managerId: "b" }),
			],
		});
		assert.equal(p.topStarters[0]?.starts, 1);
	});

	test("a sign-corrected negative game reduces the total (D17)", () => {
		// Without the correction this player's stored scores would be 10 and 2,
		// totalling 12. With it, the second game is -2 and the total is 8. The
		// difference is exactly twice the negative game, which is the signature
		// of the magnitude-stored bug.
		const p = profileFor("a", {
			playerGames: [
				playerGame({ playerId: "1", points: 10 }),
				playerGame({ playerId: "1", points: -2 }),
			],
		});
		assert.equal(p.topStarters[0]?.points, 8);
		assert.notEqual(p.topStarters[0]?.points, 12);
	});

	test("orders by starts, then points, then name; caps at ten", () => {
		const many: PlayerGame[] = [];
		for (let i = 1; i <= 12; i++) {
			for (let s = 0; s < i; s++) many.push(playerGame({ playerId: String(i), points: 1 }));
		}
		const p = profileFor("a", { playerGames: many });
		assert.equal(p.topStarters.length, 10);
		assert.deepEqual(p.topStarters.map((s) => s.starts), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
	});

	test("computes points per start", () => {
		const p = profileFor("a", {
			playerGames: [
				playerGame({ playerId: "1", points: 10 }),
				playerGame({ playerId: "1", points: 20 }),
			],
		});
		assert.equal(p.topStarters[0]?.pointsPerStart, 15);
	});
});

describe("trades", () => {
	const trade: Trade = {
		year: 2025,
		date: "2025-10-25T03:11:00",
		week: 8,
		participantIds: ["a", "b"],
		legs: [
			{ fromId: "a", toId: "b", items: [{ kind: "player", playerId: "1", playerName: "Sent Player" }] },
			{
				fromId: "b",
				toId: "a",
				items: [
					{ kind: "player", playerId: "2", playerName: "Got Player" },
					{ kind: "pick", year: 2026, round: 3 },
				],
			},
		],
	};

	test("groups by season, newest first", () => {
		const older: Trade = { ...trade, year: 2023 };
		const p = profileFor("a", { trades: [older, trade] });
		assert.deepEqual(p.tradesByYear.map((t) => t.year), [2025, 2023]);
		assert.equal(p.tradeCount, 2);
	});

	test("splits into received and given up, from this manager's side", () => {
		const p = profileFor("a", { trades: [trade] });
		const view = p.tradesByYear[0]?.trades[0];
		assert.equal(view?.otherName, "Beta");
		assert.equal(view?.sides[0]?.direction, "in");
		assert.deepEqual(view?.sides[0]?.items, ["Got Player", "2026 round 3 pick"]);
		assert.equal(view?.sides[1]?.direction, "out");
		assert.deepEqual(view?.sides[1]?.items, ["Sent Player"]);
	});

	test("the same trade reads mirrored from the other manager", () => {
		const p = profileFor("b", { trades: [trade] });
		const view = p.tradesByYear[0]?.trades[0];
		assert.equal(view?.otherName, "Alpha");
		assert.deepEqual(view?.sides[0]?.items, ["Sent Player"], "Beta received what Alpha sent");
	});

	test("excludes trades this manager was not part of", () => {
		const other: Trade = { ...trade, participantIds: ["b", "c"] };
		const p = profileFor("a", { trades: [other] });
		assert.equal(p.tradeCount, 0);
		assert.deepEqual(p.tradesByYear, []);
	});
});

describe("career totals", () => {
	test("are the manager's row from the all-time table, unmodified", () => {
		const seasons = [season(2025, [row("a", { wins: 12, losses: 3, pointsFor: 1848.6 }), row("b")])];
		const allTime = buildAllTimeTable(seasons, MANAGERS);
		const p = profileFor("a", { seasons, allTime });
		assert.deepEqual(p.career, allTime.rows.find((r) => r.managerId === "a"));
	});
});
