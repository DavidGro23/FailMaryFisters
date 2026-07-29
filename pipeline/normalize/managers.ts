/**
 * The manager registry.
 *
 * Identity is `userId` and nothing else (D1). `teamId` is season-scoped and has
 * changed hands twice on team 5; `managerName` is not unique — two different
 * people are called "Christian" (D14).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { avatarKey, readManifest } from "../avatars.ts";
import type { RawLeague } from "../load/types.ts";
import type { Manager, ManagerId, SeasonTeam } from "../model.ts";
import { RAW_DATA_DIR } from "../paths.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";

/**
 * Builds the registry from every season, not just the one being rendered.
 *
 * This is deliberate and is the one place the slice reaches beyond its season.
 * The display name is the manager's *latest* team name (§6.5), and it is used on
 * every page including historical ones (D15) — so rendering the 2017 standings
 * must show "Saintology", not the "LarsVegasRaiders" that season's file records.
 * Deriving it from a single season would be correct for 2025 by coincidence and
 * silently wrong for six of the other eight.
 */
export function buildManagerRegistry(
	league: RawLeague,
	v: ValidationCollector,
): Map<ManagerId, Manager> {
	const managers = new Map<ManagerId, Manager>();

	// Read once. Absent manifest -> every team falls back to an initial, and the
	// build still succeeds: a fresh clone must not depend on `fetch:avatars`
	// having been run.
	const manifest = readManifest(join(RAW_DATA_DIR, league.folderName, "assets"));

	// Seasons arrive sorted ascending from the loader, so the last write of
	// `displayName` for a given userId is that manager's latest team name.
	for (const season of league.seasons) {
		for (const raw of season.managers) {
			const entry = manifest.avatars[avatarKey(season.year, raw.teamId)];
			const team: SeasonTeam = { teamId: raw.teamId, teamName: raw.teamName };
			if (entry) team.avatar = entry.file;

			const existing = managers.get(raw.userId);
			if (existing) {
				existing.displayName = raw.teamName;
				existing.teamsByYear[season.year] = team;
			} else {
				managers.set(raw.userId, {
					id: raw.userId,
					displayName: raw.teamName,
					slug: "",
					teamsByYear: { [season.year]: team },
				});
			}
		}
	}

	assignLatestAvatars(managers);
	assignSlugs(league, managers, v);
	assertDisplayNamesUnique(league.folderName, managers, v);
	reportMissingAvatars(league, managers, v);
	return managers;
}

/**
 * The newest avatar a manager ever set, which is what every page displays.
 *
 * Walks seasons newest-first and takes the first one present, rather than simply
 * reading the latest season: a manager who reverted to the platform placeholder
 * would otherwise lose an avatar they had used for years. No one in the current
 * export has done that, but the rule costs nothing and the alternative fails
 * silently if they ever do.
 */
function assignLatestAvatars(managers: Map<ManagerId, Manager>): void {
	for (const manager of managers.values()) {
		const years = Object.keys(manager.teamsByYear)
			.map(Number)
			.sort((a, b) => b - a);

		for (const year of years) {
			const avatar = manager.teamsByYear[year]?.avatar;
			if (avatar !== undefined) {
				manager.latestAvatar = avatar;
				break;
			}
		}
	}
}

interface ManagerAlias {
	userId: string;
	slug: string;
	displayNameOverride?: string;
	retiredSlugs?: string[];
}

/**
 * Slugs are frozen, never derived on the fly (§6.5, D16).
 *
 * A slug derived from the team name would change the moment someone renames,
 * breaking every link already shared in the group chat — Benjamin's rename
 * would have 404'd `/managers/larsvegasraiders/`. So the alias file is the
 * source of truth, and a manager missing from it gets a derived slug plus a
 * warning naming them, so it can be frozen deliberately before anything is
 * shared rather than silently becoming permanent.
 */
