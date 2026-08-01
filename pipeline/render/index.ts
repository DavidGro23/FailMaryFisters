/**
 * Stage 4 — render. Canonical data in, files on disk out.
 * Contains no arithmetic beyond formatting.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AllTimeTable } from "../aggregate/all-time.ts";
import type { SeasonDraftView } from "../aggregate/drafts.ts";
import type { FuturePicksView } from "../aggregate/draft-picks.ts";
import type { SeasonKeeperView } from "../aggregate/keepers.ts";
import type { LandingView } from "../aggregate/landing.ts";
import type { ManagerProfile } from "../aggregate/manager-profile.ts";
import type { BracketView } from "../aggregate/playoffs.ts";
import type { StandingsTable } from "../aggregate/standings.ts";
import { AVATAR_MANIFEST } from "../avatars.ts";
import { rulebookDir, type Rulebook } from "../normalize/rulebook.ts";
import { OUTPUT_DIR, RAW_DATA_DIR, REPO_ROOT } from "../paths.ts";
import { renderAllTimePage } from "./all-time-page.ts";
import { CUSTOM_DOMAIN } from "./base-path.ts";
import { renderDraftPage } from "./draft-page.ts";
import { renderKeeperPage } from "./keeper-page.ts";
import { renderLandingPage } from "./landing-page.ts";
import { renderManagerPage } from "./manager-page.ts";
import {
	DEFAULT_MANAGER_SLUG,
	DEFAULT_SEASON,
	DRAFTS_INDEX_ROUTE,
	draftRoute,
	keeperRoute,
	LEGACY_TEAMS_INDEX_ROUTE,
	legacyManagerRoute,
	managerRoute,
	ROUTES,
	seasonRoute,
	TEAMS_INDEX_ROUTE,
} from "./nav.ts";
import { renderRedirect } from "./redirect.ts";
import { renderRulebookPage } from "./rulebook-page.ts";
import { renderStandingsPage } from "./standings-page.ts";

/** Emitted as `<route>/index.html` so URLs need no extension (§13.3). */
function writePage(route: string, contents: string): string {
	const clean = route.replace(/\/+$/, "");
	const dir = join(OUTPUT_DIR, clean);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "index.html"), contents, "utf8");
	// The site root is the empty route, which would otherwise read "/index.html".
	return clean === "" ? "index.html" : `${clean}/index.html`;
}

/**
 * Copies vendored avatars into `docs/`. Reads only committed local files — the
 * build never touches the network (rule 19). If `fetch:avatars` has not been
 * run, there is nothing to copy and every team renders its initial instead.
 */
function copyAvatars(league: string, assets: string): number {
	const source = join(RAW_DATA_DIR, league, "assets");
	if (!existsSync(source)) return 0;

	const target = join(assets, "avatars");
	mkdirSync(target, { recursive: true });

	let copied = 0;
	for (const file of readdirSync(source).sort()) {
		if (file === AVATAR_MANIFEST) continue;
		copyFileSync(join(source, file), join(target, file));
		copied++;
	}
	return copied;
}

/**
 * Copies the rulebook's own assets — the diagram, and the source PDF as
 * `rulebook.pdf` so the page can offer the authoritative original alongside the
 * transcription.
 */
function copyRulebookAssets(league: string, assets: string): number {
	const source = rulebookDir(league);
	if (!existsSync(source)) return 0;

	const target = join(assets, "rulebook");
	mkdirSync(target, { recursive: true });

	let copied = 0;
	for (const file of readdirSync(source).sort()) {
		// The transcription itself is build input, not a published asset.
		if (file.endsWith(".json")) continue;
		copyFileSync(join(source, file), join(target, file));
		copied++;
	}

	const pdf = join(REPO_ROOT, "Rulebook", "FailMaryFisters_Rulebook_v3.pdf");
	if (existsSync(pdf)) {
		copyFileSync(pdf, join(target, "rulebook.pdf"));
		copied++;
	}

	return copied;
}

