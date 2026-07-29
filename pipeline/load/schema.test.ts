/**
 * Record-level schema rules, driven through the real loader rather than through
 * `checkRecord` directly — a test that a rule fires end-to-end is worth more
 * than one that a helper returns false.
 */

import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { firstRecord, makeFixture } from "./fixture.ts";
import { loadRawData } from "./index.ts";
import { CODES, type Severity, type ValidationIssue } from "./validation.ts";

function loadWith(mutate: (files: Record<string, unknown>, year: number) => void): {
	issues: ValidationIssue[];
	ok: boolean;
	seasonCount: number;
} {
	const fixture = makeFixture({ years: [2025], mutate });
	try {
		const result = loadRawData(fixture.root);
		return {
			issues: result.validation.issues,
			ok: result.ok,
			seasonCount: result.leagues[0]?.seasons.length ?? 0,
		};
	} finally {
		fixture.cleanup();
	}
}

function find(issues: ValidationIssue[], code: string, severity?: Severity): ValidationIssue | undefined {
	return issues.find((i) => i.code === code && (severity === undefined || i.severity === severity));
}

describe("a valid fixture", () => {
	const fixture = makeFixture({ years: [2024, 2025] });
	after(() => fixture.cleanup());
	const result = loadRawData(fixture.root);

	test("loads without errors or warnings", () => {
		assert.equal(result.validation.summary.errors, 0);
		assert.equal(result.validation.summary.warnings, 0);
		assert.equal(result.ok, true);
	});

	test("returns both seasons in ascending year order", () => {
		assert.deepEqual(result.leagues[0]?.seasons.map((s) => s.year), [2024, 2025]);
	});

	test("splits the league folder into id and slug", () => {
		assert.equal(result.leagues[0]?.leagueId, "42");
		assert.equal(result.leagues[0]?.slug, "testleague");
	});

	test("reports an empty nflTeam once per file, not once per record", () => {
		const empties = result.validation.issues.filter((i) => i.code === CODES.EMPTY_FIELD);
		assert.equal(empties.length, 2, "one per season, from the single empty end-roster record");
		assert.equal(empties[0]?.severity, "info");
	});
});

describe("required fields", () => {
	test("a missing required field is an error and skips the season", () => {
		const { issues, ok, seasonCount } = loadWith((files) => {
			delete firstRecord(files, "managers-history.json")["userId"];
		});
		const issue = find(issues, CODES.MISSING_REQUIRED_FIELD, "error");
		assert.ok(issue, "expected a missing-required-field error");
		assert.equal(issue.field, "userId");
		assert.equal(ok, false);
		assert.equal(seasonCount, 0, "a season that fails validation is not returned");
	});

	test("an explicit null in a non-nullable field is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "managers-history.json")["teamName"] = null;
		});
		assert.ok(find(issues, CODES.WRONG_FIELD_TYPE, "error"));
		assert.equal(ok, false);
	});

	test("null is accepted where the schema allows it", () => {
		const { issues } = loadWith((files) => {
			firstRecord(files, "managers-history.json")["coManagerName"] = null;
		});
		assert.equal(issues.filter((i) => i.severity === "error").length, 0);
	});
});

describe("field types", () => {
	// The D1 failure mode in miniature: a numeric teamId would compare unequal to
	// the string "1" everywhere and silently split one team into two.
	test("a numeric teamId is an error, not a coercion", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "managers-history.json")["teamId"] = 1;
		});
		const issue = find(issues, CODES.WRONG_FIELD_TYPE, "error");
		assert.ok(issue);
		assert.equal(issue.field, "teamId");
		assert.equal(ok, false);
	});

	test("a non-integer where an integer is required is an error", () => {
		const { ok, issues } = loadWith((files) => {
			firstRecord(files, "regular-season-standings-history.json")["wins"] = 1.5;
		});
		assert.ok(find(issues, CODES.WRONG_FIELD_TYPE, "error"));
		assert.equal(ok, false);
	});

	test("fractional points are fine", () => {
		const { ok } = loadWith((files) => {
			firstRecord(files, "matchup-history.json")["team1Points"] = 100.55;
		});
		assert.equal(ok, true);
	});
});

describe("unknown fields", () => {
	test("an unknown field is a warning, not an error", () => {
		const { issues, ok, seasonCount } = loadWith((files) => {
			firstRecord(files, "managers-history.json")["newColumn"] = "surprise";
		});
		const issue = find(issues, CODES.UNKNOWN_FIELD);
		assert.ok(issue, "expected an unknown-field issue");
		assert.equal(issue.severity, "warning");
		assert.equal(issue.field, "newColumn");
		// A drifting export must not stop the build.
		assert.equal(ok, true);
		assert.equal(seasonCount, 1);
	});
});

describe("enum-shaped fields", () => {
	// A future season may legitimately add a status or bracket type. Failing the
	// build on that would be worse than rendering it.
	test("an unexpected status is a warning, not an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "end-roster-history.json")["status"] = "TAXI";
		});
		const issue = find(issues, CODES.UNEXPECTED_ENUM_VALUE);
		assert.ok(issue);
		assert.equal(issue.severity, "warning");
		assert.equal(ok, true);
	});

	test("an unexpected bracketType is a warning", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "playoff-history.json")["bracketType"] = "Plate";
		});
		assert.ok(find(issues, CODES.UNEXPECTED_ENUM_VALUE, "warning"));
		assert.equal(ok, true);
	});

	test("an empty roundLabel is accepted without comment", () => {
		const { issues } = loadWith((files) => {
			firstRecord(files, "playoff-history.json")["roundLabel"] = "";
		});
		assert.equal(issues.filter((i) => i.severity !== "info").length, 0);
	});
});

