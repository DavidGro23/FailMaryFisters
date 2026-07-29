/**
 * A small dependency-free record checker.
 *
 * Deliberately not zod: CLAUDE.md wants pipeline dependencies near zero, and
 * the rules here are narrow enough that a schema library would be more code to
 * understand, not less.
 *
 * Severity policy (from the stage-1 plan):
 *   - missing required field / wrong primitive type  -> error
 *   - unknown field present                          -> warning (the export may drift)
 *   - value outside a known enum                     -> warning (a future season may add one)
 *   - malformed pattern (e.g. matchupId)             -> error
 */

import { CODES, type IssueLocation, type ValidationCollector } from "./validation.ts";

export type FieldType = "string" | "number" | "boolean" | "object" | "array";

export interface FieldSpec {
	type: FieldType;
	/** Explicit `null` is a legal value (only `coManagerName` / `coUserId`). */
	nullable?: boolean;
	/** Value must be an integer. */
	integer?: boolean;
	/** Known-good values. Anything else is a warning, never an error. */
	enum?: readonly string[];
	/** Must match. Failure is an error. */
	pattern?: RegExp;
}

export type RecordSpec = Record<string, FieldSpec>;

function typeOf(value: unknown): FieldType | "null" | "undefined" {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (Array.isArray(value)) return "array";
	const t = typeof value;
	if (t === "string" || t === "number" || t === "boolean" || t === "object") return t;
	return "object";
}

/**
 * Validates one record against a spec. Returns true if the record is
 * structurally sound enough to use (i.e. produced no errors).
 */
export function checkRecord(
	spec: RecordSpec,
	record: unknown,
	where: IssueLocation,
	v: ValidationCollector,
): boolean {
	if (typeOf(record) !== "object") {
		v.error(CODES.NOT_AN_OBJECT, `Expected an object, got ${typeOf(record)}.`, where);
		return false;
	}

	const obj = record as Record<string, unknown>;
	let ok = true;

	for (const [field, fieldSpec] of Object.entries(spec)) {
		const at: IssueLocation = { ...where, field };
		const value = obj[field];

		if (!(field in obj) || value === undefined) {
			v.error(CODES.MISSING_REQUIRED_FIELD, `Required field "${field}" is missing.`, at);
			ok = false;
			continue;
		}

		if (value === null) {
			if (!fieldSpec.nullable) {
				v.error(CODES.WRONG_FIELD_TYPE, `Field "${field}" is null but is not nullable.`, at);
				ok = false;
			}
			continue;
		}

		const actual = typeOf(value);
		if (actual !== fieldSpec.type) {
			v.error(
				CODES.WRONG_FIELD_TYPE,
				`Field "${field}" should be ${fieldSpec.type}, got ${actual}.`,
				at,
			);
			ok = false;
			continue;
		}

		if (fieldSpec.type === "number") {
			const n = value as number;
			if (!Number.isFinite(n)) {
				v.error(CODES.WRONG_FIELD_TYPE, `Field "${field}" is not a finite number.`, at);
				ok = false;
				continue;
			}
			if (fieldSpec.integer && !Number.isInteger(n)) {
				v.error(CODES.WRONG_FIELD_TYPE, `Field "${field}" should be an integer, got ${n}.`, at);
				ok = false;
				continue;
			}
		}

		if (fieldSpec.type === "string") {
			const s = value as string;
			if (fieldSpec.pattern && !fieldSpec.pattern.test(s)) {
				v.error(
					CODES.MALFORMED_FIELD,
					`Field "${field}" does not match ${String(fieldSpec.pattern)}: ${JSON.stringify(s)}.`,
					at,
				);
				ok = false;
				continue;
			}
			if (fieldSpec.enum && !fieldSpec.enum.includes(s)) {
				// Warning, not error: a future season may legitimately introduce a
				// new status or bracket type, and that must not fail the build.
				v.warn(
					CODES.UNEXPECTED_ENUM_VALUE,
					`Field "${field}" has unexpected value ${JSON.stringify(s)}; known values are ${fieldSpec.enum.join(", ")}.`,
					at,
				);
			}
		}
	}

	for (const field of Object.keys(obj)) {
		if (!(field in spec)) {
			v.warn(CODES.UNKNOWN_FIELD, `Unknown field "${field}" is not in the known schema.`, {
				...where,
				field,
			});
		}
	}

	return ok;
}

/**
 * Validates a free-form map (`stats`, `rosterPositions`, scoring blocks).
 *
 * Only the value type is checked, never the key set: the keys demonstrably
 * drift between seasons (25 stat keys in 2017-2018, 19 in 2019-2024, 11 in
 * 2025), so an allow-list would fail on legitimate data.
 */
export function checkValueMap(
	value: unknown,
	valueType: "number" | "string",
	where: IssueLocation,
	v: ValidationCollector,
): boolean {
	if (typeOf(value) !== "object") {
		v.error(CODES.WRONG_FIELD_TYPE, `Expected an object map, got ${typeOf(value)}.`, where);
		return false;
	}
	let ok = true;
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (typeof entry !== valueType || (valueType === "number" && !Number.isFinite(entry))) {
			v.error(
				CODES.WRONG_FIELD_TYPE,
				`Map entry "${key}" should be ${valueType}, got ${typeOf(entry)}.`,
				where,
			);
			ok = false;
		}
	}
	return ok;
}

/** Parses a JSON array file, reporting rather than throwing. Returns null if unusable. */
export function expectArray(
	parsed: unknown,
	where: IssueLocation,
	v: ValidationCollector,
): unknown[] | null {
	if (!Array.isArray(parsed)) {
		v.error(CODES.NOT_AN_ARRAY, `Expected a JSON array at top level, got ${typeOf(parsed)}.`, where);
		return null;
	}
	return parsed;
}

/** IDs are always strings in this export; a number here is a silent join bug waiting to happen. */
export const ID: FieldSpec = { type: "string", pattern: /^\d+$/ };
export const YEAR: FieldSpec = { type: "number", integer: true };
export const COUNT: FieldSpec = { type: "number", integer: true };
export const POINTS: FieldSpec = { type: "number" };
export const TEXT: FieldSpec = { type: "string" };

/** `year-week-lowerTeamId-higherTeamId`. Stage 1 checks the shape and stops there (D-parse). */
export const MATCHUP_ID = /^\d{4}-\d{1,2}-\d+-\d+$/;

/** Observed across all nine seasons. Anything else is a warning. */
export const KNOWN_STATUSES = ["ST", "BN", "RES"] as const;
export const KNOWN_BRACKET_TYPES = ["Championship", "Consolation"] as const;
