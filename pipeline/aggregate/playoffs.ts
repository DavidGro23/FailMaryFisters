/**
 * Turns a championship bracket into display rows. Pure, no I/O, no formatting.
 *
 * Resolving manager identity happens here so the render stage never touches the
 * registry, and marking the winner happens here so the template never compares
 * two numbers.
 */

import type { Manager, ManagerId, PlayoffBracket, PlayoffGame } from "../model.ts";

export interface BracketSide {
	managerId: ManagerId;
	displayName: string;
	avatar?: string;
	seed: number;
	points: number;
	won: boolean;
}

export interface BracketGame {
	label: string;
	week: number;
	sides: [BracketSide, BracketSide];
	/** Absolute winning margin. */
	margin: number;
}

export interface BracketView {
	year: number;
	semifinals: BracketGame[];
	final: BracketGame;
	thirdPlace?: BracketGame;
	/** Winner of the final. */
	championId: ManagerId;
	championName: string;
}

export function buildBracketView(
	year: number,
	bracket: PlayoffBracket,
	managers: ReadonlyMap<ManagerId, Manager>,
	seasonYear: number,
): BracketView {
	const game = (source: PlayoffGame, fallbackLabel: string): BracketGame => {
		const sides: [BracketSide, BracketSide] = [
			toSide(source, "a", managers, seasonYear),
			toSide(source, "b", managers, seasonYear),
		];
		return {
			// The export's own label is shown where it has one; early consolation
			// rounds ship an empty string, so a fallback is required (D11).
			label: source.roundLabel.trim() === "" ? fallbackLabel : source.roundLabel,
			week: source.week,
			sides,
			margin: Math.abs(source.a.points - source.b.points),
		};
	};

	const final = game(bracket.final, "Final");
	const champion = final.sides.find((s) => s.won);

	const view: BracketView = {
		year,
		semifinals: bracket.semifinals.map((s) => game(s, "Semifinal")),
		final,
		championId: champion?.managerId ?? bracket.final.winner,
		championName: champion?.displayName ?? "Unknown",
	};

	if (bracket.thirdPlace) view.thirdPlace = game(bracket.thirdPlace, "Third place");

	return view;
}

function toSide(
	source: PlayoffGame,
	which: "a" | "b",
	managers: ReadonlyMap<ManagerId, Manager>,
	seasonYear: number,
): BracketSide {
	const raw = source[which];
	const manager = managers.get(raw.managerId);

	const side: BracketSide = {
		managerId: raw.managerId,
		// The canonical display name, used on historical pages too (D15).
		displayName: manager?.displayName ?? `Unknown manager (${raw.managerId})`,
		seed: raw.seed,
		points: raw.points,
		won: source.winner === raw.managerId,
	};

	// The manager's latest avatar, not the one from the season being displayed —
	// the same rule the canonical display name follows (D15).
	if (manager?.latestAvatar !== undefined) side.avatar = manager.latestAvatar;

	return side;
}
