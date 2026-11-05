import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONVICTION_STAGES, convictionStage } from "../../module/rules/conviction.mjs";

describe("convictionStage", () => {
  it("maps every value from -3 to +3 to its stage", () => {
    const cases = [
      [3, "steadfast"],
      [2, "confident"], [1, "confident"],
      [0, "neutral"],
      [-1, "doubtful"], [-2, "doubtful"],
      [-3, "desperate"]
    ];
    for ( const [value, stage] of cases ) assert.equal(convictionStage(value), stage, `value ${value}`);
  });

  it("returns null outside the scale", () => {
    assert.equal(convictionStage(4), null);
    assert.equal(convictionStage(-4), null);
  });

  it("has stages that do not overlap", () => {
    const covered = Object.values(CONVICTION_STAGES).flatMap(({ min, max }) => {
      const values = [];
      for ( let v = min; v <= max; v++ ) values.push(v);
      return values;
    });
    assert.deepEqual(covered.toSorted((a, b) => a - b), [-3, -2, -1, 0, 1, 2, 3]);
  });

  it("accepts custom stages", () => {
    const stages = { low: { min: -3, max: -1 }, high: { min: 0, max: 3 } };
    assert.equal(convictionStage(-1, { stages }), "low");
    assert.equal(convictionStage(0, { stages }), "high");
  });
});
