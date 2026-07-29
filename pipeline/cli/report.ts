/** Shared console summary and validation-report writing for the CLI entry points. */

import { mkdirSync, writeFileSync } from "node:fs";

import { serializeReport, type ValidationReport } from "../load/validation.ts";
import { DIST_DIR, VALIDATION_REPORT } from "../paths.ts";

export function summarize(report: ValidationReport): void {
	const { errors, warnings, infos, byCode } = report.summary;
	console.log(`  errors ${errors}   warnings ${warnings}   infos ${infos}`);

	if (report.issues.length > 0) {
		console.log("");
		for (const [code, count] of Object.entries(byCode)) {
			console.log(`    ${String(count).padStart(4)}  ${code}`);
		}
	}

	// Errors stop the build, so print them in full rather than making someone
	// open the JSON to find out what broke.
	const errorIssues = report.issues.filter((i) => i.severity === "error");
	if (errorIssues.length > 0) {
		console.log("");
		console.log("  Errors:");
		for (const issue of errorIssues.slice(0, 50)) {
			const where = [issue.year, issue.file, issue.recordIndex !== undefined ? `#${issue.recordIndex}` : undefined]
				.filter((p) => p !== undefined)
				.join(" ");
			console.log(`    [${issue.stage}] ${where}: ${issue.message}`);
		}
		if (errorIssues.length > 50) {
			console.log(`    ... and ${errorIssues.length - 50} more (see ${VALIDATION_REPORT}).`);
		}
	}
}

export function writeValidationReport(report: ValidationReport): void {
	mkdirSync(DIST_DIR, { recursive: true });
	writeFileSync(VALIDATION_REPORT, serializeReport(report), "utf8");

	// GitHub Pages runs Jekyll, which silently drops underscore-prefixed paths.
	// Without this, `_validation.json` would not exist in production and nothing
	// would report an error (§13.2).
	writeFileSync(`${DIST_DIR}/.nojekyll`, "", "utf8");

	console.log("");
	console.log(`  wrote ${VALIDATION_REPORT}`);
	console.log("");
}
