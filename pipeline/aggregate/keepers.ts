/**
 * Keeper values: what each rostered player would cost to keep next season.
 *
 * Pure functions, no I/O.
 *
 * **This is not the derivation rule 18 forbids.** That rule is about inferring
 * *which* players were kept from a past draft, a heuristic that was tested and
 * failed. This computes the *price* of keeping a player who is on the roster
 * now, which is a stated rule rather than an inference.
 *
 * The rules, from the league rulebook and confirmed by the league:
 *
 * 1. **Drafted** in the season just ended -> keeper value is `round - 1`
 *    (rulebook §10.2). A **first-round** pick therefore has no keeper value and
 *    cannot be kept (§10.1).
 * 2. **Undrafted** -> the value comes from that player's *last* acquisition:
 *    a waiver claim is round 10 (§5.3), a free-agent pickup round 12 (§7.1).
 *
 * Two consequences worth stating explicitly, because both are easy to get
 * backwards and both were called out when this was specified:
 *
 * - **Trades never affect the value.** A player keeps his draft-based value no
 *   matter how many teams he has passed through, so the draft is searched by
 *   `playerId` alone and the drafting team is irrelevant. 37 of the 106 drafted
 *   players on the 2025 rosters are held by a team that did not draft them.
 * - **Being dropped never affects it either.** A drafted player who was cut and
 *   later re-claimed still costs `round - 1`; rule 2 applies only to players who
 *   were never drafted at all.
 *
 * Not implemented, deliberately: rulebook §5.3 prices a team's *second* waiver
 * keeper at round 9 and its *third* at round 8, and adds a collision rule when a
 * drafted keeper shares a round with a waiver keeper. Both depend on which
 * players a team chooses to keep — a decision made at the keeper deadline, not
 * something in the data — so each player is priced standalone.
 */

import type { Manager, ManagerId, RosterEntry, SeasonDraft, Year } from "../model.ts";
import type { AcquisitionVia } from "../normalize/acquisitions.ts";

/** Rulebook §5.3 and §7.1. */
const WAIVER_ROUND = 10;
const FREE_AGENT_ROUND = 12;

/**
 * Why a player has the value he has — or why he has none. The renderer switches
 * on this rather than parsing a label, so the wording lives in one place.
 */
export type KeeperBasis =
	| { kind: "drafted"; round: number }
	| { kind: "firstRound" }
	| { kind: "waiver" }
	| { kind: "freeAgent" }
	| { kind: "unrecorded" };

export interface KeeperRow {
	playerId: string;
	playerName: string;
	position: string;
	/** The round this player costs to keep. `undefined` when he cannot be kept, or is unknown. */
	value?: number;
	basis: KeeperBasis;
}

export interface KeeperTeam {
	managerId: ManagerId;
	displayName: string;
	slug: string;
	avatar?: string;
	players: KeeperRow[];
	/** How many rows have no usable value yet, so the page can say so honestly. */
	unrecordedCount: number;
}

export interface SeasonKeeperView {
	/** The season whose rosters these are. */
	year: Year;
	/** The season the values apply to — always the next one. */
	keeperYear: Year;
	teams: KeeperTeam[];
	/** Total rows still awaiting waiver/free-agent data across all teams. */
	unrecordedCount: number;
}

export interface KeeperInputs {
	rosters: readonly RosterEntry[];
	drafts: ReadonlyMap<Year, SeasonDraft>;
	managers: ReadonlyMap<ManagerId, Manager>;
	acquisitions: ReadonlyMap<Year, ReadonlyMap<string, AcquisitionVia>>;
	/** Which season's rosters to price. Callers pass the latest; never hardcoded. */
	year: Year;
}

/**
 * The value of one player. Exported for direct testing — this is the whole rule
 * set, and it is the part that must not drift.
 */
