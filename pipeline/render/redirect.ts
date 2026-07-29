/**
 * A minimal HTML redirect page.
 *
 * Static hosting has no server-side redirects, so a meta refresh plus a real
 * link is the only mechanism available. The link matters: it is what works when
 * the refresh is blocked, and it is what a reader sees if it is slow.
 *
 * §6.5 calls for the same page for retired manager slugs, so this exists once
 * rather than being written twice.
 */

import { url } from "./base-path.ts";
import { html, toHtml } from "./html.ts";

export function renderRedirect(toRoute: string, label: string): string {
	const target = url(toRoute);
	return toHtml(html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<title>Redirecting to ${label}</title>
<link rel="stylesheet" href="${url("assets/site.css")}">
</head>
<body>
<main class="page">
<p class="page-meta">Redirecting to <a href="${target}">${label}</a>.</p>
</main>
</body>
</html>
`);
}
