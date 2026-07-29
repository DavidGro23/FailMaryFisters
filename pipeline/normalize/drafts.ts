/**
 * One season's draft.
 *
 * `pick` in the export is the **overall** pick number (1-150), not the pick
 * within its round — verified in all nine seasons, where round 2 runs from pick
 * 11 to 20.
 *
 * Every team holds exactly 15 picks in every season, which is the rulebook's
 * own rule (§6.4.2). But from 2019 onward picks are traded, so a team routinely
 * has two picks in one round and none in another — 2023 Railgunners have no
 * first-rounder and two thirteenths. Nothing here assumes one pick per round.
 */

import type { RawLeague, RawSeason } from "../load/types.ts";
import type { DraftPick, ManagerId, SeasonDraft } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";
import type { PlayerInfo } from "./players.ts";

export function normalizeDraft(
	league: RawLeague,
	season: RawSeason,
	teamToManager: Map<string, ManagerId>,
	registry: Map<string, PlayerInfo>,
	v: ValidationCollector,
): SeasonDraft | null {
	const picks: DraftPick[] = [];

	for (const raw of season.draft) {
		const managerId = teamToManager.get(raw.teamId);
		if (managerId === undefined) {
			v.error(
				CODES.UNRESOLVED_MANAGER,
				`A ${season.year} draft pick references a teamId with no manager.`,
				{ league: league.folderName, year: season.year, file: "draft-history.json" },
			);
			return null;
		}

		picks.push({
			round: raw.round,
			overall: raw.pick,
			managerId,
			playerId: raw.playerId,
			// The registry carries the player's current name, which is what the rest
			// of the site shows. Where an id is missing from it, the draft file's own
			// name is a better fallback than an id — it is what was on the board.
			playerName: registry.get(raw.playerId)?.name ?? raw.playerName,
		});
	}

	if (picks.length === 0) return null;

	picks.sort((a, b) => a.overall - b.overall);

	return {
		year: season.year,
		rounds: Math.max(...picks.map((p) => p.round)),
		picks,
	};
}
