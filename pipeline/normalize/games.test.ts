/**
 * Game classification (D20).
 *
 * `playoff-history.json` holds two brackets. Treating every row in it as a
 * playoff game was a real defect: it put 5th- and 7th-place games into the
 * playoff records, and the reported symptom was a lowest-playoff-score record
 * held by a consolation game. These tests pin the discriminator.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { RawPlayoffGame, RawSeason } from "../load/types.ts";
import { postseasonKeys } from "./games.ts";

function playoffRow(partial: Partial<RawPlayoffGame> & { bracketType: string }): RawPlayoffGame {
	return {
		year: 2025,
		week: 16,
		round: 1,
		roundLabel: "Semifinal",
		team1Id: "3",
		team1Seed: 1,
		team2Id: "7",
		team2Seed: 4,
		team1Points: 120,
		team2Points: 100,
		winner: "3",
		...partial,
	};
}

/** Only `year` and `playoffs` are read by `postseasonKeys`. */
function seasonWith(playoffs: RawPlayoffGame[]): RawSeason {
	return { year: 2025, playoffs } as RawSeason;
}

describe("postseasonKeys", () => {
	test("classifies the Championship bracket as playoff", () => {
		const keys = postseasonKeys(seasonWith([playoffRow({ bracketType: "Championship" })]));
		assert.equal(keys.get("2025-16-3-7"), "playoff");
	});

	test("classifies the Consolation bracket as consolation, not playoff", () => {
		const keys = postseasonKeys(seasonWith([playoffRow({ bracketType: "Consolation" })]));
		assert.equal(keys.get("2025-16-3-7"), "consolation");
	});

	test("the 5th- and 7th-place games are consolation despite being the final round", () => {
		const keys = postseasonKeys(
			seasonWith([
				playoffRow({ bracketType: "Consolation", round: 2, week: 17, roundLabel: "5th Place Game" }),
				playoffRow({
					bracketType: "Consolation",
					round: 2,
					week: 17,
					roundLabel: "7th Place Game",
					team1Id: "2",
					team2Id: "9",
				}),
			]),
		);
		assert.equal(keys.get("2025-17-3-7"), "consolation");
		assert.equal(keys.get("2025-17-2-9"), "consolation");
	});

	test("the third-place game is a playoff game", () => {
		const keys = postseasonKeys(
			seasonWith([
				playoffRow({ bracketType: "Championship", round: 2, week: 17, roundLabel: "3rd Place Game" }),
			]),
		);
		assert.equal(keys.get("2025-17-3-7"), "playoff");
	});

	/**
	 * D11: the final is "Championship" in 2017-2018 and "Fantasy Super Bowl" from
	 * 2019, and the consolation first round has an empty label. A classifier that
	 * read labels would misfile whole seasons; `bracketType` is stable.
	 */
	test("ignores roundLabel entirely, including the empty one", () => {
		const keys = postseasonKeys(
			seasonWith([
				playoffRow({ bracketType: "Championship", roundLabel: "Fantasy Super Bowl" }),
				playoffRow({ bracketType: "Championship", roundLabel: "", team1Id: "1", team2Id: "4" }),
				playoffRow({ bracketType: "Consolation", roundLabel: "", team1Id: "2", team2Id: "5" }),
				playoffRow({ bracketType: "Consolation", roundLabel: "Semifinal", team1Id: "6", team2Id: "8" }),
			]),
		);
		assert.equal(keys.get("2025-16-3-7"), "playoff");
		assert.equal(keys.get("2025-16-1-4"), "playoff");
		assert.equal(keys.get("2025-16-2-5"), "consolation");
		assert.equal(keys.get("2025-16-6-8"), "consolation");
	});

	test("keys are ordered by ascending numeric teamId, matching matchupId", () => {
		// The raw row lists 7 before 3; the key must not.
		const keys = postseasonKeys(
			seasonWith([playoffRow({ bracketType: "Championship", team1Id: "7", team2Id: "3" })]),
		);
		assert.deepEqual([...keys.keys()], ["2025-16-3-7"]);
	});

	test("a game absent from playoff-history has no entry, so it falls through to regular", () => {
		const keys = postseasonKeys(seasonWith([playoffRow({ bracketType: "Championship" })]));
		assert.equal(keys.get("2025-4-3-7"), undefined);
	});
});
