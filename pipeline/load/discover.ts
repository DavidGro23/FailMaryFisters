/**
 * Filesystem discovery.
 *
 * Nothing here knows that the league is `5613993-failmaryfisters` or that the
 * data runs 2017-2025. Dropping in a 2026 folder or a second league must work
 * with no code change.
 */

import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { CODES, type ValidationCollector } from "./validation.ts";

/** `<leagueId>-<slug>`, e.g. `5613993-failmaryfisters`. */
const LEAGUE_FOLDER = /^(\d+)-(.+)$/;

/** The ten files every season folder must contain. */
export const SEASON_FILES = [
	"draft-history.json",
	"end-roster-history.json",
	"end-standings-history.json",
	"managers-history.json",
	"matchup-history.json",
	"player-matchup-statistics-history.json",
	"playoff-history.json",
	"regular-season-standings-history.json",
	"settings-history.json",
	"trade-history.json",
] as const;

/** Hand-maintained, not exported by NFL Fantasy. Absence is expected, never an error. */
export const HAND_WRITTEN = {
	managerAliases: "manager-aliases.json",
	leagueRules: "league-rules.json",
	assets: "assets",
} as const;

export interface DiscoveredSeason {
	year: number;
	path: string;
}

export interface DiscoveredLeague {
	leagueId: string;
	slug: string;
	folderName: string;
	path: string;
	seasons: DiscoveredSeason[];
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Finds every league folder under `rawDataRoot`, and every season folder within
 * each. Seasons are sorted numerically — never lexically, which would order
 * them 1, 10, 11, 2 the same way the export orders weeks (D8).
 */
export function discoverLeagues(
	rawDataRoot: string,
	v: ValidationCollector,
): DiscoveredLeague[] {
	if (!isDirectory(rawDataRoot)) {
		v.error(CODES.NO_LEAGUE_FOLDER, `raw-data directory not found at ${rawDataRoot}.`, {
			league: "-",
		});
		return [];
	}

	const leagues: DiscoveredLeague[] = [];

	for (const entry of readdirSync(rawDataRoot).sort()) {
		const path = join(rawDataRoot, entry);
		const match = LEAGUE_FOLDER.exec(entry);

		if (!isDirectory(path) || !match) {
			v.warn(
				CODES.UNEXPECTED_ENTRY,
				`Ignoring "${entry}": not a <leagueId>-<slug> directory.`,
				{ league: "-" },
			);
			continue;
		}

		const seasons: DiscoveredSeason[] = [];
		for (const child of readdirSync(path).sort()) {
			const childPath = join(path, child);
			if (!isDirectory(childPath)) continue;
			if (!/^\d+$/.test(child)) {
				// `assets/` is a known, expected non-season directory.
				if (child !== HAND_WRITTEN.assets) {
					v.warn(CODES.UNEXPECTED_ENTRY, `Ignoring directory "${child}": not a season year.`, {
						league: entry,
					});
				}
				continue;
			}
			seasons.push({ year: Number(child), path: childPath });
		}

		seasons.sort((a, b) => a.year - b.year);

		if (seasons.length === 0) {
			v.error(CODES.NO_LEAGUE_FOLDER, `League "${entry}" contains no season folders.`, {
				league: entry,
			});
		}

		leagues.push({
			leagueId: match[1] as string,
			slug: match[2] as string,
			folderName: entry,
			path,
			seasons,
		});
	}

	if (leagues.length === 0) {
		v.error(CODES.NO_LEAGUE_FOLDER, `No league folders found under ${rawDataRoot}.`, {
			league: "-",
		});
	}

	return leagues;
}

/**
 * Checks a season folder holds exactly the ten expected files.
 * Missing is an error; extra is a warning.
 */
export function checkSeasonFiles(
	league: string,
	season: DiscoveredSeason,
	v: ValidationCollector,
): boolean {
	const present = new Set(readdirSync(season.path));
	let complete = true;

	for (const file of SEASON_FILES) {
		if (!present.has(file)) {
			v.error(CODES.MISSING_FILE, `Season ${season.year} is missing ${file}.`, {
				league,
				year: season.year,
				file,
			});
			complete = false;
		}
	}

	for (const file of present) {
		if (!SEASON_FILES.includes(file as (typeof SEASON_FILES)[number])) {
			v.warn(CODES.UNEXPECTED_FILE, `Unexpected file "${file}" in season ${season.year}.`, {
				league,
				year: season.year,
				file,
			});
		}
	}

	return complete;
}

/**
 * Reports which hand-maintained files exist. Their absence is logged at `info`
 * and never blocks the build — CLAUDE.md is explicit that missing them during
 * early stages is expected, not a data error.
 */
export function checkHandWrittenFiles(
	league: DiscoveredLeague,
	v: ValidationCollector,
): { managerAliases: boolean; leagueRules: boolean; assets: boolean } {
	const result = {
		managerAliases: existsSync(join(league.path, HAND_WRITTEN.managerAliases)),
		leagueRules: existsSync(join(league.path, HAND_WRITTEN.leagueRules)),
		assets: isDirectory(join(league.path, HAND_WRITTEN.assets)),
	};

	const notes: Array<[boolean, string, string]> = [
		[result.managerAliases, HAND_WRITTEN.managerAliases, "URL slugs stay underived until it exists"],
		[result.leagueRules, HAND_WRITTEN.leagueRules, "keeper limits and trade deadline are unavailable"],
		[result.assets, HAND_WRITTEN.assets, "avatars are not yet vendored locally"],
	];

	for (const [exists, name, consequence] of notes) {
		if (!exists) {
			v.info(
				CODES.HAND_WRITTEN_FILE_ABSENT,
				`Hand-maintained ${name} is not present; ${consequence}.`,
				{ league: league.folderName, file: name },
			);
		}
	}

	return result;
}
