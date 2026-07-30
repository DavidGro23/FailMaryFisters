/**
 * The player registry, and every player-game with its score sign-corrected.
 *
 * `players.json` is the only source of a player's real position — the `pos`
 * field on roster and stat records is the lineup slot (D3), and it spells the
 * flex slot `FLEX` where the settings say `WRRB_FLEX` (D16). Position matters
 * here because it selects which scoring table the D17 recomputation uses.
 */

import type { RawLeague, RawPlayer, RawSeason } from "../load/types.ts";
import type { GameType, ManagerId, PlayerGame } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";
import { postseasonKeys } from "./games.ts";
import { correctScore } from "./scoring.ts";

export interface PlayerInfo {
	name: string;
	position: string;
}

export function buildPlayerRegistry(players: readonly RawPlayer[]): Map<string, PlayerInfo> {
	return new Map(players.map((p) => [p.playerId, { name: p.playerName, position: p.pos }]));
}

/**
 * `players.json` is incomplete — four ids across nine seasons are referenced but
 * absent. Rendering the id keeps the gap visible instead of dropping the row
 * (rule 5). None of the four is a starter, so this is a safety net rather than
 * a live path.
 */
function unknownPlayer(playerId: string): PlayerInfo {
	return { name: `Unknown Player (${playerId})`, position: "" };
}

export function normalizePlayerGames(
	league: RawLeague,
	season: RawSeason,
	teamToManager: Map<string, ManagerId>,
	registry: Map<string, PlayerInfo>,
	v: ValidationCollector,
): PlayerGame[] {
	const games: PlayerGame[] = [];
	const unresolved = new Set<string>();
	const postseason = postseasonKeys(season);
	let corrections = 0;
	let unparsed = 0;

	for (const raw of season.playerStats) {
		const managerId = teamToManager.get(raw.teamId);
		if (managerId === undefined) continue;

		// The only place a player-stat record carries its week (D-parse / rule 10).
		// Stage 1 has already checked the shape, so a failure here means the shape
		// check and this parser have drifted apart.
		const parsed = /^(\d{4})-(\d{1,2})-(\d+)-(\d+)$/.exec(raw.matchupId);
		if (!parsed) {
			unparsed++;
			continue;
		}
		const week = Number(parsed[2]);
		const type: GameType = postseason.get(raw.matchupId) ?? "regular";

		let info = registry.get(raw.playerId);
		if (!info) {
			unresolved.add(raw.playerId);
			info = unknownPlayer(raw.playerId);
		}

		const { points, corrected } = correctScore(raw, info.position, season.settings);
		if (corrected) corrections++;

		games.push({
			year: season.year,
			week,
			type,
			managerId,
			playerId: raw.playerId,
			playerName: info.name,
			// A lineup slot, not merely being on the roster. Bench and IR records
			// carry status BN and RES respectively.
			started: raw.status === "ST",
			points,
		});
	}

	if (unparsed > 0) {
		v.error(
			CODES.MALFORMED_FIELD,
			`${unparsed} player-stat record(s) in ${season.year} have a matchupId this stage could not parse.`,
			{ league: league.folderName, year: season.year, file: "player-matchup-statistics-history.json" },
		);
	}

	if (corrections > 0) {
		v.info(
			CODES.PLAYER_SCORE_SIGN_CORRECTED,
			`${corrections} player score(s) in ${season.year} were stored as the magnitude of a ` +
				`negative value and have been negated (D17).`,
			{ league: league.folderName, year: season.year, file: "player-matchup-statistics-history.json" },
		);
	}

	if (unresolved.size > 0) {
		v.info(
			CODES.PLAYER_NOT_RESOLVED,
			`${unresolved.size} playerId(s) in ${season.year} are absent from players.json and render ` +
				`as "Unknown Player (<id>)": ${[...unresolved].sort().join(", ")}.`,
			{ league: league.folderName, year: season.year, file: "players.json" },
		);
	}

	return games;
}
