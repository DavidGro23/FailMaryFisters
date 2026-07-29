/**
 * The rulebook.
 *
 * Rendered from the committed transcription of the league's PDF. The rules are
 * not in the NFL export and cannot be derived (§6.4), so nothing here is
 * generated — it is the league's own document, reproduced.
 */

import type {
	Rulebook,
	RulebookBlock,
	RulebookHeading,
	RulebookImage,
	RulebookList,
	RulebookTable,
} from "../normalize/rulebook.ts";
import { url } from "./base-path.ts";
import { html, type SafeHtml } from "./html.ts";
import { renderPage } from "./page.ts";

export function renderRulebookPage(rulebook: Rulebook | null): string {
	if (!rulebook) {
		return renderPage({
			title: "Rulebook — Fail Mary Fisters",
			heading: "Rulebook",
			meta: "League rules",
			active: "rulebook",
			body: html`<section>
<p class="section-note">Nothing here yet — this page is waiting to be written.</p>
</section>`,
		});
	}

	return renderPage({
		title: "Rulebook — Fail Mary Fisters",
		heading: "Rulebook",
		meta: `${rulebook.title} · version ${rulebook.version}`,
		active: "rulebook",
		body: html`<section>
<p class="section-note">Reproduced from the league's rulebook PDF. <a href="${url("assets/rulebook/rulebook.pdf")}">Download the original →</a></p>
${renderContents(rulebook)}
</section>
<section class="rulebook">
${rulebook.blocks.map(renderBlock)}
</section>`,
	});
}

interface ContentsEntry {
	heading: RulebookHeading;
	children: RulebookHeading[];
}

/**
 * A table of contents down to subsection level, built from the document itself.
 *
 * The PDF's own contents page is not transcribed — its page numbers mean nothing
 * here — so this is generated instead and cannot fall out of step with the text.
 * Deeper headings (the 2.3.1.1-style scoring sub-headings) are left out: they
 * label rows inside a table rather than places worth jumping to.
 */
function renderContents(rulebook: Rulebook): SafeHtml {
	const entries: ContentsEntry[] = [];

	for (const block of rulebook.blocks) {
		if (block.type !== "heading") continue;
		if (block.level <= 2) entries.push({ heading: block, children: [] });
		else if (block.level === 3) entries[entries.length - 1]?.children.push(block);
	}

	if (entries.length === 0) return html``;

	return html`<nav class="toc" aria-label="Rulebook contents">
<h2 class="section-title">Contents</h2>
<ol class="toc-list">
${entries.map(renderContentsEntry)}
</ol>
</nav>`;
}

function renderContentsEntry(entry: ContentsEntry): SafeHtml {
	return html`<li class="toc-item">
<a class="toc-link" href="#${headingId(entry.heading)}">${label(entry.heading)}</a>
${
		entry.children.length === 0
			? html``
			: html`<ol class="toc-sub">
${entry.children.map(
					(child) =>
						html`<li><a class="toc-link toc-link-sub" href="#${headingId(child)}">${label(child)}</a></li>`,
				)}
</ol>`
	}
</li>`;
}

function label(heading: RulebookHeading): string {
	return heading.number === undefined ? heading.text : `${heading.number} ${heading.text}`;
}

/**
 * A stable anchor. The document numbers two different sections "1.", so the
 * text is part of the id — numbering alone would collide.
 */
function headingId(heading: RulebookHeading): string {
	return `s-${`${heading.number ?? ""} ${heading.text}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")}`;
}

function renderBlock(block: RulebookBlock): SafeHtml {
	switch (block.type) {
		case "heading":
			return renderHeading(block);
		case "paragraph":
			return block.emphasis === "shout"
				? html`<p class="rulebook-p rulebook-shout">${block.text}</p>`
				: html`<p class="rulebook-p">${block.text}</p>`;
		case "list":
			return renderList(block);
		case "table":
			return renderTable(block);
		case "image":
			return renderImage(block);
	}
}

function renderHeading(heading: RulebookHeading): SafeHtml {
	const id = headingId(heading);
	const text = label(heading);

	// Levels beyond h4 stay as h4 with a class, rather than emitting h5/h6 for a
	// document that only nests this deep in the scoring tables.
	if (heading.level <= 2) return html`<h2 class="rulebook-h2" id="${id}">${text}</h2>`;
	if (heading.level === 3) return html`<h3 class="rulebook-h3" id="${id}">${text}</h3>`;
	return html`<h4 class="rulebook-h4" id="${id}">${text}</h4>`;
}

function renderList(list: RulebookList): SafeHtml {
	const items = list.items.map((item) => html`<li>${item}</li>`);
	return list.ordered === true
		? html`<ol class="rulebook-list">${items}</ol>`
		: html`<ul class="rulebook-list">${items}</ul>`;
}

function renderTable(table: RulebookTable): SafeHtml {
	return html`<div class="rulebook-table-wrap">
<table class="rulebook-table">
${table.caption === undefined ? html`` : html`<caption>${table.caption}</caption>`}
<thead>
<tr>${table.columns.map((c) => html`<th scope="col">${c}</th>`)}</tr>
</thead>
<tbody>
${table.rows.map((row) => html`<tr>${row.map((cell) => html`<td>${cell}</td>`)}</tr>`)}
</tbody>
</table>
</div>`;
}

function renderImage(image: RulebookImage): SafeHtml {
	return html`<figure class="rulebook-figure">
<img src="${url(`assets/rulebook/${image.file}`)}" alt="${image.alt}" loading="lazy" decoding="async">
${image.caption === undefined ? html`` : html`<figcaption>${image.caption}</figcaption>`}
</figure>`;
}
