/**
 * The validation report is a build artefact committed to `dist/`, so NFR-9
 * applies to it: identical input must produce byte-identical output.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { firstRecord, makeFixture } from "./fixture.ts";
import { loadRawData } from "./index.ts";
import { CODES, serializeReport, ValidationCollector } from "./validation.ts";

describe("determinism (NFR-9)", () => {
	test("two runs over the same input serialize identically", () => {
		const fixture = makeFixture({
			years: [2024, 2025],
			mutate: (files) => {
				// Seed a mix of severities so ordering actually has work to do.
				firstRecord(files, "managers-history.json")["extra"] = 1;
				firstRecord(files, "end-roster-history.json")["status"] = "TAXI";
			},
		});
		try {
			const first = serializeReport(loadRawData(fixture.root).validation);
			const second = serializeReport(loadRawData(fixture.root).validation);
			assert.equal(first, second);
		} finally {
			fixture.cleanup();
		}
	});

	test("the report carries no timestamp", () => {
		const fixture = makeFixture({ years: [2025] });
		try {
			const json = serializeReport(loadRawData(fixture.root).validation);
			// A `generatedAt` field would change on every run and break the guarantee.
			assert.ok(!/generatedAt|timestamp/i.test(json), "report must not embed a time");
		} finally {
			fixture.cleanup();
		}
	});

	test("issues are ordered independently of insertion order", () => {
		const build = (order: "forward" | "reverse"): string => {
			const v = new ValidationCollector();
			const add = [
				(): void => v.warn(CODES.UNKNOWN_FIELD, "b", { league: "L", year: 2025, file: "b.json" }),
				(): void => v.error(CODES.YEAR_MISMATCH, "a", { league: "L", year: 2024, file: "a.json" }),
				(): void => v.info(CODES.EMPTY_FIELD, "c", { league: "L", year: 2025, file: "a.json" }),
			];
			for (const fn of order === "forward" ? add : [...add].reverse()) fn();
			return serializeReport(v.report());
		};
		assert.equal(build("forward"), build("reverse"));
	});
});

describe("report summary", () => {
	test("counts severities and groups by code", () => {
		const v = new ValidationCollector();
		v.error(CODES.YEAR_MISMATCH, "x", { league: "L" });
		v.warn(CODES.UNKNOWN_FIELD, "y", { league: "L" });
		v.warn(CODES.UNKNOWN_FIELD, "z", { league: "L" });
		v.info(CODES.EMPTY_FIELD, "w", { league: "L" });

		const report = v.report();
		assert.deepEqual(report.summary, {
			errors: 1,
			warnings: 2,
			infos: 1,
			byCode: { [CODES.EMPTY_FIELD]: 1, [CODES.UNKNOWN_FIELD]: 2, [CODES.YEAR_MISMATCH]: 1 },
		});
	});

	test("omits location keys that were not supplied", () => {
		const v = new ValidationCollector();
		v.info(CODES.EMPTY_FIELD, "x", { league: "L" });
		const issue = v.report().issues[0];
		assert.ok(issue);
		assert.equal("year" in issue, false);
		assert.equal("file" in issue, false);
		assert.equal("recordIndex" in issue, false);
		assert.equal("field" in issue, false);
	});
});
