/**
 * The validation report: the pipeline's honest account of what it could not
 * resolve. Written to `docs/_validation.json` and surfaced on `/about/`.
 */

export type Severity = "error" | "warning" | "info";

/** Stable, machine-readable issue identities. Tests assert on these, not on messages. */
export const CODES = {
	// Structural
	UNREADABLE_FILE: "unreadable-file",
	INVALID_JSON: "invalid-json",
	NOT_AN_ARRAY: "not-an-array",
	MISSING_FILE: "missing-file",
	UNEXPECTED_FILE: "unexpected-file",
	SEASON_SKIPPED: "season-skipped",
	NO_LEAGUE_FOLDER: "no-league-folder",
	UNEXPECTED_ENTRY: "unexpected-entry",

	// Record-level schema
	NOT_AN_OBJECT: "not-an-object",
	MISSING_REQUIRED_FIELD: "missing-required-field",
	WRONG_FIELD_TYPE: "wrong-field-type",
	MALFORMED_FIELD: "malformed-field",
	UNKNOWN_FIELD: "unknown-field",
	UNEXPECTED_ENUM_VALUE: "unexpected-enum-value",
	EMPTY_FIELD: "empty-field",

	// Cross-file / semantic
	UNRESOLVED_TEAM_ID: "unresolved-team-id",
	YEAR_MISMATCH: "year-mismatch",
	DUPLICATE_PLAYER_ID: "duplicate-player-id",
	PLAYER_NOT_IN_REGISTRY: "player-not-in-registry",
	SETTINGS_RECORD_COUNT: "settings-record-count",

	// Expected-absence notices
	HAND_WRITTEN_FILE_ABSENT: "hand-written-file-absent",

	// Normalize (stage 2)
	SEASON_NOT_FOUND: "season-not-found",
	INCONSISTENT_GAME_COUNT: "inconsistent-game-count",
	POINTS_FOR_MISMATCH: "points-for-mismatch",
	DISPLAY_NAME_COLLISION: "display-name-collision",
	UNRESOLVED_MANAGER: "unresolved-manager",
	AVATAR_MISSING: "avatar-missing",
	NO_PLAYOFF_BRACKET: "no-playoff-bracket",
	PLAYOFF_SHAPE_UNEXPECTED: "playoff-shape-unexpected",
	SLUG_NOT_FROZEN: "slug-not-frozen",
	PLAYER_SCORE_SIGN_CORRECTED: "player-score-sign-corrected",
	PLAYER_NOT_RESOLVED: "player-not-resolved",
} as const;

export type Code = (typeof CODES)[keyof typeof CODES];

export interface IssueLocation {
	league: string;
	year?: number;
	file?: string;
	recordIndex?: number;
	field?: string;
}

/** Later stages append "aggregate" | "render" as they gain checks of their own. */
export type Stage = "load" | "normalize";

export interface ValidationIssue extends IssueLocation {
	stage: Stage;
	severity: Severity;
	code: Code;
	message: string;
}

export interface ValidationReport {
	issues: ValidationIssue[];
	summary: {
		errors: number;
		warnings: number;
		infos: number;
		byCode: Record<string, number>;
	};
}

/**
 * Collects issues without ever throwing. Stage 1 parses everything and reports
 * everything, so a single run surfaces the whole picture rather than the first
 * problem it hits.
 */
export class ValidationCollector {
	readonly issues: ValidationIssue[] = [];
	readonly stage: Stage;

	constructor(stage: Stage = "load") {
		this.stage = stage;
	}

	add(severity: Severity, code: Code, message: string, where: IssueLocation): void {
		// Built explicitly rather than spread so `exactOptionalPropertyTypes` is
		// satisfied: absent keys must be absent, not present-and-undefined.
		const issue: ValidationIssue = {
			stage: this.stage,
			severity,
			code,
			message,
			league: where.league,
		};
		if (where.year !== undefined) issue.year = where.year;
		if (where.file !== undefined) issue.file = where.file;
		if (where.recordIndex !== undefined) issue.recordIndex = where.recordIndex;
		if (where.field !== undefined) issue.field = where.field;
		this.issues.push(issue);
	}

	error(code: Code, message: string, where: IssueLocation): void {
		this.add("error", code, message, where);
	}

	warn(code: Code, message: string, where: IssueLocation): void {
		this.add("warning", code, message, where);
	}

	info(code: Code, message: string, where: IssueLocation): void {
		this.add("info", code, message, where);
	}

	get errorCount(): number {
		return this.issues.filter((i) => i.severity === "error").length;
	}

	report(): ValidationReport {
		return buildReport(this.issues);
	}
}

/**
 * Deterministic ordering (NFR-9): identical input must produce a byte-identical
 * report regardless of filesystem or iteration order — or of which stage
 * contributed which issue.
 */
export function buildReport(issues: readonly ValidationIssue[]): ValidationReport {
	const sorted = [...issues].sort(compareIssues);
	const byCode: Record<string, number> = {};
	for (const issue of sorted) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;

	return {
		issues: sorted,
		summary: {
			errors: sorted.filter((i) => i.severity === "error").length,
			warnings: sorted.filter((i) => i.severity === "warning").length,
			infos: sorted.filter((i) => i.severity === "info").length,
			// Key order is insertion order; sort it so the JSON is stable.
			byCode: Object.fromEntries(Object.entries(byCode).sort(([a], [b]) => cmp(a, b))),
		},
	};
}

function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function compareIssues(a: ValidationIssue, b: ValidationIssue): number {
	return (
		cmp(a.league, b.league) ||
		(a.year ?? -1) - (b.year ?? -1) ||
		cmp(a.file ?? "", b.file ?? "") ||
		(a.recordIndex ?? -1) - (b.recordIndex ?? -1) ||
		cmp(a.code, b.code) ||
		cmp(a.field ?? "", b.field ?? "") ||
		// Stage is a tiebreaker, not a grouping key: issues about the same record
		// belong together regardless of which stage noticed them.
		cmp(a.stage, b.stage) ||
		cmp(a.message, b.message)
	);
}

/** No `generatedAt` field: a timestamp would break NFR-9's byte-identical guarantee. */
export function serializeReport(report: ValidationReport): string {
	return `${JSON.stringify(report, null, "\t")}\n`;
}
