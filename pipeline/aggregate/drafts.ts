/**
 * Draft boards, one per (season, team). Pure functions, no I/O.
 *
 * A team's picks are listed in draft order. That is not the same as "one row per
 * round": picks are traded, so from 2019 onward a team routinely holds two picks
 * in one round and none in another. The round is shown per row rather than being
 * the row's identity.
 */

import type { Manager, ManagerId, SeasonDraft, Year } from "../model.ts";

export interface DraftPickRow {
	round: number;
	overall: number;
	playerName: string;
	/** Set when this is a second (or later) pick in the same round. */
	extraInRound: boolean;
}

export interface DraftTeam {
	managerId: ManagerId;
	displayName: string;
	slug: string;
	avatar?: string;
	/** Overall number of this team's earliest pick, which orders the switcher. */
	firstPick: number;
	picks: DraftPickRow[];
}

export interface SeasonDraftView {
	year: Year;
	rounds: number;
	totalPicks: number;
	/** In draft order — the team holding the earliest pick first. */
	teams: DraftTeam[];
}

export function buildDraftViews(
	drafts: ReadonlyMap<Year, SeasonDraft>,
	managers: ReadonlyMap<ManagerId, Manager>,
): SeasonDraftView[] {
	const views: SeasonDraftView[] = [];

	for (const [year, draft] of [...drafts].sort(([a], [b]) => a - b)) {
		const byManager = new Map<ManagerId, DraftPickRow[]>();

		// Picks arrive in overall order from normalize, so each team's list comes
		// out in draft order without re-sorting.
		for (const pick of draft.picks) {
			const rows = byManager.get(pick.managerId);
			const row: DraftPickRow = {
				round: pick.round,
				overall: pick.overall,
				playerName: pick.playerName,
				// Flagged so the page can show that this round was doubled up —
				// evidence of a trade rather than a rendering mistake.
				extraInRound: (rows ?? []).some((r) => r.round === pick.round),
			};
			if (rows) rows.push(row);
			else byManager.set(pick.managerId, [row]);
		}

		const teams: DraftTeam[] = [];
		for (const [managerId, picks] of byManager) {
			const manager = managers.get(managerId);
			const team: DraftTeam = {
				managerId,
				displayName: manager?.displayName ?? `Unknown manager (${managerId})`,
				slug: manager?.slug ?? managerId,
				firstPick: picks[0]?.overall ?? Number.MAX_SAFE_INTEGER,
				picks,
			};
			if (manager?.latestAvatar !== undefined) team.avatar = manager.latestAvatar;
			teams.push(team);
		}

		// Draft order: the team that picked first is listed first, which also makes
		// it the page's default team.
		teams.sort((a, b) => a.firstPick - b.firstPick);

		views.push({ year, rounds: draft.rounds, totalPicks: draft.picks.length, teams });
	}

	return views;
}
