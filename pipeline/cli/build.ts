/**
 * `npm run build` — the full pipeline: load -> normalize -> aggregate -> render.
 *
 * Thin-slice scope: one season's standings page. The command is real now rather
 * than a stub, but it does not yet emit the full site.
 */

import { renderSite } from "../render/index.ts";
import { runPipeline, TARGET_YEAR } from "../pipeline.ts";
import { writeValidationReport, summarize } from "./report.ts";

const result = runPipeline();

console.log("");
console.log("Full pipeline — load, normalize, aggregate, render");
console.log("");
console.log(`  leagues ${result.leagueCount}   seasons ${result.seasonCount}   default season ${TARGET_YEAR}`);
console.log("");
summarize(result.validation);

writeValidationReport(result.validation);

// Errors mean the data is not trustworthy, so nothing is rendered from it.
if (
	!result.ok ||
	result.seasons.length === 0 ||
	!result.allTime ||
	!result.landing ||
	!result.leagueFolder
) {
	console.error("Build failed: validation reported errors; no pages were written.");
	process.exit(1);
}

const written = renderSite(
	result.seasons,
	result.brackets,
	result.allTime,
	result.profiles,
	result.drafts,
	result.landing,
	result.rulebook,
	result.leagueFolder,
);
for (const file of written) console.log(`  wrote dist/${file.replace(/\\/g, "/")}`);
console.log("");
