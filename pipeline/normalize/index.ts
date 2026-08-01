/**
 * Stage 2 — normalize. Raw export in, canonical model out.
 *
 * This stage absorbs per-year weirdness so that stages 3 and 4 never need a
 * year-specific branch. It knows nothing about pages or HTML.
 */

import type { RawLeague } from "../load/types.ts";
import type {
	Manager,
	ManagerId,
	PlayerGame,
	PlayoffBracket,
	RosterEntry,
	SeasonStandings,
	SeasonDraft,
	TeamGame,
	Trade,
	Year,
} from "../model.ts";
import { ValidationCollector, type ValidationIssue } from "../load/validation.ts";
import { loadAcquisitions, type Acquisitions } from "./acquisitions.ts";
import { normalizeDraft } from "./drafts.ts";
import { normalizeGames } from "./games.ts";
import { buildManagerRegistry, resolveTeamsToManagers } from "./managers.ts";
import { buildPlayerRegistry, normalizePlayerGames } from "./players.ts";
import { normalizePlayoffs } from "./playoffs.ts";
import { normalizeRosters } from "./rosters.ts";
import { loadRulebook, type Rulebook } from "./rulebook.ts";
import { normalizeStandings } from "./standings.ts";
import { normalizeTrades } from "./trades.ts";

export interface NormalizedLeague {
	league: string;
	managers: Map<ManagerId, Manager>;
	/** Every season that normalized cleanly, ascending by year. */
	seasons: SeasonStandings[];
	/**
	 * Championship brackets, keyed by year. Kept beside the standings rather than
	 * inside them so the standings and all-time aggregates stay untouched.
	 */
	playoffs: Map<Year, PlayoffBracket>;
	/** Every game from both sides, classified regular or postseason. */
	games: TeamGame[];
	/** Every player appearance, scores already sign-corrected (D17). */
	playerGames: PlayerGame[];
	trades: Trade[];
	/** One per season, keyed by year. */
	drafts: Map<Year, SeasonDraft>;
	/** Every team's roster as the season ended, including IR. */
	rosters: RosterEntry[];
	/**
	 * How undrafted players were acquired, per season. Empty when the
	 * hand-maintained file is absent — the export does not carry this (D21).
	 */
	acquisitions: Acquisitions;
	/** The league's own rulebook, or null if it has not been transcribed. */
	rulebook: Rulebook | null;
}

export interface NormalizeResult {
	normalized: NormalizedLeague | null;
	issues: ValidationIssue[];
	ok: boolean;
}

export function normalizeLeague(league: RawLeague): NormalizeResult {
	const v = new ValidationCollector("normalize");

	const managers = buildManagerRegistry(league, v);
	const players = buildPlayerRegistry(league.players);
	const rulebook = loadRulebook(league, v);
	const acquisitions = loadAcquisitions(league, v);

	const seasons: SeasonStandings[] = [];
	const playoffs = new Map<Year, PlayoffBracket>();
	const games: TeamGame[] = [];
	const playerGames: PlayerGame[] = [];
	const trades: Trade[] = [];
	const drafts = new Map<Year, SeasonDraft>();
	const rosters: RosterEntry[] = [];

	for (const raw of league.seasons) {
		const teamToManager = resolveTeamsToManagers(league, raw.year, v);

		const standings = normalizeStandings(league, raw.year, teamToManager, v);
		if (standings) seasons.push(standings);

		const bracket = normalizePlayoffs(league, raw, teamToManager, v);
		if (bracket) playoffs.set(raw.year, bracket);

		games.push(...normalizeGames(league, raw, teamToManager, v));
		playerGames.push(...normalizePlayerGames(league, raw, teamToManager, players, v));
		trades.push(...normalizeTrades(league, raw, teamToManager, players, v));
		rosters.push(...normalizeRosters(league, raw, teamToManager, players, v));

		const draft = normalizeDraft(league, raw, teamToManager, players, v);
		if (draft) drafts.set(raw.year, draft);
	}

	const ok = v.errorCount === 0 && seasons.length === league.seasons.length;

	return {
		normalized: {
			league: league.folderName,
			managers,
			seasons,
			playoffs,
			games,
			playerGames,
			trades,
			drafts,
			rosters,
			acquisitions,
			rulebook,
		},
		issues: v.issues,
		ok,
	};
}

/** Picks one season out of an already-normalized league. */
export function seasonOf(normalized: NormalizedLeague, year: Year): SeasonStandings | undefined {
	return normalized.seasons.find((s) => s.year === year);
}
