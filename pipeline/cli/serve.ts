/**
 * `npm run serve` — a local static server over `dist/`.
 *
 * Deliberately minimal and dependency-free. It exists to preview the built site,
 * not to emulate GitHub Pages precisely.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { DIST_DIR } from "../paths.ts";

const PORT = Number(process.env["PORT"] ?? 8080);

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
};

if (!existsSync(DIST_DIR)) {
	console.error(`dist/ does not exist yet. Run \`npm run build:data\` first.`);
	process.exit(1);
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

	// `normalize` collapses `..` segments; the prefix check then rejects anything
	// that still points outside dist/.
	const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
	let filePath = join(DIST_DIR, requested);

	if (!filePath.startsWith(DIST_DIR)) {
		res.writeHead(403).end("Forbidden");
		return;
	}

	// Routes are emitted as `<route>/index.html` so URLs need no extension.
	if (existsSync(filePath) && statSync(filePath).isDirectory()) {
		filePath = join(filePath, "index.html");
	}

	if (!existsSync(filePath)) {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 Not Found");
		return;
	}

	res.writeHead(200, { "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream" });
	createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
	console.log(`Serving ${DIST_DIR} at http://localhost:${PORT}/`);
});
