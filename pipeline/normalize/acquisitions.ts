/**
 * How undrafted players joined their roster — waiver claim or free-agent pickup.
 *
 * **This is not in the NFL export.** Every field of all ten files across nine
 * seasons was searched: the only transaction data is `trade-history.json`. There
 * is no add, drop, waiver, or FAAB record anywhere (D21). The league's own
 * rulebook (§5.3) nevertheless makes an undrafted player's keeper value depend
 * on "his last corresponding transaction on the waiver wire/free agents market",
 * so the information has to come from somewhere else.
 *
 * It is therefore hand-maintainable, like `manager-aliases.json`, and is
 * populated out-of-band by a local tool that is deliberately not part of this
 * repository — the site does not need network code to build (rule 19, NFR-9).
 *
 * Absence is expected and never an error: undrafted players simply render as
 * "not recorded" rather than being given a guessed value. A wrong keeper value
 * is worse than a blank one in a league that argues about these numbers.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { RawLeague } from "../load/types.ts";
import type { Year } from "../model.ts";
import { CODES, type ValidationCollector } from "../load/validation.ts";
import { RAW_DATA_DIR } from "../paths.ts";

export const ACQUISITIONS_FILE = "keeper-acquisitions.json";

/** The only two ways an undrafted player can arrive, per rulebook §5.3 and §7.1. */
export type AcquisitionVia = "waiver" | "freeAgent";

/**
 * `{ "2025": { "<playerId>": "waiver" | "freeAgent" } }`
 *
 * Keyed by `playerId` rather than name: names are not unique over time and are
 * not stable, ids are (rule 5). The optional `players` block alongside it is
 * documentation for whoever maintains the file by hand, and is ignored here.
 */
export interface AcquisitionsFile {
	[year: string]: Record<string, AcquisitionVia> | undefined;
}

export type Acquisitions = Map<Year, Map<string, AcquisitionVia>>;

function isVia(value: unknown): value is AcquisitionVia {
	return value === "waiver" || value === "freeAgent";
}

export function loadAcquisitions(league: RawLeague, v: ValidationCollector): Acquisitions {
	const path = join(RAW_DATA_DIR, league.folderName, ACQUISITIONS_FILE);
	const result: Acquisitions = new Map();

	if (!existsSync(path)) {
		v.info(
			CODES.HAND_WRITTEN_FILE_ABSENT,
			`Hand-maintained ${ACQUISITIONS_FILE} is not present; undrafted players have no keeper value.`,
			{ league: league.folderName, file: ACQUISITIONS_FILE },
		);
		return result;
	}

	let parsed: AcquisitionsFile;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as AcquisitionsFile;
	} catch (err) {
		v.error(CODES.INVALID_JSON, `${ACQUISITIONS_FILE} could not be parsed: ${(err as Error).message}`, {
			league: league.folderName,
			file: ACQUISITIONS_FILE,
		});
		return result;
	}

	for (const [yearKey, entries] of Object.entries(parsed)) {
		const year = Number(yearKey);
		if (!Number.isInteger(year) || entries === undefined) continue;

		const byPlayer = new Map<string, AcquisitionVia>();
		for (const [playerId, via] of Object.entries(entries)) {
			// An unrecognised value is rejected rather than coerced. Silently reading
			// a typo as "freeAgent" would put a wrong round on the page.
			if (!isVia(via)) {
				v.error(
					CODES.MALFORMED_FIELD,
					`${ACQUISITIONS_FILE}: player ${playerId} in ${yearKey} has acquisition ` +
						`"${String(via)}"; expected "waiver" or "freeAgent".`,
					{ league: league.folderName, year, file: ACQUISITIONS_FILE, field: playerId },
				);
				continue;
			}
			byPlayer.set(playerId, via);
		}
		result.set(year, byPlayer);
	}

	return result;
}
