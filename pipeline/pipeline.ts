/**
 * The shared front half of the pipeline: load -> normalize -> aggregate.
 *
 * `build:data` stops here; `build` continues into render. Both go through this
 * function so the two commands can never disagree about the data they describe.
 */

import { buildAllTimeTable, type AllTimeTable } from "./aggregate/all-time.ts";
import { buildDraftViews, type SeasonDraftView } from "./aggregate/drafts.ts";
import { buildFuturePicks, type FuturePicksView } from "./aggregate/draft-picks.ts";
import { buildKeeperView, type SeasonKeeperView } from "./aggregate/keepers.ts";
import { buildLandingView, type LandingView } from "./aggregate/landing.ts";
import type { Rulebook } from "./normalize/rulebook.ts";
import { buildManagerProfiles, type ManagerProfile } from "./aggregate/manager-profile.ts";
import { buildBracketView, type BracketView } from "./aggregate/playoffs.ts";
import { buildStandingsTable, type StandingsTable } from "./aggregate/standings.ts";
import { loadRawData } from "./load/index.ts";
import { buildReport, type ValidationIssue, type ValidationReport } from "./load/validation.ts";
import { normalizeLeague } from "./normalize/index.ts";
import { DEFAULT_SEASON } from "./render/nav.ts";
import { RAW_DATA_DIR } from "./paths.ts";

/** The season the nav links to; every season still gets its own page. */
export const TARGET_YEAR = DEFAULT_SEASON;

export interface PipelineResult {
	/** Every season, ascending by year. The nav's default season is one of these. */
	seasons: StandingsTable[];
	/** Championship brackets, keyed by year. Absent if a season has none. */
	brackets: Map<number, BracketView>;
	allTime: AllTimeTable | null;
	/** One per manager, in all-time table order. */
	profiles: ManagerProfile[];
	drafts: SeasonDraftView[];
	/** Keeper values for the latest season, or null if it has no draft. */
	keepers: SeasonKeeperView | null;
	/** Who holds which pick in the upcoming draft, reconstructed from trades. */
	futurePicks: FuturePicksView | null;
	landing: LandingView | null;
	rulebook: Rulebook | null;
	validation: ValidationReport;
	ok: boolean;
	/** Folder name of the league that was rendered, for locating its assets. */
	leagueFolder: string | null;
	leagueCount: number;
	seasonCount: number;
}

export function runPipeline(): PipelineResult {
	const load = loadRawData(RAW_DATA_DIR);
	const issues: ValidationIssue[] = [...load.validation.issues];

	// One league in practice; the loader is generic, so take the first and let a
	// second one wait until there is a page that can show two.
	const league = load.leagues[0];
	const seasons: StandingsTable[] = [];
	const brackets = new Map<number, BracketView>();
	let allTime: AllTimeTable | null = null;
	let profiles: ManagerProfile[] = [];
	let drafts: SeasonDraftView[] = [];
	let keepers: SeasonKeeperView | null = null;
	let futurePicks: FuturePicksView | null = null;
	let landing: LandingView | null = null;
	let rulebook: Rulebook | null = null;
	let ok = load.ok;

	if (league) {
		const result = normalizeLeague(league);
		issues.push(...result.issues);
		ok = ok && result.ok;

		if (result.normalized) {
			const { managers, playoffs } = result.normalized;
			for (const season of result.normalized.seasons) {
				seasons.push(buildStandingsTable(season, managers));
				const bracket = playoffs.get(season.year);
				if (bracket) {
					brackets.set(season.year, buildBracketView(season.year, bracket, managers, season.year));
				}
			}
			allTime = buildAllTimeTable(result.normalized.seasons, managers);
			profiles = buildManagerProfiles({
				managers,
				seasons: result.normalized.seasons,
				playoffs,
				games: result.normalized.games,
				playerGames: result.normalized.playerGames,
				trades: result.normalized.trades,
				allTime,
			});
			// Pass the normalized standings, not just the years: the season point
			// records need each team's per-season totals.
			landing = buildLandingView(
				profiles,
				result.normalized.seasons,
				result.normalized.playerGames,
				// Streak records need every regular-season game in order, which the
				// per-season standings cannot express.
				result.normalized.games,
			);
			drafts = buildDraftViews(result.normalized.drafts, managers);

			// Keeper values apply to the season about to start, so they are always
			// computed from the latest season on file — never a hardcoded year.
			const latest = result.normalized.seasons.at(-1);
			if (latest) {
				keepers = buildKeeperView({
					rosters: result.normalized.rosters,
					drafts: result.normalized.drafts,
					managers,
					acquisitions: result.normalized.acquisitions,
					year: latest.year,
				});

				// Same target season as the keeper values: the draft about to happen.
				futurePicks = buildFuturePicks(
					result.normalized.trades,
					managers,
					latest.rows.map((r) => r.managerId),
					latest.year + 1,
				);
			}

			rulebook = result.normalized.rulebook;
		}
	} else {
		ok = false;
	}

	return {
		seasons,
		brackets,
		allTime,
		profiles,
		drafts,
		keepers,
		futurePicks,
		landing,
		rulebook,
		validation: buildReport(issues),
		ok,
		leagueFolder: league?.folderName ?? null,
		leagueCount: load.leagues.length,
		seasonCount: league?.seasons.length ?? 0,
	};
}
