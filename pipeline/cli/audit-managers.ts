/**
 * `npm run audit:managers` — the D2 manager identity report.
 *
 * Run this before trusting any cross-season figure, and before hand-writing
 * `manager-aliases.json`. CLAUDE.md is explicit that the alias file must never
 * be generated from guesswork; this report is where its contents come from.
 *
 * Scope: reads raw `managers-history.json` records only. It builds no registry,
 * derives no display names, and assigns no slugs — that is stage 2's job. This
 * is a report, not a pipeline stage.
 */

import { loadRawData } from "../load/index.ts";
import type { RawLeague } from "../load/types.ts";
import { RAW_DATA_DIR } from "../paths.ts";

interface Appearance {
	year: number;
	userId: string;
	teamId: string;
	managerName: string;
	teamName: string;
}

/** A run of consecutive seasons in which one userId held one teamId. */
interface Tenure {
	userId: string;
	managerName: string;
	from: number;
	to: number;
}

function groupBy(appearances: Appearance[], key: (a: Appearance) => string): Map<string, Appearance[]> {
	const map = new Map<string, Appearance[]>();
	for (const appearance of appearances) {
		const existing = map.get(key(appearance));
		if (existing) existing.push(appearance);
		else map.set(key(appearance), [appearance]);
	}
	return map;
}

function auditLeague(league: RawLeague): boolean {
	console.log("");
	console.log(`League ${league.folderName}`);
	console.log("=".repeat(72));

	// Seasons are already sorted ascending by the loader, so everything derived
	// from this list is chronological without re-sorting.
	const appearances: Appearance[] = league.seasons.flatMap((season) =>
		season.managers.map((m) => ({
			year: season.year,
			userId: m.userId,
			teamId: m.teamId,
			managerName: m.managerName,
			teamName: m.teamName,
		})),
	);

	const byUser = groupBy(appearances, (a) => a.userId);
	const byTeamId = groupBy(appearances, (a) => a.teamId);

	console.log("");
	console.log(`Managers: ${byUser.size} distinct userIds across ${league.seasons.length} seasons`);
	console.log("");

	const users = [...byUser.values()].sort(
		(a, b) => (a[0]?.year ?? 0) - (b[0]?.year ?? 0) || (a[0]?.userId ?? "").localeCompare(b[0]?.userId ?? ""),
	);

	for (const history of users) {
		const first = history[0];
		const latest = history[history.length - 1];
		if (!first || !latest) continue;
		const names = [...new Set(history.map((a) => a.managerName))].join(" / ");
		const teamNames = [...new Set(history.map((a) => a.teamName))];
		console.log(
			`  ${first.userId.padEnd(10)} ${first.year}-${latest.year}  ${names.padEnd(11)} ${teamNames.join(" -> ")}`,
		);
		if (teamNames.length > 1) {
			console.log(`  ${" ".repeat(10)} -> display name "${latest.teamName}" (latest team name, §6.5)`);
		}
	}

	let collisions = 0;

	// D14: two different people are named "Christian". managerName is never an
	// identifier and never a label — this section exists to prove why.
	console.log("");
	console.log("Name collisions");
	console.log("-".repeat(72));

	for (const [name, group] of [...groupBy(appearances, (a) => a.managerName)].sort()) {
		const userIds = [...new Set(group.map((a) => a.userId))];
		if (userIds.length > 1) {
			collisions++;
			console.log(`  managerName "${name}" maps to ${userIds.length} userIds: ${userIds.join(", ")}`);
		}
	}

	for (const history of users) {
		const names = [...new Set(history.map((a) => a.managerName))];
		if (names.length > 1) {
			collisions++;
			console.log(`  userId ${history[0]?.userId} appears under ${names.length} managerNames: ${names.join(", ")}`);
		}
	}

	// The display name is the latest team name (§6.5), and a collision there is a
	// hard build failure in stage 2 — never auto-numbered. Surface it now.
	const latestTeamNames = groupBy(
		users.flatMap((history) => {
			const latest = history[history.length - 1];
			return latest ? [latest] : [];
		}),
		(a) => a.teamName,
	);
	for (const [teamName, group] of [...latestTeamNames].sort()) {
		if (group.length > 1) {
			collisions++;
			console.log(
				`  DISPLAY NAME COLLISION: "${teamName}" is the latest team name of ${group.map((a) => a.userId).join(", ")}`,
			);
		}
	}

	if (collisions === 0) console.log("  none");

	// §9.7: succession is derived by walking each teamId chronologically. It is
	// never hand-written — recollection and the export have disagreed before.
	console.log("");
	console.log("Franchise succession (teamId chronology)");
	console.log("-".repeat(72));
	let handovers = 0;

	for (const [teamId, history] of [...byTeamId].sort((a, b) => Number(a[0]) - Number(b[0]))) {
		const tenures: Tenure[] = [];
		for (const appearance of history) {
			const current = tenures[tenures.length - 1];
			if (current && current.userId === appearance.userId) current.to = appearance.year;
			else
				tenures.push({
					userId: appearance.userId,
					managerName: appearance.managerName,
					from: appearance.year,
					to: appearance.year,
				});
		}

		if (tenures.length === 1) continue;
		handovers += tenures.length - 1;
		const chain = tenures
			.map((t) => `${t.managerName}(${t.userId}) ${t.from}${t.to === t.from ? "" : `-${t.to}`}`)
			.join("  ->  ");
		console.log(`  teamId ${teamId.padStart(2)}: ${chain}`);
	}

	if (handovers === 0) {
		console.log("  no teamId ever changed hands");
	} else {
		console.log("");
		console.log(`  ${handovers} handover(s). Each userId is a separate career: a manager is a`);
		console.log("  person, not a franchise, and lineage never affects a computed statistic (§9.7).");
	}

	return collisions === 0;
}

const result = loadRawData(RAW_DATA_DIR);
let clean = true;
for (const league of result.leagues) {
	if (!auditLeague(league)) clean = false;
}

console.log("");
if (!result.ok) {
	console.error("The load stage reported validation errors; run `npm run build:data` for detail.");
	process.exit(1);
}
if (!clean) {
	console.log("Collisions above are expected (D14) and are exactly why managerName is never used as a label.");
	console.log("");
}
