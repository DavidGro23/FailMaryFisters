/**
 * The league rulebook, transcribed from the PDF the league maintains.
 *
 * Hand-maintained, like `manager-aliases.json` — the rules are not in the NFL
 * export and cannot be derived (§6.4). The build only ever reads the committed
 * transcription; it never parses the PDF, which keeps it offline, deterministic,
 * and free of a PDF dependency.
 *
 * Absence is not an error: the page renders a placeholder instead.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CODES, type ValidationCollector } from "../load/validation.ts";
import type { RawLeague } from "../load/types.ts";
import { RAW_DATA_DIR } from "../paths.ts";

export interface RulebookHeading {
	type: "heading";
	level: number;
	number?: string;
	text: string;
}

export interface RulebookParagraph {
	type: "paragraph";
	text: string;
	/**
	 * `"shout"` marks the league's sign-off line, which the document sets apart
	 * and which the page renders bold and red.
	 */
	emphasis?: "shout";
}

export interface RulebookList {
	type: "list";
	ordered?: boolean;
	items: string[];
}

export interface RulebookTable {
	type: "table";
	caption?: string;
	columns: string[];
	rows: string[][];
}

export interface RulebookImage {
	type: "image";
	file: string;
	alt: string;
	caption?: string;
}

export type RulebookBlock =
	| RulebookHeading
	| RulebookParagraph
	| RulebookList
	| RulebookTable
	| RulebookImage;

export interface Rulebook {
	title: string;
	version: string;
	source: string;
	sourceNote?: string;
	blocks: RulebookBlock[];
}

export const RULEBOOK_DIR = "rulebook";
const RULEBOOK_FILE = "rulebook.json";

export function rulebookDir(league: string): string {
	return join(RAW_DATA_DIR, league, RULEBOOK_DIR);
}

export function loadRulebook(league: RawLeague, v: ValidationCollector): Rulebook | null {
	const path = join(rulebookDir(league.folderName), RULEBOOK_FILE);

	if (!existsSync(path)) {
		v.info(CODES.HAND_WRITTEN_FILE_ABSENT, `No rulebook transcription; the rulebook page is empty.`, {
			league: league.folderName,
			file: `${RULEBOOK_DIR}/${RULEBOOK_FILE}`,
		});
		return null;
	}

	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Rulebook;
		if (!Array.isArray(parsed.blocks)) throw new Error("`blocks` is not an array");
		return parsed;
	} catch (err) {
		v.error(CODES.INVALID_JSON, `Rulebook could not be parsed: ${(err as Error).message}`, {
			league: league.folderName,
			file: `${RULEBOOK_DIR}/${RULEBOOK_FILE}`,
		});
		return null;
	}
}
