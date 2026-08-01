import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { PlayerGame, SeasonStandings, StandingRow, TeamGame } from "../model.ts";
import type { AllTimeRow } from "./all-time.ts";
import { buildLandingView, type LandingView, type LeagueRecord } from "./landing.ts";
import type { ManagerProfile, ScopeRecords } from "./manager-profile.ts";

function scope(best?: { points: number; year: number; week: number }): ScopeRecords {
	if (!best) return { games: 0 };
	return {
		games: 1,
		best: { ...best, opponentName: "Someone", opponentPoints: 1, won: true },
		worst: { ...best, opponentName: "Someone", opponentPoints: 1, won: true },
	};
}

/** Looks a record up by its group title and label. */
function find(view: LandingView, group: string, label: string): LeagueRecord | undefined {
	return view.recordGroups.find((g) => g.title === group)?.records.find((r) => r.label === label);
}

const REGULAR_GAME = "Regular season · single game";
const PLAYOFF_GAME = "Playoffs · single game";
const FULL_SEASON = "Regular season · full season";
const PLAYER_GAME = "Regular season · best player, single game";

function row(managerId: string, displayName: string, rank: number): AllTimeRow {
	return {
		rank,
		managerId,
		displayName,
		seasonsPlayed: 9,
		firstYear: 2017,
		lastYear: 2025,
		wins: 100 - rank,
		losses: 10,
		draws: 0,
		games: 132,
		pointsFor: 1000,
		pointsAgainst: 900,
		pointsPerGame: 100,
		winPct: 0.5,
	};
}

function profile(
	id: string,
	displayName: string,
	championships: number[],
	best?: { points: number; year: number; week: number },
	playoff?: { points: number; year: number; week: number },
): ManagerProfile {
	return {
		managerId: id,
		displayName,
		slug: displayName.toLowerCase().replace(/ /g, "-"),
		seasons: [2025],
		championships,
		topScorerSeasons: [],
		career: row(id, displayName, 1),
		regular: scope(best),
		playoff: scope(playoff),
		h2hRegular: [],
		h2hPlayoff: [],
		topStarters: [],
		tradesByYear: [],
		tradeCount: 0,
	};
}

function standing(managerId: string, pointsFor: number, wins = 8, losses = 7): StandingRow {
	return {
		managerId,
		teamId: "1",
		overallRank: 1,
		wins,
		losses,
		draws: 0,
		pointsFor,
		pointsAgainst: 0,
	};
}

function season(year: number, rows: StandingRow[], regularSeasonWeeks = 15): SeasonStandings {
	return { year, regularSeasonWeeks, rows };
}

/** Bare seasons carrying no standings, for tests that only need the year list. */
function years(...list: number[]): SeasonStandings[] {
	return list.map((y) => season(y, []));
}

describe("hall of fame", () => {
	const profiles = [
		profile("a", "Alpha", [2018, 2025]),
		profile("b", "Beta", [2019]),
		profile("c", "Gamma", []),
	];

	test("lists one entry per title, newest season first", () => {
		const view = buildLandingView(profiles, years(2018, 2019, 2025));
		assert.deepEqual(view.hallOfFame.map((c) => c.year), [2025, 2019, 2018]);
		assert.deepEqual(view.hallOfFame.map((c) => c.displayName), ["Alpha", "Beta", "Alpha"]);
	});

	test("a manager with two titles appears twice", () => {
		const view = buildLandingView(profiles, years(2018, 2019, 2025));
		assert.equal(view.hallOfFame.filter((c) => c.displayName === "Alpha").length, 2);
	});

	test("omits managers who never won", () => {
		const view = buildLandingView(profiles, years(2025));
		assert.equal(view.hallOfFame.some((c) => c.displayName === "Gamma"), false);
	});

	test("ranks title-holders by count", () => {
		const view = buildLandingView(profiles, years(2025));
		assert.deepEqual(view.mostTitles.map((m) => [m.profile.displayName, m.titles]), [
			["Alpha", 2],
			["Beta", 1],
		]);
	});
});

