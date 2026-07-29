/**
 * `npm run serve` — a local static server over `docs/`.
 *
 * Deliberately minimal and dependency-free. It exists to preview the built site,
 * not to emulate GitHub Pages precisely.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { BASE_PATH } from "../render/base-path.ts";
import { OUTPUT_DIR } from "../paths.ts";

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
	".pdf": "application/pdf",
};

if (!existsSync(OUTPUT_DIR)) {
	console.error(`docs/ does not exist yet. Run \`npm run build\` first.`);
	process.exit(1);
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
	const pathname = decodeURIComponent(url.pathname);

	// Production serves under BASE_PATH; mirroring it locally is what makes a
	// missing prefix show up in development instead of after the link is shared
	// (CLAUDE.md, §13.2). On the custom domain BASE_PATH is "/", so this
	// redirect must not fire for the root itself — it would 302 to itself.
	if (BASE_PATH !== "/" && (pathname === "/" || `${pathname}/` === BASE_PATH)) {
		res.writeHead(302, { location: BASE_PATH }).end();
		return;
	}
	if (!pathname.startsWith(BASE_PATH)) {
		res
			.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
			.end(`404 Not Found\n\nThis site is served under ${BASE_PATH}\n`);
		return;
	}

	// `normalize` collapses `..` segments; the prefix check then rejects anything
	// that still points outside docs/.
	const requested = normalize(pathname.slice(BASE_PATH.length)).replace(/^(\.\.[/\\])+/, "");
	let filePath = join(OUTPUT_DIR, requested);

	if (!filePath.startsWith(OUTPUT_DIR)) {
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
	console.log(`Serving ${OUTPUT_DIR} at http://localhost:${PORT}${BASE_PATH}`);
});
