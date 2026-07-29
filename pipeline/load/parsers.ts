/**
 * Per-file parsing. Reads, JSON-parses, and schema-checks one export file.
 *
 * Nothing here interprets the data: no year/week extraction from `matchupId`,
 * no slot-vocabulary reconciliation, no game classification. Stage 1 answers
 * only "is this the shape we expect", and hands the records on verbatim.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	checkRecord,
	checkValueMap,
	expectArray,
	type RecordSpec,
} from "./schema.ts";
import {
	DRAFT_SPEC,
	END_ROSTER_SPEC,
	END_STANDING_SPEC,
	MANAGER_SPEC,
	MATCHUP_SPEC,
	PLAYER_SPEC,
	PLAYER_STAT_SPEC,
	PLAYOFF_SPEC,
	REGULAR_SEASON_STANDING_SPEC,
	SETTINGS_SPEC,
	TRADE_LEG_SPEC,
	TRADE_SPEC,
} from "./specs.ts";
import type {
	RawDraftPick,
	RawEndRosterEntry,
	RawEndStanding,
	RawManager,
	RawMatchup,
	RawPlayer,
	RawPlayerMatchupStat,
	RawPlayoffGame,
	RawRegularSeasonStanding,
	RawSettings,
	RawTrade,
} from "./types.ts";
import { CODES, type IssueLocation, type ValidationCollector } from "./validation.ts";

export interface ParseResult<T> {
	records: T[];
	/** False if any error-severity issue was raised. The season is then skipped. */
	ok: boolean;
}

/** Extra per-record validation that a flat field spec cannot express. */
type ExtraCheck<T> = (record: T, where: IssueLocation, v: ValidationCollector) => boolean;

/**
 * The shared read -> parse -> validate path. Never throws: an unreadable or
 * malformed file becomes an error issue and an empty result, so one bad file
 * does not stop the other 89 from being checked.
 */