describe("single-game records", () => {
	test("finds the highest and lowest regular-season game across every team", () => {
		const profiles = [
			profile("a", "Alpha", [], { points: 150, year: 2020, week: 3 }),
			profile("b", "Beta", [], { points: 189.68, year: 2017, week: 15 }),
			profile("c", "Gamma", [], { points: 120, year: 2022, week: 7 }),
		];
		const view = buildLandingView(profiles, years(2025));
		const highest = find(view, REGULAR_GAME, "Highest score");
		assert.equal(highest?.value, "189.68");
		assert.equal(highest?.displayName, "Beta");
		assert.equal(highest?.kind, "high");
		assert.ok(highest?.detail.includes("2017 week 15"));
	});

	test("reports playoff extremes in their own group (rule 7)", () => {
		// Beta's playoff game outscores every regular-season game in the league.
		// Merging the scopes would let it take the regular-season record.
		const profiles = [
			profile("a", "Alpha", [], { points: 150, year: 2020, week: 3 }, { points: 90, year: 2020, week: 16 }),
			profile("b", "Beta", [], { points: 140, year: 2021, week: 5 }, { points: 196.76, year: 2025, week: 16 }),
		];
		const view = buildLandingView(profiles, years(2025));

		assert.equal(find(view, REGULAR_GAME, "Highest score")?.value, "150.00");
		assert.equal(find(view, REGULAR_GAME, "Highest score")?.displayName, "Alpha");
		assert.equal(find(view, PLAYOFF_GAME, "Highest score")?.value, "196.76");
		assert.equal(find(view, PLAYOFF_GAME, "Highest score")?.displayName, "Beta");
		assert.equal(find(view, PLAYOFF_GAME, "Lowest score")?.value, "90.00");
	});

	test("omits the playoff group entirely when nobody has played a playoff game", () => {
		const profiles = [profile("a", "Alpha", [], { points: 150, year: 2020, week: 3 })];
		const view = buildLandingView(profiles, years(2025));
		assert.equal(view.recordGroups.some((g) => g.title === PLAYOFF_GAME), false);
		assert.ok(find(view, REGULAR_GAME, "Highest score"));
	});

	test("ignores a team with no games rather than reporting zero", () => {
		const profiles = [profile("a", "Alpha", []), profile("b", "Beta", [], { points: 100, year: 2025, week: 1 })];
		const view = buildLandingView(profiles, years(2025));
		assert.equal(find(view, REGULAR_GAME, "Highest score")?.displayName, "Beta");
	});
});

describe("season point records", () => {
	const profiles = [profile("a", "Alpha", []), profile("b", "Beta", [])];

	test("finds the most and fewest points in one season across every team", () => {
		const view = buildLandingView(profiles, [
			season(2023, [standing("a", 1878.98), standing("b", 1500)]),
			season(2019, [standing("a", 1600), standing("b", 1156.24, 2, 11)], 14),
		]);

		const most = find(view, FULL_SEASON, "Most points");
		assert.equal(most?.value, "1878.98");
		assert.equal(most?.displayName, "Alpha");
		assert.ok(most?.detail.includes("2023"));

		const fewest = find(view, FULL_SEASON, "Fewest points");
		assert.equal(fewest?.value, "1156.24");
		assert.equal(fewest?.displayName, "Beta");
		assert.equal(fewest?.kind, "low");
	});

	test("shows the game count, because season length is not constant", () => {
		// 2018-2020 ran 14 games and every other season 15, so a raw total
		// slightly favours the longer seasons. The count makes that visible.
		const view = buildLandingView(profiles, [season(2019, [standing("a", 1600, 7, 7)], 14)]);
		assert.ok(find(view, FULL_SEASON, "Most points")?.detail.includes("14 games"));
	});

	test("omits the group when no season has standings", () => {
		const view = buildLandingView(profiles, years(2025));
		assert.equal(view.recordGroups.some((g) => g.title === FULL_SEASON), false);
	});
});

