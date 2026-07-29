/**
 * The championship bracket as a tree.
 *
 * Markup is a plain list of rounds, so it reads correctly as a document with no
 * CSS at all. CSS then stacks it on a phone and draws the connectors that make
 * it look like a bracket from 600px up — the tree shape is decoration over an
 * already-meaningful structure, never the thing carrying the meaning.
 */

import type { BracketGame, BracketSide, BracketView } from "../aggregate/playoffs.ts";
import { points } from "./format.ts";
import { html, type SafeHtml } from "./html.ts";
import { renderTeamCell, type TeamCell } from "./page.ts";

export function renderBracket(view: BracketView): SafeHtml {
	return html`<section class="bracket-section">
<h2 class="section-title">Playoffs</h2>
<p class="section-note">Champion: <strong class="champion">${view.championName}</strong>. Seeds in brackets; the winner of each game is highlighted.</p>

<div class="bracket">
<div class="bracket-round">
<h3 class="bracket-round-title">Semifinals</h3>
${view.semifinals.map((game) => renderGame(game))}
</div>

<div class="bracket-round bracket-round-final">
<h3 class="bracket-round-title">${view.final.label}</h3>
${renderGame(view.final, true)}
</div>
</div>

${renderThirdPlace(view)}
</section>`;
}

function renderThirdPlace(view: BracketView): SafeHtml {
	if (!view.thirdPlace) return html``;
	return html`<div class="bracket-third">
<h3 class="bracket-round-title">${view.thirdPlace.label}</h3>
${renderGame(view.thirdPlace)}
</div>`;
}

function renderGame(game: BracketGame, isFinal = false): SafeHtml {
	const cls = isFinal ? "bracket-game bracket-game-final" : "bracket-game";
	return html`<div class="${cls}">
${game.sides.map((side) => renderSide(side))}
<p class="bracket-meta">Week ${game.week} · margin ${points(game.margin)}</p>
</div>`;
}

/**
 * One team's line. The result is conveyed three ways so it never depends on
 * colour alone: the winner is marked in the text for assistive technology, gets
 * a visible marker, and carries the heavier weight.
 */
function renderSide(side: BracketSide): SafeHtml {
	const cell: TeamCell = { displayName: side.displayName };
	if (side.avatar !== undefined) cell.avatar = side.avatar;

	const cls = side.won ? "bracket-side bracket-side-won" : "bracket-side";
	const outcome = side.won ? "won" : "lost";

	return html`<div class="${cls}">
<span class="bracket-seed" aria-hidden="true">${side.seed}</span>
${renderTeamCell(cell)}
<span class="bracket-points">${points(side.points)}</span>
<span class="visually-hidden">, seed ${side.seed}, ${outcome}</span>
</div>`;
}
