/**
 * End-of-season rosters.
 *
 * `end-roster-history.json` has been loaded and schema-checked since stage 1 but
 * never normalized — the keeper page is its first consumer.
 *
 * Two things about the raw records matter here:
 *
 * - **`pos` is the lineup slot, not the position** (rule 5). A bench player is
 *   `BN`, an IR player `RES`. The real position comes from `players.json`, which
 *   is what the registry provides.
 * - **Roster size is not fixed.** 2017-2019 give exactly 15 players; from 2020
 *   the IR slot pushes it to 14-17. Nothing here assumes a count — the keeper
 *   aggregate filters IR out and gets 15, but that is a property of the data,
 *   not an invariant this code enforces.
 */

import type { RawLeague, RawSeason } from "../load/types.ts";
import type { ManagerId, RosterEntry } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";
import type { PlayerInfo } from "./players.ts";

/** The export's IR slot. Same spelling in `status` and `pos` (D16). */
const IR_STATUS = "RES";

export function normalizeRosters(
	league: RawLeague,
	season: RawSeason,
	teamToManager: Map<string, ManagerId>,
	registry: Map<string, PlayerInfo>,
	v: ValidationCollector,
): RosterEntry[] {
	const entries: RosterEntry[] = [];
	const unresolved = new Set<string>();

	for (const raw of season.endRoster) {
		const managerId = teamToManager.get(raw.teamId);
		if (managerId === undefined) {
			v.error(
				CODES.UNRESOLVED_MANAGER,
				`A ${season.year} end-roster entry references a teamId with no manager.`,
				{ league: league.folderName, year: season.year, file: "end-roster-history.json" },
			);
			continue;
		}

		const info = registry.get(raw.playerId);
		if (!info) unresolved.add(raw.playerId);

		entries.push({
			year: season.year,
			managerId,
			playerId: raw.playerId,
			playerName: info?.name ?? `Unknown Player (${raw.playerId})`,
			position: info?.position ?? "",
			onIr: raw.status === IR_STATUS,
		});
	}

	if (unresolved.size > 0) {
		v.info(
			CODES.PLAYER_NOT_RESOLVED,
			`Season ${season.year}: ${unresolved.size} rostered playerId(s) absent from players.json; ` +
				`rendered as "Unknown Player (<id>)".`,
			{ league: league.folderName, year: season.year, file: "end-roster-history.json" },
		);
	}

	return entries;
}