describe("best player performances", () => {
	const profiles = [profile("a", "Alpha", []), profile("b", "Beta", [])];

	function pg(p: Partial<PlayerGame> & { playerName: string; points: number }): PlayerGame {
		return {
			year: 2025,
			week: 5,
			type: "regular",
			managerId: "a",
			playerId: p.playerName,
			started: true,
			...p,
		};
	}

	test("takes the three highest started performances, in order", () => {
		const view = buildLandingView(profiles, years(2025), [
			pg({ playerName: "Low", points: 10 }),
			pg({ playerName: "Best", points: 53.1, year: 2022, week: 9 }),
			pg({ playerName: "Third", points: 51.88 }),
			pg({ playerName: "Second", points: 51.9 }),
		]);
		const group = view.recordGroups.find((g) => g.title === PLAYER_GAME);
		assert.deepEqual(group?.records.map((r) => r.label), ["Best", "Second", "Third"]);
		assert.equal(group?.records[0]?.value, "53.10");
		assert.ok(group?.records[0]?.detail.includes("2022 week 9"));
		assert.equal(group?.records[0]?.displayName, "Alpha");
	});

	test("ignores bench performances entirely", () => {
		// A huge week from the bench never happened, as far as the league goes.
		const view = buildLandingView(profiles, years(2025), [
			pg({ playerName: "Benched", points: 99, started: false }),
			pg({ playerName: "Started", points: 20 }),
		]);
		const group = view.recordGroups.find((g) => g.title === PLAYER_GAME);
		assert.deepEqual(group?.records.map((r) => r.label), ["Started"]);
	});

	test("excludes playoff performances from the regular-season group (rule 7)", () => {
		const view = buildLandingView(profiles, years(2025), [
			pg({ playerName: "PlayoffHero", points: 54.7, type: "playoff" }),
			pg({ playerName: "RegularHero", points: 30 }),
		]);
		const group = view.recordGroups.find((g) => g.title === PLAYER_GAME);
		assert.deepEqual(group?.records.map((r) => r.label), ["RegularHero"]);
	});

	test("keeps a sign-corrected negative game out of the top three (D17)", () => {
		const view = buildLandingView(profiles, years(2025), [
			pg({ playerName: "Good", points: 20 }),
			pg({ playerName: "Awful", points: -6 }),
		]);
		const group = view.recordGroups.find((g) => g.title === PLAYER_GAME);
		assert.equal(group?.records[0]?.label, "Good");
		assert.equal(group?.records.length, 2);
	});

	test("credits the manager who started the player, not another one", () => {
		const view = buildLandingView(profiles, years(2025), [
			pg({ playerName: "Star", points: 40, managerId: "b" }),
		]);
		const group = view.recordGroups.find((g) => g.title === PLAYER_GAME);
		assert.equal(group?.records[0]?.displayName, "Beta");
		assert.equal(group?.records[0]?.slug, "beta");
	});

	test("omits the group when there are no player games", () => {
		const view = buildLandingView(profiles, years(2025));
		assert.equal(view.recordGroups.some((g) => g.title === PLAYER_GAME), false);
	});
});

describe("record groups as a whole", () => {
	test("emits three groups of two when every scope has data", () => {
		const profiles = [
			profile("a", "Alpha", [], { points: 150, year: 2020, week: 3 }, { points: 90, year: 2020, week: 16 }),
		];
		const view = buildLandingView(profiles, [season(2020, [standing("a", 1500)])]);

		assert.deepEqual(view.recordGroups.map((g) => g.title), [REGULAR_GAME, PLAYOFF_GAME, FULL_SEASON]);
		assert.deepEqual(view.recordGroups.map((g) => g.records.length), [2, 2, 2]);
		assert.deepEqual(view.recordGroups.flatMap((g) => g.records.map((r) => r.label)), [
			"Highest score",
			"Lowest score",
			"Highest score",
			"Lowest score",
			"Most points",
			"Fewest points",
		]);
	});

	test("emits no groups at all when no team has played", () => {
		const view = buildLandingView([profile("a", "Alpha", [])], years(2025));
		assert.deepEqual(view.recordGroups, []);
	});
});

