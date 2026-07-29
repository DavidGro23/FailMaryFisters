/**
 * Builds a minimal but fully valid league on disk, for tests.
 *
 * Two teams, one week, one playoff game — just enough to satisfy every spec.
 * Tests then mutate one field to prove a specific check fires, which keeps each
 * test about one rule instead of about fixture plumbing.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type JsonRecord = Record<string, unknown>;

export function seasonFiles(year: number): Record<string, unknown> {
	const matchupId = `${year}-1-1-2`;
	return {
		"managers-history.json": [
			{
				year,
				managerName: "Ada",
				userId: "100",
				coManagerName: null,
				coUserId: null,
				teamName: "Alpha",
				teamId: "1",
				teamImgUrl: "https://example.invalid/a.jpg",
			},
			{
				year,
				managerName: "Bo",
				userId: "200",
				coManagerName: null,
				coUserId: null,
				teamName: "Beta",
				teamId: "2",
				teamImgUrl: "https://example.invalid/b.jpg",
			},
		],
		"regular-season-standings-history.json": [
			{
				year,
				divisionId: 1,
				divisionName: "Regular Season",
				teamId: "1",
				divisionRank: 1,
				overallRank: 1,
				wins: 1,
				losses: 0,
				draws: 0,
				pointsFor: 100.5,
				pointsAgainst: 90.25,
			},
			{
				year,
				divisionId: 1,
				divisionName: "Regular Season",
				teamId: "2",
				divisionRank: 2,
				overallRank: 2,
				wins: 0,
				losses: 1,
				draws: 0,
				pointsFor: 90.25,
				pointsAgainst: 100.5,
			},
		],
		"end-standings-history.json": [
			{ year, rank: 1, teamId: "1", teamName: "Alpha" },
			{ year, rank: 2, teamId: "2", teamName: "Beta" },
		],
		"matchup-history.json": [
			{ year, week: 1, matchupId, team1Id: "1", team2Id: "2", team1Points: 100.5, team2Points: 90.25 },
			{
				year,
				week: 2,
				matchupId: `${year}-2-1-2`,
				team1Id: "1",
				team2Id: "2",
				team1Points: 88.0,
				team2Points: 91.0,
			},
		],
		"playoff-history.json": [
			{
				year,
				week: 2,
				round: 1,
				roundLabel: "",
				bracketType: "Championship",
				team1Id: "1",
				team1Seed: 1,
				team2Id: "2",
				team2Seed: 2,
				team1Points: 88.0,
				team2Points: 91.0,
				winner: "2",
			},
		],
		"draft-history.json": [
			{ year, round: 1, pick: 1, teamId: "1", teamName: "Alpha", playerId: "9001", playerName: "P One" },
			{ year, round: 1, pick: 2, teamId: "2", teamName: "Beta", playerId: "9002", playerName: "P Two" },
		],
		"end-roster-history.json": [
			{ year, teamId: "1", playerId: "9001", status: "ST", pos: "QB", nflTeam: "SF", pts: 100.5 },
			{ year, teamId: "2", playerId: "9002", status: "BN", pos: "BN", nflTeam: "", pts: 90.25 },
		],
		"player-matchup-statistics-history.json": [
			{
				matchupId,
				teamId: "1",
				playerId: "9001",
				pos: "QB",
				nflTeam: "SF",
				status: "ST",
				pts: 100.5,
				stats: { pass_yd: 300, pass_td: 2 },
			},
			{
				matchupId,
				teamId: "2",
				playerId: "9002",
				pos: "BN",
				nflTeam: "KC",
				status: "BN",
				pts: 90.25,
				stats: { rec: 5, rec_yd: 60 },
			},
		],
		"trade-history.json": [
			{
				year,
				transactionDate: `${year}-10-01T12:00:00`,
				transactionWeek: 0,
				transactionOwnerUserId: "100",
				transaction: [
					{ from: "1", to: "2", sends: [{ type: "player", playerId: "9001" }] },
					{
						from: "2",
						to: "1",
						sends: [{ type: "draftPick", draftPick: { year: year + 1, round: 3 } }],
					},
				],
			},
		],
		"settings-history.json": [
			{
				year,
				rosterPositions: { QB: { count: 1 }, BN: { count: 1 } },
				offenseSettings: { pass_yd: 0.04, pass_td: 4 },
				kickingSettings: {},
				dstSettings: {},
				otherSettings: { "Use Negative Pts": "Yes" },
			},
		],
	};
}

export const PLAYERS = [
	{ playerId: "9001", playerName: "P One", pos: "QB" },
	{ playerId: "9002", playerName: "P Two", pos: "WR" },
];

export interface Fixture {
	root: string;
	leagueDir: string;
	cleanup: () => void;
}

/** Writes a valid league to a fresh temp directory. `mutate` can break one file first. */
export function makeFixture(
	options: {
		years?: number[];
		folderName?: string;
		mutate?: (files: Record<string, unknown>, year: number) => void;
		players?: unknown;
	} = {},
): Fixture {
	const years = options.years ?? [2024, 2025];
	const folderName = options.folderName ?? "42-testleague";

	const root = mkdtempSync(join(tmpdir(), "ff-league-test-"));
	const leagueDir = join(root, folderName);
	mkdirSync(leagueDir, { recursive: true });

	writeFileSync(
		join(leagueDir, "players.json"),
		JSON.stringify(options.players ?? PLAYERS, null, "\t"),
		"utf8",
	);

	for (const year of years) {
		const dir = join(leagueDir, String(year));
		mkdirSync(dir, { recursive: true });
		const files = seasonFiles(year);
		options.mutate?.(files, year);
		for (const [name, contents] of Object.entries(files)) {
			writeFileSync(join(dir, name), JSON.stringify(contents, null, "\t"), "utf8");
		}
	}

	return {
		root,
		leagueDir,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

/** Reaches into a fixture file's first record so a test can corrupt one field. */
export function firstRecord(files: Record<string, unknown>, file: string): JsonRecord {
	const contents = files[file];
	if (!Array.isArray(contents) || contents.length === 0) {
		throw new Error(`Fixture file ${file} is not a non-empty array.`);
	}
	return contents[0] as JsonRecord;
}
