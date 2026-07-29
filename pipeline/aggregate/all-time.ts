/**
 * All-time regular-season table. Pure functions, no I/O.
 *
 * **How the regular season is filtered: it is not.** Every figure is summed from
 * the per-season `regular-season-standings-history.json` rows, which contain
 * regular-season results and nothing else. No game is filtered by week, so the
 * fact that 2018-2020 ran 14 weeks (making week 15 a *playoff* week in those
 * years) cannot corrupt the totals. A `week <= 15` filter would have pulled
 * three seasons of playoff games in silently.
 *
 * Identity is `userId`. Twelve players have managed across nine ten-team
 * seasons, because `teamId` 5 changed hands twice — so this table has twelve
 * rows, and each player's totals cover only the seasons they actually managed.
 *
 * Rows are emitted in the default order (see `compareRows`). Client-side sorting
 * reorders the rendered table but never changes what the server emits, so the
 * page is correct and fully ordered with JavaScript disabled (NFR-7).
 */

import type { Manager, ManagerId, SeasonStandings, SeasonTeam, Year } from "../model.ts";
import { winPercentage } from "./standings.ts";

export interface AllTimeRow {
	rank: number;
	managerId: ManagerId;
	displayName: string;
	/** From the latest season this player managed, not the latest season overall. */
	avatar?: string;
	seasonsPlayed: number;
	firstYear: Year;
	lastYear: Year;
	wins: number;
	losses: number;
	draws: number;
	games: number;
	pointsFor: number;
	pointsAgainst: number;
	/** Career `pointsFor / games` — never the mean of per-season PPGs. */
	pointsPerGame: number;
	winPct: number;
}

export interface AllTimeTable {
	rows: AllTimeRow[];
	seasonsCovered: Year[];
}

interface Career {
	managerId: ManagerId;
	years: Year[];
	wins: number;
	losses: number;
	draws: number;
	pointsFor: number;
	pointsAgainst: number;
}

export function buildAllTimeTable(
	seasons: readonly SeasonStandings[],
	managers: ReadonlyMap<ManagerId, Manager>,
): AllTimeTable {
	const careers = new Map<ManagerId, Career>();

	for (const season of seasons) {
		for (const row of season.rows) {
			let career = careers.get(row.managerId);
			if (!career) {
				career = {
					managerId: row.managerId,
					years: [],
					wins: 0,
					losses: 0,
					draws: 0,
					pointsFor: 0,
					pointsAgainst: 0,
				};
				careers.set(row.managerId, career);
			}
			career.years.push(season.year);
			career.wins += row.wins;
			career.losses += row.losses;
			career.draws += row.draws;
			career.pointsFor += row.pointsFor;
			career.pointsAgainst += row.pointsAgainst;
		}
	}

	const rows = [...careers.values()]
		.map((career): Omit<AllTimeRow, "rank"> => {
			const games = career.wins + career.losses + career.draws;
			const manager = managers.get(career.managerId);
			const years = [...career.years].sort((a, b) => a - b);
			const firstYear = years[0] ?? 0;
			const lastYear = years[years.length - 1] ?? 0;

			const row: Omit<AllTimeRow, "rank"> = {
				managerId: career.managerId,
				// The canonical display name is already the latest team name (§6.5),
				// which for a player who left is the last name *they* used.
				displayName: manager?.displayName ?? `Unknown manager (${career.managerId})`,
				seasonsPlayed: years.length,
				firstYear,
				lastYear,
				wins: career.wins,
				losses: career.losses,
				draws: career.draws,
				games,
				pointsFor: career.pointsFor,
				pointsAgainst: career.pointsAgainst,
				// Recomputed from career totals. Averaging per-season PPGs would
				// weight a 14-game season equally with a 15-game one and give a
				// different answer for 11 of the 12 players.
				pointsPerGame: games === 0 ? 0 : career.pointsFor / games,
				winPct: winPercentage(career.wins, career.losses, career.draws),
			};

			if (manager?.latestAvatar !== undefined) row.avatar = manager.latestAvatar;

			return row;
		})
		.sort(compareRows)
		.map((row, index): AllTimeRow => ({ rank: index + 1, ...row }));

	return {
		rows,
		seasonsCovered: seasons.map((s) => s.year).sort((a, b) => a - b),
	};
}

/**
 * Default order: most wins first, then most points for.
 *
 * 1. **wins, descending** — the requested primary ordering.
 * 2. **points for, descending** — the requested tie-break. Two managers are tied
 *    on 66 wins and two more on 60, so this fires on real data.
 * 3. **display name** — guarantees a total order, so the build stays
 *    deterministic (NFR-9) rather than depending on input ordering.
 *
 * Note this ranks by a raw count, not a rate, so a long career outranks a short
 * strong one: the single-season manager sits last on 8 wins despite the best
 * win percentage in the league. That is what the seasons column is for, and
 * readers who want the rate can sort by Win % in the browser.
 */
function compareRows(a: Omit<AllTimeRow, "rank">, b: Omit<AllTimeRow, "rank">): number {
	return (
		b.wins - a.wins ||
		b.pointsFor - a.pointsFor ||
		(a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0)
	);
}