describe("longest streaks", () => {
	const STREAKS = "Regular season · longest streaks";
	const PROFILES = [profile("a", "Alpha", []), profile("b", "Beta", [])];

	/** `results` like "WWLLW"; weeks run 1..n inside `year`. */
	function run(managerId: string, year: number, results: string, fromWeek = 1): TeamGame[] {
		return [...results].map((outcome, i) => ({
			year,
			week: fromWeek + i,
			type: "regular" as const,
			managerId,
			points: outcome === "W" ? 120 : outcome === "L" ? 80 : 100,
			opponentId: "z",
			opponentPoints: 100,
		}));
	}

	function streak(games: TeamGame[], label: string): LeagueRecord | undefined {
		return find(buildLandingView(PROFILES, years(2024, 2025), [], games), STREAKS, label);
	}

	test("finds the longest run of wins and of losses", () => {
		const games = [...run("a", 2025, "WWWLWW"), ...run("b", 2025, "LLLLWL")];
		assert.equal(streak(games, "Longest winning streak")?.value, "3");
		assert.equal(streak(games, "Longest losing streak")?.value, "4");
	});

	// The point of the feature: a season boundary is just another gap.
	test("a streak carries across seasons", () => {
		const games = [...run("a", 2024, "LWWW", 12), ...run("a", 2025, "WWL")];
		const won = streak(games, "Longest winning streak");
		assert.equal(won?.value, "5", "3 to end 2024 plus 2 to open 2025");
		assert.match(won?.detail ?? "", /2024 week 13 – 2025 week 2/);
	});

	test("a same-season streak reads as a week range", () => {
		assert.match(
			streak(run("a", 2025, "WWW"), "Longest winning streak")?.detail ?? "",
			/2025 weeks 1–3/,
		);
	});

	// Rule 7 and D20: neither scope counts, and a consolation game must not be
	// spliced into the middle of a regular-season run.
	test("playoff and consolation games neither extend nor break a streak", () => {
		const games: TeamGame[] = [
			...run("a", 2025, "WW"),
			{ ...run("a", 2025, "L", 16)[0]!, type: "playoff" },
			{ ...run("a", 2025, "L", 17)[0]!, type: "consolation" },
			...run("a", 2025, "W", 18),
		];
		assert.equal(streak(games, "Longest winning streak")?.value, "3");
		assert.equal(streak(games, "Longest losing streak"), undefined);
	});

	test("a draw breaks both streaks", () => {
		assert.equal(streak(run("a", 2025, "WWDWW"), "Longest winning streak")?.value, "2");
		assert.equal(streak(run("a", 2025, "LLDLLL"), "Longest losing streak")?.value, "3");
	});

	test("games out of order are sorted before the run is measured", () => {
		const games = [...run("a", 2025, "WWW")].reverse();
		assert.equal(streak(games, "Longest winning streak")?.value, "3");
	});

	test("a tie names the other holder and gives the tile to whoever got there first", () => {
		const games = [...run("a", 2025, "WWW", 5), ...run("b", 2024, "WWW", 5)];
		const won = streak(games, "Longest winning streak");
		assert.equal(won?.value, "3");
		assert.equal(won?.displayName, "Beta", "Beta reached it in 2024");
		assert.match(won?.sharedWith ?? "", /Alpha/);
	});

	test("an outright record names no one else", () => {
		const games = [...run("a", 2025, "WWW"), ...run("b", 2025, "WW")];
		assert.equal(streak(games, "Longest winning streak")?.sharedWith, undefined);
	});

	test("the group is absent when no games are supplied", () => {
		const view = buildLandingView(PROFILES, years(2025));
		assert.equal(view.recordGroups.some((g) => g.title === STREAKS), false);
	});
});
