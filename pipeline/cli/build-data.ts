/**
 * `npm run build:data`
 *
 * Documented contract (CLAUDE.md): stages 1-3, writing `dist/data/` and
 * `dist/_validation.json`. It runs load -> normalize -> aggregate and writes the
 * validation report; `dist/data/` stays empty until a JS-enhanced page needs
 * JSON, which none does yet.
 *
 * Exits non-zero if any error-severity issue was raised, so CI fails the build
 * on a hard validation error (§13.2).
 */

import { runPipeline, TARGET_YEAR } from "../pipeline.ts";
import { writeValidationReport, summarize } from "./report.ts";

const result = runPipeline();

console.log("");
console.log("Stages 1-3 — load, normalize, aggregate");
console.log("");
console.log(`  leagues ${result.leagueCount}   seasons ${result.seasonCount}   default season ${TARGET_YEAR}`);
console.log(`  season tables ${result.seasons.length}   all-time rows ${result.allTime?.rows.length ?? 0}`);
console.log("");
summarize(result.validation);

writeValidationReport(result.validation);

if (!result.ok) {
	console.error("Build failed: validation reported errors.");
	process.exit(1);
}
