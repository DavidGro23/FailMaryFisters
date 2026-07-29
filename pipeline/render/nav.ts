/**
 * Site navigation.
 *
 * One set of markup for both layouts — CSS moves it from a bottom bar on mobile
 * to a top band at >=900px. It is never duplicated in the DOM, and it needs no
 * JavaScript: two plain links, with `aria-current="page"` marking the active one.
 */

import { url } from "./base-path.ts";
import { html, type SafeHtml } from "./html.ts";

/** The season the "Seasons" nav item points at. */
export const DEFAULT_SEASON = 2025;

/**
 * The team the "Teams" nav item opens on. There is no index list — the nav goes
 * straight to a profile, and the switcher on that page selects another.
 * Must match a slug in `manager-aliases.json`.
 *
 * Note the vocabulary split: the site says "Teams" because that is what the
 * league calls them, while the code says Manager throughout because identity is
 * `userId` — a person, not a franchise. `teamId` 5 alone covers three separate
 * careers, so naming the model after the team would reintroduce exactly the
 * confusion D1 warns about.
 */
export const DEFAULT_MANAGER_SLUG = "saintology";

export function seasonRoute(year: number): string {
	return `seasons/${year}/`;
}

/** Slugs are frozen in `manager-aliases.json`, so these URLs never change (D16). */
export function managerRoute(slug: string): string {
	return `teams/${slug}/`;
}

/**
 * A draft board. Without a slug this is the season's landing spot, which
 * redirects to whichever team held the first pick.
 */
export function draftRoute(year: number, slug?: string): string {
	return slug === undefined ? `drafts/${year}/` : `drafts/${year}/${slug}/`;
}

/** Where `/teams/<slug>/` used to live. Kept as redirects so old links survive. */
export function legacyManagerRoute(slug: string): string {
	return `managers/${slug}/`;
}

export const ROUTES = {
	/** The site root. `url("")` resolves to BASE_PATH itself. */
	home: "",
	seasons: seasonRoute(DEFAULT_SEASON),
	allTime: "all-time/",
	managers: managerRoute(DEFAULT_MANAGER_SLUG),
	drafts: draftRoute(DEFAULT_SEASON),
	rulebook: "rulebook/",
} as const;

/** Bare `/drafts/`, redirecting to the default season. */
export const DRAFTS_INDEX_ROUTE = "drafts/";

/** Bare `/teams/`, kept as a redirect so the tidy URL still resolves. */
export const TEAMS_INDEX_ROUTE = "teams/";
export const LEGACY_TEAMS_INDEX_ROUTE = "managers/";

export type RouteKey = keyof typeof ROUTES;

/**
 * Six items — one past the five §12.3 recommends for the mobile bottom bar.
 * That was a deliberate call: Drafts is a top-level section people look for in
 * the nav, not something to hunt for on a season page. The bar's type size drops
 * a step below 900px to keep six labels legible at 360px; a seventh would not
 * fit and would need a different pattern.
 */
const ITEMS: Array<{ key: RouteKey; label: string }> = [
	{ key: "home", label: "Home" },
	{ key: "seasons", label: "Seasons" },
	{ key: "drafts", label: "Drafts" },
	{ key: "managers", label: "Teams" },
	{ key: "allTime", label: "All-time" },
	{ key: "rulebook", label: "Rulebook" },
];

/**
 * `aria-current="page"` marks the active section. On a season page other than
 * the default the link points at 2025 rather than the page you are on, so this
 * is a section marker; the per-year switcher below it carries the exact-page
 * `aria-current`.
 */
export function renderNav(active: RouteKey): SafeHtml {
	return html`<nav class="nav" aria-label="Main">
<div class="nav-inner">
${ITEMS.map((item) =>
		item.key === active
			? html`<a class="nav-link" href="${url(ROUTES[item.key])}" aria-current="page">${item.label}</a>`
			: html`<a class="nav-link" href="${url(ROUTES[item.key])}">${item.label}</a>`,
	)}
</div>
</nav>`;
}