export function renderSite(
	seasons: readonly StandingsTable[],
	brackets: ReadonlyMap<number, BracketView>,
	allTime: AllTimeTable,
	profiles: readonly ManagerProfile[],
	drafts: readonly SeasonDraftView[],
	keepers: SeasonKeeperView | null,
	futurePicks: FuturePicksView | null,
	landing: LandingView,
	rulebook: Rulebook | null,
	league: string,
): string[] {
	const written: string[] = [];
	const years = seasons.map((s) => s.year);

	written.push(writePage(ROUTES.home, renderLandingPage(landing, profiles)));

	// Routes come from the nav so a link and the page it points at cannot drift.
	for (const season of seasons) {
		const page = renderStandingsPage(season, years, brackets.get(season.year));
		written.push(writePage(seasonRoute(season.year), page));
	}
	written.push(writePage(ROUTES.allTime, renderAllTimePage(allTime)));
	written.push(writePage(ROUTES.rulebook, renderRulebookPage(rulebook)));

	// One page per (season, team), plus a per-season landing spot that redirects
	// to whichever team held the first pick.
	const draftYears = drafts.map((d) => d.year);
	for (const draft of drafts) {
		for (const team of draft.teams) {
			written.push(
				writePage(draftRoute(draft.year, team.slug), renderDraftPage(draft, team, draftYears)),
			);
		}
		const first = draft.teams[0];
		if (first) {
			written.push(
				writePage(
					draftRoute(draft.year),
					renderRedirect(draftRoute(draft.year, first.slug), `${draft.year} draft`),
				),
			);
		}
	}

	const defaultDraft = drafts.find((d) => d.year === DEFAULT_SEASON) ?? drafts[drafts.length - 1];
	if (defaultDraft) {
		written.push(
			writePage(
				DRAFTS_INDEX_ROUTE,
				renderRedirect(draftRoute(defaultDraft.year), `${defaultDraft.year} draft`),
			),
		);
	}

	// Keeper values: one page per team, plus a bare `/keepers/` that redirects to
	// the first. Unlike drafts there is no year in the URL — the values only ever
	// apply to the season about to start.
	if (keepers) {
		for (const team of keepers.teams) {
			written.push(
				writePage(
					keeperRoute(team.slug),
					renderKeeperPage(keepers, team, futurePicks?.teams.find((t) => t.managerId === team.managerId) ?? null),
				),
			);
		}
		const first = keepers.teams[0];
		if (first) {
			written.push(
				writePage(keeperRoute(), renderRedirect(keeperRoute(first.slug), String(keepers.keeperYear))),
			);
		}
	}

	for (const profile of profiles) {
		written.push(writePage(managerRoute(profile.slug), renderManagerPage(profile, profiles)));
	}

	// There is no team index: the nav opens a profile directly. Bare `/teams/`
	// stays valid by redirecting to the default one.
	const target = profiles.find((p) => p.slug === DEFAULT_MANAGER_SLUG) ?? profiles[0];
	if (target) {
		const home = managerRoute(target.slug);
		written.push(writePage(TEAMS_INDEX_ROUTE, renderRedirect(home, target.displayName)));

		// These pages lived under /managers/ until the section was renamed to
		// Teams. Redirecting rather than deleting is the same courtesy §6.5
		// requires for retired slugs: a URL that once worked keeps working.
		written.push(writePage(LEGACY_TEAMS_INDEX_ROUTE, renderRedirect(home, target.displayName)));
		for (const profile of profiles) {
			written.push(
				writePage(
					legacyManagerRoute(profile.slug),
					renderRedirect(managerRoute(profile.slug), profile.displayName),
				),
			);
		}
	}

	const assets = join(OUTPUT_DIR, "assets");
	mkdirSync(assets, { recursive: true });
	copyFileSync(join(REPO_ROOT, "src", "styles", "site.css"), join(assets, "site.css"));
	written.push("assets/site.css");

	const avatars = copyAvatars(league, assets);
	if (avatars > 0) written.push(`assets/avatars/ (${avatars} files)`);

	const rulebookFiles = copyRulebookAssets(league, assets);
	if (rulebookFiles > 0) written.push(`assets/rulebook/ (${rulebookFiles} files)`);

	// Public because it needs no login, not because it wants an audience (§13.2).
	writeFileSync(join(OUTPUT_DIR, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");
	written.push("robots.txt");

	// Tells GitHub Pages which host to answer on. Emitted every build because
	// `docs/` is generated — see CUSTOM_DOMAIN (§13.2).
	writeFileSync(join(OUTPUT_DIR, "CNAME"), `${CUSTOM_DOMAIN}\n`, "utf8");
	written.push("CNAME");

	return written;
}
