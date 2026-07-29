/**
 * Trades, with every teamId resolved to a manager and every item named.
 *
 * `from`/`to` on the legs identify the participants. `transactionOwnerUserId` is
 * *not* reliably one of them — six trades across 2018-2024 carry moritz, the
 * commissioner, recording a trade between two other managers — so it is not
 * used to determine who was involved.
 *
 * Measured: all 60 trades are strictly two-team and two-leg. Nothing here
 * assumes that, but the display can.
 */

import type { RawLeague, RawSeason } from "../load/types.ts";
import type { ManagerId, Trade, TradeItem, TradeLeg } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";
import type { PlayerInfo } from "./players.ts";

export function normalizeTrades(
	league: RawLeague,
	season: RawSeason,
	teamToManager: Map<string, ManagerId>,
	registry: Map<string, PlayerInfo>,
	v: ValidationCollector,
): Trade[] {
	const trades: Trade[] = [];

	for (const raw of season.trades) {
		const legs: TradeLeg[] = [];
		const participants = new Set<ManagerId>();
		let resolved = true;

		for (const rawLeg of raw.transaction) {
			const fromId = teamToManager.get(rawLeg.from);
			const toId = teamToManager.get(rawLeg.to);
			if (fromId === undefined || toId === undefined) {
				v.error(
					CODES.UNRESOLVED_MANAGER,
					`A ${season.year} trade leg references a teamId with no manager.`,
					{ league: league.folderName, year: season.year, file: "trade-history.json" },
				);
				resolved = false;
				break;
			}

			participants.add(fromId);
			participants.add(toId);

			const items: TradeItem[] = rawLeg.sends.map((send): TradeItem => {
				if (send.type === "player") {
					return {
						kind: "player",
						playerId: send.playerId,
						playerName: registry.get(send.playerId)?.name ?? `Unknown Player (${send.playerId})`,
					};
				}
				// Future-year picks are traded in every season from 2018 onward, so
				// the pick's year is not necessarily the trade's year.
				return { kind: "pick", year: send.draftPick.year, round: send.draftPick.round };
			});

			legs.push({ fromId, toId, items });
		}

		if (!resolved) continue;

		trades.push({
			year: season.year,
			// ISO-8601 without timezone. Kept as the raw string; parsing and
			// formatting are the render stage's business (§13.1).
			date: raw.transactionDate,
			week: raw.transactionWeek,
			participantIds: [...participants],
			legs,
		});
	}

	return trades;
}
