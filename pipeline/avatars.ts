/**
 * Shared avatar vocabulary: used by the manual fetch script and by the offline
 * build, so both agree on what counts as an avatar and what a file is called.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Written into `raw-data/<leagueFolder>/assets/` and committed. */
export const AVATAR_MANIFEST = "avatars.json";

export interface AvatarEntry {
	/** File name within the league's `assets/` directory. */
	file: string;
	/** The URL it was actually fetched from, for traceability. */
	source: string;
}

export interface UnavailableAvatar {
	status: number;
	note: string;
}

export interface AvatarManifest {
	/** Keyed by `"<year>:<teamId>"`. Teams with no avatar are simply absent. */
	avatars: Record<string, AvatarEntry>;
	/**
	 * URLs the CDN no longer serves, keyed by URL.
	 *
	 * Recorded so the fetch script does not retry them on every run and does not
	 * report a permanent, already-handled condition as a failure. Known case:
	 * `OAK_1.png` returns 404 because the Raiders relocated and NFL removed the
	 * Oakland asset — precisely the rot D10 warned about, which is why these are
	 * vendored rather than hotlinked.
	 */
	unavailable: Record<string, UnavailableAvatar>;
}

export const EMPTY_MANIFEST: AvatarManifest = { avatars: {}, unavailable: {} };

export function avatarKey(year: number, teamId: string): string {
	return `${year}:${teamId}`;
}

/**
 * Reads a league's committed manifest.
 *
 * Absence is not an error: a fresh clone that has never run `fetch:avatars`
 * must still build, with every team falling back to an initial.
 */
export function readManifest(assetsDir: string): AvatarManifest {
	const path = join(assetsDir, AVATAR_MANIFEST);
	if (!existsSync(path)) return EMPTY_MANIFEST;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AvatarManifest>;
		return {
			avatars: parsed.avatars ?? {},
			unavailable: parsed.unavailable ?? {},
		};
	} catch {
		return EMPTY_MANIFEST;
	}
}

/**
 * `DEF.png` is NFL Fantasy's generic "no avatar chosen" placeholder — 25 of the
 * 90 records across nine seasons.
 *
 * It is deliberately matched by exact file name rather than by host or
 * directory: `OAK_1.png`, `NO_1.png` and `NO_2.png` sit in the *same* directory
 * on the *same* host but are real avatars a manager picked from NFL's stock
 * gallery (Daniel's Raiders logo, Benjamin's two Saints logos). Treating the
 * whole `static.www.nfl.com` path as placeholder would silently discard them.
 */
export function isPlaceholderAvatar(teamImgUrl: string): boolean {
	return new URL(teamImgUrl).pathname.endsWith("/DEF.png");
}

/**
 * A stable, content-addressed file name.
 *
 * Custom uploads are already named by a 32-hex content hash, and the same image
 * is reused across seasons — Felix's avatar covers all nine — so this dedupes
 * naturally and keeps the fetch idempotent.
 */
export function fileNameForUrl(teamImgUrl: string): string {
	const name = new URL(teamImgUrl).pathname.split("/").pop() ?? "";
	if (!/^[A-Za-z0-9_.-]+$/.test(name) || !name.includes(".")) {
		throw new Error(`Unexpected avatar URL shape: ${teamImgUrl}`);
	}
	return name;
}