describe("patterned fields", () => {
	test("a malformed matchupId is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "matchup-history.json")["matchupId"] = "week-one";
		});
		const issue = find(issues, CODES.MALFORMED_FIELD, "error");
		assert.ok(issue);
		assert.equal(issue.field, "matchupId");
		assert.equal(ok, false);
	});

	test("a transactionDate carrying a timezone is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "trade-history.json")["transactionDate"] = "2025-10-01T12:00:00Z";
		});
		assert.ok(find(issues, CODES.MALFORMED_FIELD, "error"));
		assert.equal(ok, false);
	});

	test("transactionWeek 0 is valid", () => {
		const { ok } = loadWith((files) => {
			firstRecord(files, "trade-history.json")["transactionWeek"] = 0;
		});
		assert.equal(ok, true);
	});
});

describe("nested structures", () => {
	test("a non-numeric stat value is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "player-matchup-statistics-history.json")["stats"] = { pass_yd: "300" };
		});
		assert.ok(find(issues, CODES.WRONG_FIELD_TYPE, "error"));
		assert.equal(ok, false);
	});

	test("an unfamiliar stat key is accepted — the key set drifts by season", () => {
		const { ok, issues } = loadWith((files) => {
			firstRecord(files, "player-matchup-statistics-history.json")["stats"] = {
				pass_yd: 300,
				brand_new_stat: 7,
			};
		});
		assert.equal(ok, true);
		assert.equal(issues.filter((i) => i.severity === "warning").length, 0);
	});

	test("an unknown trade send type is an error", () => {
		const { issues, ok } = loadWith((files) => {
			const trade = firstRecord(files, "trade-history.json");
			(trade["transaction"] as Array<{ sends: unknown[] }>)[0]!.sends = [{ type: "cash", amount: 5 }];
		});
		assert.ok(find(issues, CODES.UNEXPECTED_ENUM_VALUE, "error"));
		assert.equal(ok, false);
	});

	test("a future-year draft pick is valid", () => {
		const { ok } = loadWith((files) => {
			const trade = firstRecord(files, "trade-history.json");
			(trade["transaction"] as Array<{ sends: unknown[] }>)[1]!.sends = [
				{ type: "draftPick", draftPick: { year: 2099, round: 1 } },
			];
		});
		assert.equal(ok, true);
	});

	test("a malformed rosterPositions entry is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "settings-history.json")["rosterPositions"] = { QB: 1 };
		});
		assert.ok(find(issues, CODES.NOT_AN_OBJECT, "error") ?? find(issues, CODES.WRONG_FIELD_TYPE, "error"));
		assert.equal(ok, false);
	});
});

describe("file-level structure", () => {
	test("a settings file with more than one record is an error", () => {
		const { issues, ok } = loadWith((files) => {
			const settings = files["settings-history.json"] as unknown[];
			settings.push({ ...(settings[0] as object) });
		});
		assert.ok(find(issues, CODES.SETTINGS_RECORD_COUNT, "error"));
		assert.equal(ok, false);
	});

	test("a top-level object where an array is expected is an error", () => {
		const { issues, ok } = loadWith((files) => {
			files["end-standings-history.json"] = { rank: 1 };
		});
		assert.ok(find(issues, CODES.NOT_AN_ARRAY, "error"));
		assert.equal(ok, false);
	});
});

describe("cross-file checks", () => {
	test("a teamId absent from the managers file is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "matchup-history.json")["team2Id"] = "99";
		});
		const issue = find(issues, CODES.UNRESOLVED_TEAM_ID, "error");
		assert.ok(issue, "expected an unresolved-team-id error");
		assert.equal(ok, false);
	});

	test("a record whose year disagrees with its folder is an error", () => {
		const { issues, ok } = loadWith((files) => {
			firstRecord(files, "end-standings-history.json")["year"] = 1999;
		});
		assert.ok(find(issues, CODES.YEAR_MISMATCH, "error"));
		assert.equal(ok, false);
	});

	test("a playerId absent from the registry is an info, never an error", () => {
		const fixture = makeFixture({ years: [2025], players: [{ playerId: "9001", playerName: "P One", pos: "QB" }] });
		try {
			const result = loadRawData(fixture.root);
			const issue = result.validation.issues.find((i) => i.code === CODES.PLAYER_NOT_IN_REGISTRY);
			assert.ok(issue, "expected a player-not-in-registry issue");
			assert.equal(issue.severity, "info");
			assert.ok(issue.message.includes("9002"));
			assert.equal(result.ok, true, "an incomplete registry must not fail the build");
		} finally {
			fixture.cleanup();
		}
	});

	test("a duplicate playerId in the registry is an error", () => {
		const fixture = makeFixture({
			years: [2025],
			players: [
				{ playerId: "9001", playerName: "P One", pos: "QB" },
				{ playerId: "9001", playerName: "P One Again", pos: "RB" },
				{ playerId: "9002", playerName: "P Two", pos: "WR" },
			],
		});
		try {
			const result = loadRawData(fixture.root);
			assert.ok(result.validation.issues.some((i) => i.code === CODES.DUPLICATE_PLAYER_ID));
			assert.equal(result.ok, false);
		} finally {
			fixture.cleanup();
		}
	});
});