function parseFile<T>(
	dir: string,
	file: string,
	spec: RecordSpec,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
	extra?: ExtraCheck<T>,
): ParseResult<T> {
	const at: IssueLocation = { ...where, file };

	let text: string;
	try {
		text = readFileSync(join(dir, file), "utf8");
	} catch (err) {
		v.error(CODES.UNREADABLE_FILE, `Could not read ${file}: ${(err as Error).message}`, at);
		return { records: [], ok: false };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (err) {
		v.error(CODES.INVALID_JSON, `${file} is not valid JSON: ${(err as Error).message}`, at);
		return { records: [], ok: false };
	}

	const array = expectArray(parsed, at, v);
	if (!array) return { records: [], ok: false };

	const records: T[] = [];
	let ok = true;

	for (const [index, record] of array.entries()) {
		const recordAt: IssueLocation = { ...at, recordIndex: index };
		let valid = checkRecord(spec, record, recordAt, v);
		if (valid && extra) valid = extra(record as T, recordAt, v);
		if (valid) records.push(record as T);
		else ok = false;
	}

	return { records, ok };
}

/**
 * `nflTeam` is legitimately empty for some players (96 records across the
 * export). Reported once per file rather than once per record — 96 individual
 * infos would bury the issues that matter.
 */
function reportEmptyNflTeams(
	records: Array<{ nflTeam: string }>,
	at: IssueLocation,
	v: ValidationCollector,
): void {
	const empty = records.filter((r) => r.nflTeam === "").length;
	if (empty > 0) {
		v.info(
			CODES.EMPTY_FIELD,
			`${empty} record(s) have an empty nflTeam; those players have no season-accurate team.`,
			{ ...at, field: "nflTeam" },
		);
	}
}

export function parseManagers(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawManager> {
	return parseFile<RawManager>(dir, "managers-history.json", MANAGER_SPEC, where, v);
}

export function parseRegularSeasonStandings(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawRegularSeasonStanding> {
	return parseFile<RawRegularSeasonStanding>(
		dir,
		"regular-season-standings-history.json",
		REGULAR_SEASON_STANDING_SPEC,
		where,
		v,
	);
}

export function parseEndStandings(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawEndStanding> {
	return parseFile<RawEndStanding>(
		dir,
		"end-standings-history.json",
		END_STANDING_SPEC,
		where,
		v,
	);
}

export function parseMatchups(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawMatchup> {
	return parseFile<RawMatchup>(dir, "matchup-history.json", MATCHUP_SPEC, where, v);
}

export function parsePlayoffs(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawPlayoffGame> {
	return parseFile<RawPlayoffGame>(dir, "playoff-history.json", PLAYOFF_SPEC, where, v);
}

export function parseDraft(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawDraftPick> {
	return parseFile<RawDraftPick>(dir, "draft-history.json", DRAFT_SPEC, where, v);
}

export function parseEndRoster(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawEndRosterEntry> {
	const result = parseFile<RawEndRosterEntry>(
		dir,
		"end-roster-history.json",
		END_ROSTER_SPEC,
		where,
		v,
	);
	reportEmptyNflTeams(result.records, { ...where, file: "end-roster-history.json" }, v);
	return result;
}

export function parsePlayerStats(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawPlayerMatchupStat> {
	const file = "player-matchup-statistics-history.json";
	const result = parseFile<RawPlayerMatchupStat>(
		dir,
		file,
		PLAYER_STAT_SPEC,
		where,
		v,
		(record, at, collector) => checkValueMap(record.stats, "number", { ...at, field: "stats" }, collector),
	);
	reportEmptyNflTeams(result.records, { ...where, file }, v);
	return result;
}

export function parseTrades(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawTrade> {
	return parseFile<RawTrade>(
		dir,
		"trade-history.json",
		TRADE_SPEC,
		where,
		v,
		(trade, at, collector) => {
			let ok = true;
			for (const [legIndex, leg] of trade.transaction.entries()) {
				const legAt: IssueLocation = { ...at, field: `transaction[${legIndex}]` };
				if (!checkRecord(TRADE_LEG_SPEC, leg, legAt, collector)) {
					ok = false;
					continue;
				}
				for (const [sendIndex, send] of leg.sends.entries()) {
					const sendAt: IssueLocation = {
						...at,
						field: `transaction[${legIndex}].sends[${sendIndex}]`,
					};
					if (!checkSend(send, sendAt, collector)) ok = false;
				}
			}
			return ok;
		},
	);
}

/**
 * A `sends` entry is a discriminated union: a player or a draft pick. Future-year
 * picks are legal and common (every season from 2018 trades them).
 */
function checkSend(send: unknown, at: IssueLocation, v: ValidationCollector): boolean {
	if (typeof send !== "object" || send === null || Array.isArray(send)) {
		v.error(CODES.NOT_AN_OBJECT, "Trade `sends` entry is not an object.", at);
		return false;
	}
	const entry = send as Record<string, unknown>;

	if (entry["type"] === "player") {
		return checkRecord({ type: { type: "string" }, playerId: { type: "string", pattern: /^\d+$/ } }, entry, at, v);
	}

	if (entry["type"] === "draftPick") {
		const ok = checkRecord(
			{ type: { type: "string" }, draftPick: { type: "object" } },
			entry,
			at,
			v,
		);
		if (!ok) return false;
		return checkRecord(
			{ year: { type: "number", integer: true }, round: { type: "number", integer: true } },
			entry["draftPick"],
			{ ...at, field: `${at.field ?? ""}.draftPick` },
			v,
		);
	}

	v.error(
		CODES.UNEXPECTED_ENUM_VALUE,
		`Trade \`sends\` entry has unknown type ${JSON.stringify(entry["type"])}; expected "player" or "draftPick".`,
		at,
	);
	return false;
}

/**
 * `settings-history.json` is a one-element array wrapping the settings object,
 * not a bare object as §6.2 originally described.
 */
export function parseSettings(
	dir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): { settings: RawSettings | null; ok: boolean } {
	const file = "settings-history.json";
	const at: IssueLocation = { ...where, file };

	const result = parseFile<RawSettings>(dir, file, SETTINGS_SPEC, where, v, (record, recordAt, collector) => {
		let ok = checkValueMap(record.offenseSettings, "number", { ...recordAt, field: "offenseSettings" }, collector);
		ok = checkValueMap(record.kickingSettings, "number", { ...recordAt, field: "kickingSettings" }, collector) && ok;
		ok = checkValueMap(record.dstSettings, "number", { ...recordAt, field: "dstSettings" }, collector) && ok;
		ok = checkValueMap(record.otherSettings, "string", { ...recordAt, field: "otherSettings" }, collector) && ok;

		// rosterPositions maps a slot name to `{ count }`, so it needs its own walk.
		for (const [slot, value] of Object.entries(record.rosterPositions)) {
			const slotAt: IssueLocation = { ...recordAt, field: `rosterPositions.${slot}` };
			if (!checkRecord({ count: { type: "number", integer: true } }, value, slotAt, collector)) ok = false;
		}
		return ok;
	});

	if (!result.ok) return { settings: null, ok: false };

	if (result.records.length !== 1) {
		v.error(
			CODES.SETTINGS_RECORD_COUNT,
			`Expected exactly one settings record, found ${result.records.length}.`,
			at,
		);
		return { settings: null, ok: false };
	}

	return { settings: result.records[0] as RawSettings, ok: true };
}

/** The league-wide player registry, one level above the season folders. */
export function parsePlayers(
	leagueDir: string,
	where: Omit<IssueLocation, "file">,
	v: ValidationCollector,
): ParseResult<RawPlayer> {
	const file = "players.json";
	const result = parseFile<RawPlayer>(leagueDir, file, PLAYER_SPEC, where, v);

	const seen = new Set<string>();
	for (const [index, player] of result.records.entries()) {
		if (seen.has(player.playerId)) {
			v.error(CODES.DUPLICATE_PLAYER_ID, `Duplicate playerId "${player.playerId}".`, {
				...where,
				file,
				recordIndex: index,
				field: "playerId",
			});
			result.ok = false;
		}
		seen.add(player.playerId);
	}

	return result;
}
