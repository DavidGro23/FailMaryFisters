/**
 * Who holds which pick in the *upcoming* draft. Pure functions, no I/O.
 *
 * The draft has not happened, so this is reconstructed from trades rather than
 * read from a draft file: every team starts with its own 15 picks, and each
 * traded-pick leg moves one.
 *
 * **The export identifies a traded pick only by `{year, round}` — never by whose
 * pick it originally was.** So ownership has to be replayed in date order, and
 * where a team holds more than one pick of a round it is assumed to give up its
 * own first. Measured on the 2026 picks: 22 legs, **zero** cases where that
 * choice was ambiguous, and all ten teams finish with exactly 15 picks, which is
 * the rulebook's own invariant (§6.4.2) and serves as a checksum. `unbalanced`
 * carries any team that misses it so the page can stop asserting something the
 * data does not support.
 *
 * **No overall pick numbers.** Round is all that is known: the draft order comes
 * from a lottery that has not been held (rulebook §4.4), so a 1-150 pick number
 * would be invented.
 */

import type { Manager, ManagerId, Trade, Year } from "../model.ts";

export interface PickRow {
	round: number;
	/** Whose pick this originally was. Equal to the holder for an untraded pick. */
	originalOwnerId: ManagerId;
	originalOwnerName: string;
	/** True when the holder is the original owner — the common case. */
	own: boolean;
}

export interface PickTeam {
	managerId: ManagerId;
	displayName: string;
	slug: string;
	picks: PickRow[];
	/** Picks acquired from another team. */
	acquired: number;
	/** Own picks now held by someone else. */
	tradedAway: number;
}

export interface FuturePicksView {
	year: Year;
	teams: PickTeam[];
	/** Teams not holding exactly `rounds` picks. Empty in the measured data. */
	unbalanced: string[];
	rounds: number;
}

const ROUNDS = 15;

export function buildFuturePicks(
	trades: readonly Trade[],
	managers: ReadonlyMap<ManagerId, Manager>,
	teamIds: readonly ManagerId[],
	year: Year,
): FuturePicksView | null {
	if (teamIds.length === 0) return null;

	const nameOf = (id: ManagerId): string =>
		managers.get(id)?.displayName ?? `Unknown manager (${id})`;

	// key: `${originalOwnerId}|${round}` -> current holder
	const holder = new Map<string, ManagerId>();
	for (const id of teamIds) {
		for (let round = 1; round <= ROUNDS; round++) holder.set(`${id}|${round}`, id);
	}

	// Replayed oldest-first: a pick can change hands twice in a season, and only
	// the order distinguishes "sent its own" from "sent one it had just acquired".
	const legs: Array<{ date: string; fromId: ManagerId; toId: ManagerId; round: number }> = [];
	for (const trade of trades) {
		for (const leg of trade.legs) {
			for (const item of leg.items) {
				if (item.kind !== "pick" || item.year !== year) continue;
				legs.push({ date: trade.date, fromId: leg.fromId, toId: leg.toId, round: item.round });
			}
		}
	}
	legs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

	for (const leg of legs) {
		const held = [...holder].filter(
			([key, current]) => current === leg.fromId && key.endsWith(`|${leg.round}`),
		);
		// A team sending a pick it does not hold means the trade log and this
		// reconstruction disagree; skipping keeps the totals honest rather than
		// inventing a pick.
		if (held.length === 0) continue;

		const own = held.find(([key]) => key.startsWith(`${leg.fromId}|`)) ?? held[0];
		if (own) holder.set(own[0], leg.toId);
	}

	const byTeam = new Map<ManagerId, PickRow[]>();
	for (const id of teamIds) byTeam.set(id, []);

	for (const [key, current] of holder) {
		const [originalOwnerId, roundText] = key.split("|");
		if (originalOwnerId === undefined || roundText === undefined) continue;

		byTeam.get(current)?.push({
			round: Number(roundText),
			originalOwnerId,
			originalOwnerName: nameOf(originalOwnerId),
			own: originalOwnerId === current,
		});
	}

	const teams: PickTeam[] = [];
	const unbalanced: string[] = [];

	for (const id of teamIds) {
		const picks = (byTeam.get(id) ?? []).sort(
			(a, b) =>
				a.round - b.round ||
				// Own pick first within a round, then by name so the order is total.
				Number(b.own) - Number(a.own) ||
				(a.originalOwnerName < b.originalOwnerName ? -1 : 1),
		);

		if (picks.length !== ROUNDS) unbalanced.push(nameOf(id));

		const manager = managers.get(id);
		teams.push({
			managerId: id,
			displayName: nameOf(id),
			slug: manager?.slug ?? id,
			picks,
			acquired: picks.filter((p) => !p.own).length,
			tradedAway: [...holder].filter(
				([key, current]) => key.startsWith(`${id}|`) && current !== id,
			).length,
		});
	}

	teams.sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));

	return { year, teams, unbalanced, rounds: ROUNDS };
}
