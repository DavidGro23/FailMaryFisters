/**
 * `npm run build:data`
 *
 * Documented contract (CLAUDE.md): stages 1-3, writing `dist/data/` and
 * `dist/_validation.json`. Only stage 1 exists so far, so only the validation
 * report is written; `dist/data/` arrives with stage 3.
 *
 * Exits non-zero if any error-severity issue was raised, so CI fails the build
 * on a hard validation error (§13.2).
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { loadRawData } from "../load/index.ts";
import { serializeReport, type ValidationReport } from "../load/validation.ts";
import { DIST_DIR, RAW_DATA_DIR, VALIDATION_REPORT } from "../paths.ts";

function summarize(report: ValidationReport): void {
	const { errors, warnings, infos, byCode } = report.summary;
	console.log(`  errors ${errors}   warnings ${warnings}   infos ${infos}`);

	if (report.issues.length > 0) {
		console.log("");
		for (const [code, count] of Object.entries(byCode)) {
			console.log(`    ${String(count).padStart(4)}  ${code}`);
		}
	}

	// Errors are what stop the build, so print them in full rather than making
	// someone open the JSON to find out what broke.
	const errorIssues = report.issues.filter((i) => i.severity === "error");
	if (errorIssues.length > 0) {
		console.log("");
		console.log("  Errors:");
		for (const issue of errorIssues.slice(0, 50)) {
			const where = [issue.year, issue.file, issue.recordIndex !== undefined ? `#${issue.recordIndex}` : undefined]
				.filter((p) => p !== undefined)
				.join(" ");
			console.log(`    ${where}: ${issue.message}`);
		}
		if (errorIssues.length > 50) {
			console.log(`    ... and ${errorIssues.length - 50} more (see ${VALIDATION_REPORT}).`);
		}
	}
}

const result = loadRawData(RAW_DATA_DIR);

console.log("");
console.log("Stage 1 — load + validate");
console.log("");
for (const league of result.leagues) {
	const years = league.seasons.map((s) => s.year);
	const range = years.length > 0 ? `${years[0]}-${years[years.length - 1]}` : "none";
	console.log(`  ${league.folderName}: ${league.seasons.length} seasons (${range}), ${league.players.length} players`);
}
console.log("");
summarize(result.validation);

mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(VALIDATION_REPORT, serializeReport(result.validation), "utf8");

// GitHub Pages runs Jekyll, which silently drops underscore-prefixed paths.
// Without this, `_validation.json` would not exist in production and nothing
// would report an error (§13.2).
writeFileSync(`${DIST_DIR}/.nojekyll`, "", "utf8");

console.log("");
console.log(`  wrote ${VALIDATION_REPORT}`);
console.log("");

if (!result.ok) {
	console.error("Build failed: validation reported errors.");
	process.exit(1);
}
