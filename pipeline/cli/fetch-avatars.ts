/**
 * `npm run fetch:avatars` — the ONLY script in this repository that touches the
 * network, and it is run by hand.
 *
 * Rule 19 / NFR-8 / D10: avatars are downloaded once into
 * `raw-data/<leagueFolder>/assets/`, committed, and referenced locally. The
 * build never fetches anything — it reads the committed files and nothing else,
 * which is what keeps it offline and deterministic (NFR-9).
 *
 * Re-run this only when a new season is added or someone changes their avatar.
 * Existing files are left alone unless --force is passed.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadRawData } from "../load/index.ts";
import { RAW_DATA_DIR } from "../paths.ts";
import {
	AVATAR_MANIFEST,
	avatarKey,
	fileNameForUrl,
	isPlaceholderAvatar,
	readManifest,
	type AvatarManifest,
} from "../avatars.ts";

const force = process.argv.includes("--force");

/**
 * The export requests 40x40, which is soft on a 2x display for a 24px box.
 * Try a larger render first and fall back to exactly what the export says —
 * the resize query is not a documented API, so this probes rather than assumes.
 */
function upgraded(rawUrl: string): string | null {
	const url = new URL(rawUrl);
	if (!url.searchParams.has("x")) return null;
	url.searchParams.set("x", "96");
	url.searchParams.set("y", "96");
	return url.toString();
}

interface Download {
	bytes: Buffer | null;
	/** 0 when the request never completed (DNS, TLS, offline). */
	status: number;
}

async function download(url: string): Promise<Download> {
	try {
		const response = await fetch(url);
		if (!response.ok) return { bytes: null, status: response.status };
		const type = response.headers.get("content-type") ?? "";
		if (!type.startsWith("image/")) return { bytes: null, status: response.status };
		const bytes = Buffer.from(await response.arrayBuffer());
		return { bytes: bytes.byteLength > 0 ? bytes : null, status: response.status };
	} catch {
		return { bytes: null, status: 0 };
	}
}

const load = loadRawData(RAW_DATA_DIR);
if (!load.ok) {
	console.error("Load stage reported errors; fix those before fetching avatars.");
	process.exit(1);
}

for (const league of load.leagues) {
	const assetsDir = join(RAW_DATA_DIR, league.folderName, "assets");
	mkdirSync(assetsDir, { recursive: true });

	// (year, teamId) -> the URL the export gives, minus the placeholders.
	const wanted = new Map<string, string>();
	for (const season of league.seasons) {
		for (const manager of season.managers) {
			if (isPlaceholderAvatar(manager.teamImgUrl)) continue;
			wanted.set(avatarKey(season.year, manager.teamId), manager.teamImgUrl);
		}
	}

	// One file per distinct image: the same avatar is reused across seasons, so
	// content-addressed names dedupe nine years of references into one download.
	const distinct = new Map<string, string>();
	for (const rawUrl of wanted.values()) distinct.set(fileNameForUrl(rawUrl), rawUrl);

	console.log("");
	console.log(`${league.folderName}: ${wanted.size} references -> ${distinct.size} distinct images`);
	console.log("");

	let fetched = 0;
	let skipped = 0;
	let transientFailures = 0;
	let upgradedCount = 0;
	const sources = new Map<string, string>();
	const unavailable: Record<string, { status: number; note: string }> = {};

	// Carry forward what a previous run already established is gone, so a
	// permanent 404 is not re-probed on every run.
	const previous = readManifest(assetsDir);
	if (!force) Object.assign(unavailable, previous.unavailable);

	for (const [fileName, rawUrl] of [...distinct].sort(([a], [b]) => (a < b ? -1 : 1))) {
		const target = join(assetsDir, fileName);

		if (existsSync(target) && !force) {
			skipped++;
			sources.set(fileName, rawUrl);
			continue;
		}
		if (unavailable[rawUrl] && !force) continue;

		const larger = upgraded(rawUrl);
		let attempt = larger ? await download(larger) : { bytes: null, status: 0 };
		let source = larger ?? rawUrl;

		if (!attempt.bytes) {
			attempt = await download(rawUrl);
			source = rawUrl;
		} else if (larger) {
			upgradedCount++;
		}

		if (!attempt.bytes) {
			if (attempt.status === 404) {
				// Gone for good. Record it, fall back to an initial, do not fail.
				unavailable[rawUrl] = {
					status: 404,
					note: "CDN no longer serves this asset; the team falls back to an initial.",
				};
				console.log(`  GONE     ${fileName}  404 — recorded, will not be retried`);
			} else {
				console.log(`  FAILED   ${fileName}  status ${attempt.status} <- ${rawUrl}`);
				transientFailures++;
			}
			continue;
		}

		delete unavailable[rawUrl];
		writeFileSync(target, attempt.bytes);
		sources.set(fileName, source);
		fetched++;
		console.log(`  ok       ${fileName}  ${String(attempt.bytes.byteLength).padStart(7)} bytes`);
	}

	// The manifest is the build's only input. Deciding "placeholder or not" here,
	// once, keeps that judgement in a reviewable committed file instead of
	// re-deriving it by URL sniffing on every render.
	const avatars: Record<string, { file: string; source: string }> = {};
	for (const [key, rawUrl] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
		const file = fileNameForUrl(rawUrl);
		if (!existsSync(join(assetsDir, file))) continue;
		avatars[key] = { file, source: sources.get(file) ?? rawUrl };
	}

	const manifest: AvatarManifest = {
		avatars,
		unavailable: Object.fromEntries(Object.entries(unavailable).sort(([a], [b]) => (a < b ? -1 : 1))),
	};
	writeFileSync(join(assetsDir, AVATAR_MANIFEST), `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");

	const onDisk = readdirSync(assetsDir).filter((f) => f !== AVATAR_MANIFEST).length;
	const goneCount = Object.keys(manifest.unavailable).length;

	console.log("");
	console.log(`  fetched ${fetched}   skipped ${skipped}   gone ${goneCount}   failed ${transientFailures}`);
	if (upgradedCount > 0) console.log(`  ${upgradedCount} served at 96x96; the rest at the size the export requested`);
	console.log(`  ${onDisk} image(s) in ${assetsDir}`);
	console.log(`  wrote ${join(assetsDir, AVATAR_MANIFEST)} (${Object.keys(avatars).length} entries)`);
	for (const [gone, info] of Object.entries(manifest.unavailable)) {
		console.log(`  gone: ${gone} (${info.status})`);
	}
	console.log("");

	// A 404 is permanent and already handled by the fallback, so it is reported
	// but not treated as a failure. Anything else might be transient and should
	// stop the run so it gets retried rather than silently losing an avatar.
	if (transientFailures > 0) {
		console.error(`${transientFailures} image(s) failed for non-404 reasons; re-run to retry.`);
		process.exit(1);
	}
}
