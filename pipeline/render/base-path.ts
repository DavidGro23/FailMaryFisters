/**
 * The site serves from the custom domain `https://www.failmaryfisters.com/`, so
 * it sits at the domain root and `BASE_PATH` is just `/`.
 *
 * It was previously a GitHub **project** site at
 * `https://davidgro23.github.io/FailMaryFisters/`, where every absolute URL had
 * to carry the repository name as a prefix.
 *
 * **The constant stays, and everything still routes through `url()`.** A literal
 * `/seasons/2025/` happens to be correct today, which is exactly why hardcoding
 * one is a trap: it works now and breaks silently the moment the site moves back
 * under a prefix — a project site again, a staging path, a second league. That
 * migration has already happened once in this direction. Keeping the indirection
 * costs nothing and makes the reverse a one-line change.
 *
 * `npm run serve` mounts `docs/` at the same base so the two environments agree.
 */

export const BASE_PATH = "/";

/**
 * The custom domain, emitted verbatim as `docs/CNAME`.
 *
 * GitHub Pages reads that file to decide which host the site answers on. It is
 * generated rather than hand-placed because `docs/` is build output: a file
 * sitting there uncommitted, or lost to a clean rebuild, silently reverts the
 * site to `davidgro23.github.io` and breaks every shared link.
 */
export const CUSTOM_DOMAIN = "www.failmaryfisters.com";

/**
 * Builds a site-absolute URL. Pass a path relative to the site root, with or
 * without a leading slash:
 *
 *   url("seasons/2025/")    ->  "/seasons/2025/"
 *   url("/assets/site.css") ->  "/assets/site.css"
 *   url("")                 ->  "/"
 *
 * Leading slashes are stripped from `path` before joining, so a `BASE_PATH` of
 * `/` cannot produce a protocol-relative `//host` URL.
 */
export function url(path: string): string {
	return BASE_PATH + path.replace(/^\/+/, "");
}
