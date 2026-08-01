/**
 * `docs/robots.txt`.
 *
 * **This is advisory and cannot prevent scraping.** robots.txt is a request that
 * well-behaved crawlers honour voluntarily; anything determined to copy the site
 * simply ignores it, and nothing in the format can stop that. The site is public
 * because it needs no login, not because it wants an audience — unlisted, not
 * secret (§13.2).
 *
 * `User-agent: * / Disallow: /` already covers every compliant crawler, so the
 * named agents below are strictly redundant for anything that reads the file
 * correctly. They are listed anyway for two reasons: several operators publish
 * their token as *the* way to opt out and check for it specifically, and a named
 * rule records intent explicitly rather than relying on a wildcard being read
 * the way it is meant.
 *
 * Real prevention would need the site behind authentication, which GitHub Pages
 * cannot do. See the note in §13.2.
 */

/**
 * Crawlers that collect content for search indexes, AI training corpora, or
 * commercial SEO datasets. Kept sorted so the emitted file is deterministic
 * (NFR-9) and additions are easy to spot in a diff.
 */
const NAMED_AGENTS: readonly string[] = [
	"AI2Bot",
	"Amazonbot",
	"anthropic-ai",
	"Applebot-Extended",
	"Bytespider",
	"CCBot",
	"ChatGPT-User",
	"Claude-SearchBot",
	"Claude-Web",
	"ClaudeBot",
	"cohere-ai",
	"cohere-training-data-crawler",
	"Diffbot",
	"FacebookBot",
	"Google-Extended",
	"GPTBot",
	"ImagesiftBot",
	"meta-externalagent",
	"OAI-SearchBot",
	"omgili",
	"omgilibot",
	"PerplexityBot",
	"Perplexity-User",
	"Timpibot",
	"YouBot",
];

/** Crawlers whose only purpose is harvesting sites for commercial link data. */
const SEO_AGENTS: readonly string[] = [
	"AhrefsBot",
	"BLEXBot",
	"DataForSeoBot",
	"dotbot",
	"MJ12bot",
	"PetalBot",
	"rogerbot",
	"SemrushBot",
	"SeznamBot",
];

function block(agents: readonly string[]): string {
	return agents.map((agent) => `User-agent: ${agent}\nDisallow: /\n`).join("\n");
}

export function renderRobotsTxt(): string {
	return [
		"# Fail Mary Fisters — a private league's record book.",
		"#",
		"# Nothing here is for indexing, training, or republication. Every page also",
		"# carries <meta name=\"robots\" content=\"noindex\">.",
		"#",
		"# Note that this file is a request, not a control: it is honoured only by",
		"# crawlers that choose to.",
		"",
		"User-agent: *",
		"Disallow: /",
		"",
		"# Named explicitly, because several operators treat their own token as the",
		"# documented way to opt out.",
		"",
		block(NAMED_AGENTS),
		"# Commercial SEO and link-graph harvesters.",
		"",
		block(SEO_AGENTS),
	].join("\n");
}
