/**
 * Number and record formatting.
 *
 * Every formatter pins `en-US` explicitly. `toLocaleString()` without a locale
 * renders 1848.60 as "1.848,60" on a German browser, so the ten league members
 * would see different numbers depending on their device (§13.1). The formatters
 * are created once and reused.
 */

const POINTS = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const PERCENT = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

/** Points always carry two decimals. */
export function points(value: number): string {
	return POINTS.format(value);
}

/** Percentages carry one decimal. Takes a fraction (0.8), renders "80.0". */
export function percent(fraction: number): string {
	return PERCENT.format(fraction * 100);
}

/**
 * A win-loss record, with an en dash rather than a hyphen (§13.1).
 * Draws are omitted when there are none: "12–3", but "7–6–1" when there are.
 */
export function record(wins: number, losses: number, draws: number): string {
	const parts = draws > 0 ? [wins, losses, draws] : [wins, losses];
	return parts.join("–");
}