function assignSlugs(
	league: RawLeague,
	managers: Map<ManagerId, Manager>,
	v: ValidationCollector,
): void {
	const path = join(RAW_DATA_DIR, league.folderName, "manager-aliases.json");
	const frozen = new Map<string, ManagerAlias>();

	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as ManagerAlias[];
			for (const alias of parsed) frozen.set(alias.userId, alias);
		} catch (err) {
			v.error(
				CODES.MALFORMED_FIELD,
				`manager-aliases.json could not be parsed: ${(err as Error).message}`,
				{ league: league.folderName, file: "manager-aliases.json" },
			);
		}
	}

	for (const manager of managers.values()) {
		const alias = frozen.get(manager.id);
		if (alias) {
			manager.slug = alias.slug;
			if (alias.displayNameOverride !== undefined) manager.displayName = alias.displayNameOverride;
			continue;
		}

		manager.slug = slugify(manager.displayName);
		v.warn(
			CODES.SLUG_NOT_FROZEN,
			`Manager ${manager.id} ("${manager.displayName}") has no entry in manager-aliases.json; ` +
				`using the derived slug "${manager.slug}". Freeze it there before sharing any link to it.`,
			{ league: league.folderName, file: "manager-aliases.json" },
		);
	}

	assertSlugsUnique(league.folderName, managers, v);
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Two managers sharing a slug would make one page unreachable. */
function assertSlugsUnique(
	league: string,
	managers: Map<ManagerId, Manager>,
	v: ValidationCollector,
): void {
	const bySlug = new Map<string, ManagerId[]>();
	for (const manager of managers.values()) {
		const ids = bySlug.get(manager.slug);
		if (ids) ids.push(manager.id);
		else bySlug.set(manager.slug, [manager.id]);
	}

	for (const [slug, ids] of [...bySlug].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		if (slug === "") {
			v.error(CODES.DISPLAY_NAME_COLLISION, `Manager(s) ${ids.join(", ")} resolved to an empty slug.`, {
				league,
			});
		} else if (ids.length > 1) {
			v.error(
				CODES.DISPLAY_NAME_COLLISION,
				`Slug "${slug}" resolves to ${ids.length} managers (${ids.join(", ")}). Slugs must be unique.`,
				{ league },
			);
		}
	}
}

/**
 * An absent avatar is normal, not a defect — 25 of 90 records use NFL's generic
 * placeholder, and one asset (the 2018 Raiders logo) has since 404'd. Reported
 * at `info` so `/about/` can be honest about it without implying a problem.
 */
function reportMissingAvatars(
	league: RawLeague,
	managers: Map<ManagerId, Manager>,
	v: ValidationCollector,
): void {
	let missing = 0;
	for (const manager of managers.values()) {
		for (const team of Object.values(manager.teamsByYear)) {
			if (team.avatar === undefined) missing++;
		}
	}
	if (missing > 0) {
		v.info(
			CODES.AVATAR_MISSING,
			`${missing} of 90 team-seasons have no vendored avatar; those render as an initial.`,
			{ league: league.folderName, file: "assets/avatars.json" },
		);
	}
}

/**
 * A display-name collision is a build failure, never an auto-numbered fallback
 * (§6.5, D14): two managers sharing a name would render as two identical rows
 * with no way for a reader to tell them apart.
 */
function assertDisplayNamesUnique(
	league: string,
	managers: Map<ManagerId, Manager>,
	v: ValidationCollector,
): void {
	const byName = new Map<string, ManagerId[]>();
	for (const manager of managers.values()) {
		const ids = byName.get(manager.displayName);
		if (ids) ids.push(manager.id);
		else byName.set(manager.displayName, [manager.id]);
	}

	for (const [name, ids] of [...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		if (ids.length > 1) {
			v.error(
				CODES.DISPLAY_NAME_COLLISION,
				`Display name ${JSON.stringify(name)} resolves to ${ids.length} managers (${ids.join(", ")}). ` +
					`Display names must be unique; resolve it with a displayNameOverride in manager-aliases.json.`,
				{ league },
			);
		}
	}
}

/**
 * Resolves a season's `(year, teamId)` pairs to manager ids. An unresolvable
 * pair is a build failure (D1) — joining on `teamId` alone silently merges
 * different people's careers.
 */
export function resolveTeamsToManagers(
	league: RawLeague,
	year: number,
	v: ValidationCollector,
): Map<string, ManagerId> {
	const season = league.seasons.find((s) => s.year === year);
	const byTeamId = new Map<string, ManagerId>();
	if (!season) return byTeamId;

	for (const raw of season.managers) {
		byTeamId.set(raw.teamId, raw.userId);
	}

	// Stage 1 already proved every teamId reference inside a season resolves, so
	// this is a guard against a future export shape rather than a live risk.
	if (byTeamId.size !== season.managers.length) {
		v.error(CODES.UNRESOLVED_MANAGER, `Season ${year} has duplicate teamIds in its managers file.`, {
			league: league.folderName,
			year,
			file: "managers-history.json",
		});
	}

	return byTeamId;
}
