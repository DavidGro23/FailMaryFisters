/**
 * Stage 3 — aggregate. Pure functions over the canonical model, plain data out.
 * No file I/O, no formatting, no HTML.
 *
 * This file computes; it does not decide how anything looks. Number formatting
 * belongs to the render stage.
 */

import type { Manager, ManagerId, SeasonStandings } from "../model.ts";

export interface StandingsTableRow {
	overallRank: number;
	managerId: ManagerId;
	displayName: string;
	/** The season's own team name, present only when it differs from `displayName`. */
	playedAs?: string;
	/**
	 * Vendored avatar file name, or absent. Carried through untouched — choosing
	 * what to show when it is absent is a presentation decision, not this stage's.
	 */
	avatar?: string;
	wins: number;
	losses: number;
	draws: number;
	games: number;
	pointsFor: number;
	pointsAgainst: number;
	/** `pointsFor / games` — the primary cross-season metric (rule 8). */
	pointsPerGame: number;
	/** `(W + 0.5·D) / G` — never `W / (W + L)` (D9). */
	winPct: number;
}

export interface StandingsTable {
	year: number;
	regularSeasonWeeks: number;
	rows: StandingsTableRow[];
}

/**
 * Builds the display rows.
 *
 * Row order is taken from `overallRank` exactly as the league recorded it and is
 * never recomputed (§13.3). The league's tiebreak is not documented anywhere and
 * demonstrably is not "most points for" — in 2017 the rank-1 team scored fewer
 * points than the rank-2 team.
 */
export function buildStandingsTable(
	standings: SeasonStandings,
	managers: ReadonlyMap<ManagerId, Manager>,
): StandingsTable {
	// Ordering by `overallRank` here — rather than trusting the caller — is what
	// makes "never re-sort standings" executable in the layer that has tests.
	// The only legitimate order is the league's own.
	const ordered = [...standings.rows].sort((a, b) => a.overallRank - b.overallRank);

	const rows = ordered.map((row): StandingsTableRow => {
		const manager = managers.get(row.managerId);
		const displayName = manager?.displayName ?? `Unknown manager (${row.managerId})`;
		const seasonTeam = manager?.teamsByYear[standings.year];
		const seasonName = seasonTeam?.teamName;
		const games = row.wins + row.losses + row.draws;

		const result: StandingsTableRow = {
			overallRank: row.overallRank,
			managerId: row.managerId,
			displayName,
			wins: row.wins,
			losses: row.losses,
			draws: row.draws,
			games,
			pointsFor: row.pointsFor,
			pointsAgainst: row.pointsAgainst,
			pointsPerGame: games === 0 ? 0 : row.pointsFor / games,
			winPct: winPercentage(row.wins, row.losses, row.draws),
		};

		// D15: the canonical name is primary everywhere; the per-season name is
		// carried only where it differs, for muted secondary text.
		if (seasonName !== undefined && seasonName !== displayName) {
			result.playedAs = seasonName;
		}

		// The manager's latest avatar, not this season's. Early seasons are sparse
		// — only 4 of 10 managers had one in 2017 — and people expect the picture
		// they use now, the same way the canonical name is used everywhere (D15).
		if (manager?.latestAvatar !== undefined) {
			result.avatar = manager.latestAvatar;
		}

		return result;
	});

	return { year: standings.year, regularSeasonWeeks: standings.regularSeasonWeeks, rows };
}

/** D9: a draw counts as half a win. Ties exist — 2019 had one. */
export function winPercentage(wins: number, losses: number, draws: number): number {
	const games = wins + losses + draws;
	if (games === 0) return 0;
	return (wins + 0.5 * draws) / games;
}
