/**
 * Templating: plain tagged template literals, no engine, no dependency (§13.3).
 */

/**
 * Escapes `& < > " '` before a value reaches HTML.
 *
 * Mandatory on every interpolated value. This is a correctness concern more than
 * a security one here: player names contain apostrophes (`Ja'Marr Chase`) and
 * team names are free text typed by ten friends.
 */
export function esc(value: string | number): string {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Marks a string as already-safe HTML, exempting it from escaping. */
export interface SafeHtml {
	readonly __html: string;
}

export function raw(value: string): SafeHtml {
	return { __html: value };
}

function isSafe(value: unknown): value is SafeHtml {
	return typeof value === "object" && value !== null && "__html" in value;
}

type Interpolated = string | number | SafeHtml | Interpolated[];

/**
 * `html` escapes every interpolated value unless it is explicitly `raw()` or the
 * result of a nested `html` call. Arrays are joined without separators, so a
 * list of rows can be interpolated directly.
 */
export function html(strings: TemplateStringsArray, ...values: Interpolated[]): SafeHtml {
	let out = strings[0] ?? "";
	for (const [index, value] of values.entries()) {
		out += render(value) + (strings[index + 1] ?? "");
	}
	return raw(out);
}

function render(value: Interpolated): string {
	if (Array.isArray(value)) return value.map(render).join("");
	if (isSafe(value)) return value.__html;
	return esc(value);
}

/** Unwraps to the final string for writing to disk. */
export function toHtml(value: SafeHtml): string {
	return value.__html;
}
