/**
 * Field specs for the ten per-season files plus `players.json`.
 *
 * Kept in one file on purpose: the specs are declarative data, and having them
 * side by side is what makes the differences between files legible (e.g. that
 * `matchup` and `playoff` share team1/team2 but only `playoff` carries seeds).
 *
 * Every field documented in requirements-specification.md §6.2/§6.3 is required
 * here. Fields absent from these specs are reported as `unknown-field` warnings,
 * which is how a future export's added columns will announce themselves.
 */

import {
	COUNT,
	ID,
	KNOWN_BRACKET_TYPES,
	KNOWN_STATUSES,
	MATCHUP_ID,
	POINTS,
	TEXT,
	YEAR,
	type RecordSpec,
} from "./schema.ts";

/** ISO-8601 without timezone, e.g. `2025-10-25T03:11:00`. Treat as local (§13.1). */
const ISO_NO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export const MANAGER_SPEC: RecordSpec = {
	year: YEAR,
	managerName: TEXT,
	userId: ID,
	// The only nullable fields in the entire export: null in all 90 records.
	coManagerName: { type: "string", nullable: true },
	coUserId: { type: "string", nullable: true },
	teamName: TEXT,
	teamId: ID,
	teamImgUrl: TEXT,
};

export const REGULAR_SEASON_STANDING_SPEC: RecordSpec = {
	year: YEAR,
	divisionId: COUNT,
	divisionName: TEXT,
	teamId: ID,
	divisionRank: COUNT,
	overallRank: COUNT,
	wins: COUNT,
	losses: COUNT,
	draws: COUNT,
	pointsFor: POINTS,
	pointsAgainst: POINTS,
};

export const END_STANDING_SPEC: RecordSpec = {
	year: YEAR,
	rank: COUNT,
	teamId: ID,
	teamName: TEXT,
};

export const MATCHUP_SPEC: RecordSpec = {
	year: YEAR,
	week: COUNT,
	// Shape-checked only. Extracting year/week from it is stage 2's job (D-parse).
	matchupId: { type: "string", pattern: MATCHUP_ID },
	team1Id: ID,
	team2Id: ID,
	team1Points: POINTS,
	team2Points: POINTS,
};

export const PLAYOFF_SPEC: RecordSpec = {
	year: YEAR,
	week: COUNT,
	round: COUNT,
	// Legitimately "" for early consolation rounds — no pattern, no enum (D11).
	roundLabel: TEXT,
	bracketType: { type: "string", enum: KNOWN_BRACKET_TYPES },
	team1Id: ID,
	team1Seed: COUNT,
	team2Id: ID,
	team2Seed: COUNT,
	team1Points: POINTS,
	team2Points: POINTS,
	winner: ID,
};

export const DRAFT_SPEC: RecordSpec = {
	year: YEAR,
	round: COUNT,
	// Global pick number across the draft (1-150), not within-round.
	pick: COUNT,
	teamId: ID,
	teamName: TEXT,
	playerId: ID,
	playerName: TEXT,
};

export const END_ROSTER_SPEC: RecordSpec = {
	year: YEAR,
	teamId: ID,
	playerId: ID,
	status: { type: "string", enum: KNOWN_STATUSES },
	// Lineup slot, not position (D3). Uses FLEX/RES where settings say WRRB_FLEX/IR.
	pos: TEXT,
	nflTeam: TEXT,
	pts: POINTS,
};

export const PLAYER_STAT_SPEC: RecordSpec = {
	matchupId: { type: "string", pattern: MATCHUP_ID },
	teamId: ID,
	playerId: ID,
	pos: TEXT,
	nflTeam: TEXT,
	status: { type: "string", enum: KNOWN_STATUSES },
	pts: POINTS,
	// Key set varies by season; validated as a value map, never against an allow-list.
	stats: { type: "object" },
};

export const TRADE_SPEC: RecordSpec = {
	year: YEAR,
	transactionDate: { type: "string", pattern: ISO_NO_TZ },
	// Can be 0 (D13) — so no minimum is asserted.
	transactionWeek: COUNT,
	// A userId, and not necessarily a participant.
	transactionOwnerUserId: ID,
	transaction: { type: "array" },
};

export const TRADE_LEG_SPEC: RecordSpec = {
	from: ID,
	to: ID,
	sends: { type: "array" },
};

export const SETTINGS_SPEC: RecordSpec = {
	year: YEAR,
	rosterPositions: { type: "object" },
	offenseSettings: { type: "object" },
	kickingSettings: { type: "object" },
	dstSettings: { type: "object" },
	otherSettings: { type: "object" },
};

export const PLAYER_SPEC: RecordSpec = {
	// DEF entries use a separate `1000xx` space; all IDs are opaque numeric strings.
	playerId: ID,
	playerName: TEXT,
	pos: TEXT,
};
