/**
 * Discovery must be driven entirely by the filesystem: no hardcoded league id,
 * no hardcoded year range. A 2026 folder or a second league has to work with no
 * code change, so these tests use a fixture league that is neither.
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { discoverLeagues } from "./discover.ts";
import { makeFixture, PLAYERS, seasonFiles } from "./fixture.ts";
import { loadRawData } from "./index.ts";
import { CODES, ValidationCollector } from "./validation.ts";

describe("league and season discovery", () => {
	test("finds a league whose id and years are nothing like the real one", () => {
		const fixture = makeFixture({ years: [2031, 2032], folderName: "7-otherleague" });
		try {
			const result = loadRawData(fixture.root);
			assert.equal(result.leagues.length, 1);
			assert.equal(result.leagues[0]?.folderName, "7-otherleague");
			assert.deepEqual(result.leagues[0]?.seasons.map((s) => s.year), [2031, 2032]);
			assert.equal(result.ok, true);
		} finally {
			fixture.cleanup();
		}
	});

	test("sorts seasons numerically, not lexically", () => {
		// Tested against `discoverLeagues` directly: the trap only shows up when
		// year lengths differ (lexical order would give 2019, 2020, 209), and a
		// 3-digit year cannot produce a valid matchupId to load end-to-end.
		// D8's "sort numerically, always" applies to folder names too.
		const fixture = makeFixture({ years: [2020, 2019] });
		try {
			mkdirSync(join(fixture.leagueDir, "209"), { recursive: true });
			const v = new ValidationCollector();
			const leagues = discoverLeagues(fixture.root, v);
			assert.deepEqual(leagues[0]?.seasons.map((s) => s.year), [209, 2019, 2020]);
		} finally {
			fixture.cleanup();
		}
	});

	test("discovers a second league alongside the first", () => {
		const fixture = makeFixture({ years: [2025], folderName: "1-first" });
		try {
			const secondDir = join(fixture.root, "2-second");
			mkdirSync(join(secondDir, "2025"), { recursive: true });
			writeFileSync(join(secondDir, "players.json"), JSON.stringify(PLAYERS), "utf8");
			for (const [name, contents] of Object.entries(seasonFiles(2025))) {
				writeFileSync(join(secondDir, "2025", name), JSON.stringify(contents), "utf8");
			}

			const result = loadRawData(fixture.root);
			assert.deepEqual(
				result.leagues.map((l) => l.folderName).sort(),
				["1-first", "2-second"],
			);
			assert.equal(result.ok, true);
		} finally {
			fixture.cleanup();
		}
	});

	test("ignores a decoy directory that is not a season year", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			mkdirSync(join(fixture.leagueDir, "archive-2018"), { recursive: true });

			const result = loadRawData(fixture.root);
			assert.deepEqual(result.leagues[0]?.seasons.map((s) => s.year), [2025]);
			const warning = result.validation.issues.find((i) => i.code === CODES.UNEXPECTED_ENTRY);
			assert.ok(warning, "the ignored directory should be reported");
			assert.equal(warning.severity, "warning");
			assert.equal(result.ok, true, "a stray directory must not fail the build");
		} finally {
			fixture.cleanup();
		}
	});

	test("treats assets/ as expected, not as a stray directory", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			mkdirSync(join(fixture.leagueDir, "assets"), { recursive: true });
			const result = loadRawData(fixture.root);
			assert.equal(
				result.validation.issues.filter((i) => i.code === CODES.UNEXPECTED_ENTRY).length,
				0,
			);
		} finally {
			fixture.cleanup();
		}
	});

	test("a non-league entry at the raw-data root is a warning", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			writeFileSync(join(fixture.root, "README.md"), "notes", "utf8");
			const result = loadRawData(fixture.root);
			assert.ok(result.validation.issues.some((i) => i.code === CODES.UNEXPECTED_ENTRY));
			assert.equal(result.ok, true);
		} finally {
			fixture.cleanup();
		}
	});

	test("a missing raw-data directory is an error, not a crash", () => {
		const result = loadRawData(join(import.meta.dirname, "does-not-exist"));
		assert.equal(result.ok, false);
		assert.ok(result.validation.issues.some((i) => i.code === CODES.NO_LEAGUE_FOLDER));
	});
});

describe("season file completeness", () => {
	test("a missing season file is an error and the season is skipped", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			rmSync(join(fixture.leagueDir, "2025", "playoff-history.json"));
			const result = loadRawData(fixture.root);
			assert.ok(result.validation.issues.some((i) => i.code === CODES.MISSING_FILE));
			assert.ok(result.validation.issues.some((i) => i.code === CODES.SEASON_SKIPPED));
			assert.equal(result.leagues[0]?.seasons.length, 0);
			assert.equal(result.ok, false);
		} finally {
			fixture.cleanup();
		}
	});

	test("an unexpected file in a season folder is a warning", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			writeFileSync(join(fixture.leagueDir, "2025", "notes.json"), "{}", "utf8");
			const result = loadRawData(fixture.root);
			assert.ok(result.validation.issues.some((i) => i.code === CODES.UNEXPECTED_FILE));
			assert.equal(result.ok, true);
		} finally {
			fixture.cleanup();
		}
	});

	test("invalid JSON is reported rather than thrown", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			writeFileSync(join(fixture.leagueDir, "2025", "draft-history.json"), "{not json", "utf8");
			const result = loadRawData(fixture.root);
			assert.ok(result.validation.issues.some((i) => i.code === CODES.INVALID_JSON));
			assert.equal(result.ok, false);
		} finally {
			fixture.cleanup();
		}
	});

	test("one broken season does not stop the others from loading", () => {
		const fixture = makeFixture({ years: [2024, 2025] });
		try {
			rmSync(join(fixture.leagueDir, "2024", "trade-history.json"));
			const result = loadRawData(fixture.root);
			assert.deepEqual(result.leagues[0]?.seasons.map((s) => s.year), [2025]);
			assert.equal(result.ok, false);
		} finally {
			fixture.cleanup();
		}
	});
});

describe("hand-maintained files", () => {
	test("their absence is info-level and never fails the build", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			const result = loadRawData(fixture.root);
			const absent = result.validation.issues.filter(
				(i) => i.code === CODES.HAND_WRITTEN_FILE_ABSENT,
			);
			assert.equal(absent.length, 3, "manager-aliases.json, league-rules.json, assets/");
			assert.ok(absent.every((i) => i.severity === "info"));
			assert.equal(result.ok, true);
			assert.deepEqual(result.leagues[0]?.handWritten, {
				managerAliases: false,
				leagueRules: false,
				assets: false,
			});
		} finally {
			fixture.cleanup();
		}
	});

	test("their presence is detected and reported silently", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			writeFileSync(join(fixture.leagueDir, "manager-aliases.json"), "[]", "utf8");
			mkdirSync(join(fixture.leagueDir, "assets"), { recursive: true });

			const result = loadRawData(fixture.root);
			assert.equal(result.leagues[0]?.handWritten.managerAliases, true);
			assert.equal(result.leagues[0]?.handWritten.assets, true);
			assert.equal(result.leagues[0]?.handWritten.leagueRules, false);
			assert.equal(
				result.validation.issues.filter((i) => i.code === CODES.HAND_WRITTEN_FILE_ABSENT).length,
				1,
			);
		} finally {
			fixture.cleanup();
		}
	});
});
