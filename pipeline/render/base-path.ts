/**
 * This site deploys as a GitHub **project** site at
 * `https://davidgro23.github.io/FailMaryFisters/`, so every absolute URL carries
 * the repository name as a prefix. A hardcoded leading `/` works locally and
 * 404s in production, which is exactly the class of bug that only shows up after
 * the link is shared in the group chat.
 *
 * `npm run serve` mounts `dist/` under the same prefix so the two environments
 * agree.
 */

export const BASE_PATH = "/FailMaryFisters/";

/**
 * Builds a site-absolute URL. Pass a path relative to the site root, with or
 * without a leading slash:
 *
 *   url("seasons/2025/")  ->  "/FailMaryFisters/seasons/2025/"
 *   url("/assets/site.css") -> "/FailMaryFisters/assets/site.css"
 */
export function url(path: string): string {
	return BASE_PATH + path.replace(/^\/+/, "");
}
