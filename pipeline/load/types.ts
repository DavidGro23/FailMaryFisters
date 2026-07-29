/**
 * Raw shapes of the NFL Fantasy export, exactly as they appear on disk.
 *
 * These are stage-1 types: they describe the export, not the site's model.
 * The canonical model lives in `pipeline/model.ts` (stage 2) and is deliberately
 * different — notably `team1`/`team2` become `a`/`b`, and `year`/`week` get
 * materialized onto player stats.
 *
 * Verified across all nine seasons (2017-2025): field names are identical in
 * every year for every file. There is no schema drift, only content drift.
 */

/** All ten per-season files are JSON arrays at top level. So is `players.json`. */

export interface RawManager {
	year: number;
	managerName: string;
	userId: string;
	coManagerName: string | null;
	coUserId: string | null;
	teamName: string;
	teamId: string;
	teamImgUrl: string;
}

export interface RawRegularSeasonStanding {
	year: number;
	divisionId: number;
	divisionName: string;
	teamId: string;
	divisionRank: number;
	overallRank: number;
	wins: number;
	losses: number;
	draws: number;
	pointsFor: number;
	pointsAgainst: number;
}

export interface RawEndStanding {
	year: number;
	rank: number;
	teamId: string;
	teamName: string;
}

export interface RawMatchup {
	year: number;
	week: number;
	/** `${year}-${week}-${lowerTeamId}-${higherTeamId}`. Not parsed in stage 1. */
	matchupId: string;
	team1Id: string;
	team2Id: string;
	team1Points: number;
	team2Points: number;
}

export interface RawPlayoffGame {
	year: number;
	week: number;
	round: number;
	/** May be `""` for early consolation rounds. Never match on this (D11). */
	roundLabel: string;
	bracketType: string;
	team1Id: string;
	team1Seed: number;
	team2Id: string;
	team2Seed: number;
	team1Points: number;
	team2Points: number;
	/** A teamId, not a team name. */
	winner: string;
}

export interface RawDraftPick {
	year: number;
	round: number;
	/** Global pick number across the whole draft (1-150), NOT within-round. */
	pick: number;
	teamId: string;
	teamName: string;
	playerId: string;
	playerName: string;
}

export interface RawEndRosterEntry {
	year: number;
	teamId: string;
	playerId: string;
	status: string;
	/** Lineup SLOT, not the player's position (D3). Uses `FLEX`/`RES`, not `WRRB_FLEX`/`IR`. */
	pos: string;
	nflTeam: string;
	/** Season total for that player. */
	pts: number;
}

export interface RawPlayerMatchupStat {
	/** The only link to year and week — both are absent as fields (D-parse). */
	matchupId: string;
	teamId: string;
	playerId: string;
	pos: string;
	nflTeam: string;
	status: string;
	pts: number;
	/**
	 * Key set varies by season: 25 keys in 2017-2018, 19 in 2019-2024, 11 in 2025.
	 * Never type this as a fixed interface (D12).
	 */
	stats: Record<string, number>;
}

export type RawTradeSend =
	| { type: "player"; playerId: string }
	| { type: "draftPick"; draftPick: { year: number; round: number } };

export interface RawTradeLeg {
	/** teamId — a different identifier space from `transactionOwnerUserId`. */
	from: string;
	to: string;
	sends: RawTradeSend[];
}

export interface RawTrade {
	year: number;
	/** ISO-8601 without timezone. Treat as local; never convert. */
	transactionDate: string;
	/** Can be 0. Do not assume 1..17 (D13). */
	transactionWeek: number;
	/** A userId, and NOT necessarily a participant — often the commissioner. */
	transactionOwnerUserId: string;
	transaction: RawTradeLeg[];
}

export interface RawSettings {
	year: number;
	/** Slot keys use `WRRB_FLEX` and `IR`, which appear as `FLEX`/`RES` on roster records. */
	rosterPositions: Record<string, { count: number }>;
	offenseSettings: Record<string, number>;
	kickingSettings: Record<string, number>;
	dstSettings: Record<string, number>;
	otherSettings: Record<string, string>;
}

export interface RawPlayer {
	playerId: string;
	playerName: string;
	pos: string;
}

/** One season folder, fully parsed. */
export interface RawSeason {
	year: number;
	managers: RawManager[];
	regularSeasonStandings: RawRegularSeasonStanding[];
	endStandings: RawEndStanding[];
	matchups: RawMatchup[];
	playoffs: RawPlayoffGame[];
	draft: RawDraftPick[];
	endRoster: RawEndRosterEntry[];
	playerStats: RawPlayerMatchupStat[];
	trades: RawTrade[];
	settings: RawSettings;
}

/** Which hand-maintained files exist. Absence is expected, not an error. */
export interface HandWrittenFiles {
	managerAliases: boolean;
	leagueRules: boolean;
	assets: boolean;
}

export interface RawLeague {
	/** Numeric prefix of the folder name, e.g. "5613993". */
	leagueId: string;
	/** Slug suffix of the folder name, e.g. "failmaryfisters". */
	slug: string;
	/** Full folder name, used as the `league` field on validation issues. */
	folderName: string;
	players: RawPlayer[];
	/** Sorted ascending by year. Seasons that failed to load are absent. */
	seasons: RawSeason[];
	handWritten: HandWrittenFiles;
}