export function keeperValueOf(
	playerId: string,
	draftRound: number | undefined,
	via: AcquisitionVia | undefined,
): { value?: number; basis: KeeperBasis } {
	if (draftRound !== undefined) {
		// §10.1: a first-rounder cannot be kept at all, so there is no value to show.
		if (draftRound <= 1) return { basis: { kind: "firstRound" } };
		return { value: draftRound - 1, basis: { kind: "drafted", round: draftRound } };
	}

	if (via === "waiver") return { value: WAIVER_ROUND, basis: { kind: "waiver" } };
	if (via === "freeAgent") return { value: FREE_AGENT_ROUND, basis: { kind: "freeAgent" } };

	// Undrafted and unrecorded. Left blank rather than guessed: the export has no
	// waiver or free-agent history (D21), and a plausible wrong round is worse
	// than an obvious gap.
	return { basis: { kind: "unrecorded" } };
}

export function buildKeeperView(inputs: KeeperInputs): SeasonKeeperView | null {
	const { rosters, drafts, managers, acquisitions, year } = inputs;

	const draft = drafts.get(year);
	if (!draft) return null;

	// By playerId only. The drafting team is deliberately not part of the key —
	// see the note on trades above.
	const roundByPlayer = new Map<string, number>();
	for (const pick of draft.picks) {
		const existing = roundByPlayer.get(pick.playerId);
		// A player can only be drafted once; if that ever changed, the earlier
		// (better) round is the one that would price him.
		if (existing === undefined || pick.round < existing) roundByPlayer.set(pick.playerId, pick.round);
	}

	const via = acquisitions.get(year);

	const byManager = new Map<ManagerId, KeeperRow[]>();
	for (const entry of rosters) {
		// IR players are excluded: they are not part of the 15 the keeper rules
		// apply to. Every 2025 team has exactly 15 once RES is dropped.
		if (entry.year !== year || entry.onIr) continue;

		const { value, basis } = keeperValueOf(
			entry.playerId,
			roundByPlayer.get(entry.playerId),
			via?.get(entry.playerId),
		);

		const row: KeeperRow = {
			playerId: entry.playerId,
			playerName: entry.playerName,
			position: entry.position,
			basis,
		};
		if (value !== undefined) row.value = value;

		const list = byManager.get(entry.managerId);
		if (list) list.push(row);
		else byManager.set(entry.managerId, [row]);
	}

	const teams: KeeperTeam[] = [];
	for (const [managerId, players] of byManager) {
		const manager = managers.get(managerId);
		players.sort(byValueThenName);

		const team: KeeperTeam = {
			managerId,
			displayName: manager?.displayName ?? `Unknown manager (${managerId})`,
			slug: manager?.slug ?? managerId,
			players,
			unrecordedCount: players.filter((p) => p.basis.kind === "unrecorded").length,
		};
		if (manager?.latestAvatar !== undefined) team.avatar = manager.latestAvatar;
		teams.push(team);
	}

	teams.sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));

	return {
		year,
		keeperYear: year + 1,
		teams,
		unrecordedCount: teams.reduce((sum, t) => sum + t.unrecordedCount, 0),
	};
}

/**
 * Ascending by keeper value: round 1 first, round 14 last.
 *
 * Note that this runs from the most expensive keeper to the cheapest — a
 * round-1 price costs a first-round pick. Players who cannot be kept, and those
 * still awaiting data, sink to the bottom where they do not interrupt the run of
 * numbers.
 *
 * Name breaks every tie so the order is total and the build stays deterministic
 * (NFR-9).
 */
function byValueThenName(a: KeeperRow, b: KeeperRow): number {
	const rank = (row: KeeperRow): number =>
		row.value !== undefined ? 0 : row.basis.kind === "unrecorded" ? 1 : 2;

	const byRank = rank(a) - rank(b);
	if (byRank !== 0) return byRank;

	if (a.value !== undefined && b.value !== undefined && a.value !== b.value) {
		return a.value - b.value;
	}
	return a.playerName < b.playerName ? -1 : a.playerName > b.playerName ? 1 : 0;
}
