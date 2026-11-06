import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONVICTION_STAGES, OPTIONS, convictionStage, rerollMode, reroll, consequences
} from "../../module/rules/conviction.mjs";

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

describe("rerollMode", () => {
  it("keeps the sixes from +3 to +1", () => {
    for ( const value of [3, 2, 1] ) assert.equal(rerollMode(value), "keepSixes", `value ${value}`);
  });

  it("rerolls all dice from 0 to -2", () => {
    for ( const value of [0, -1, -2] ) assert.equal(rerollMode(value), "all", `value ${value}`);
  });

  it("allows no reroll at -3", () => {
    assert.equal(rerollMode(-3), null);
  });

  it("rejects values outside the scale and non-integers", () => {
    assert.throws(() => rerollMode(4), RangeError);
    assert.throws(() => rerollMode(-4), RangeError);
    assert.throws(() => rerollMode(1.5), TypeError);
  });
});

describe("reroll", () => {
  it("keeps the sixes and rerolls the rest", () => {
    assert.deepEqual(reroll({ faces: [6, 3, 6, 1], mode: "keepSixes" }), { keep: [6, 6], count: 2 });
  });

  it("rerolls every die, sixes included", () => {
    assert.deepEqual(reroll({ faces: [6, 3, 6, 1], mode: "all" }), { keep: [], count: 4 });
  });

  it("has nothing to reroll when all dice show six", () => {
    assert.deepEqual(reroll({ faces: [6, 6], mode: "keepSixes" }), { keep: [6, 6], count: 0 });
  });

  it("rerolls everything when there is no six to keep", () => {
    assert.deepEqual(reroll({ faces: [2, 1, 4], mode: "keepSixes" }), { keep: [], count: 3 });
  });

  it("rejects an unknown mode and invalid faces", () => {
    assert.throws(() => reroll({ faces: [6, 1], mode: "half" }), RangeError);
    assert.throws(() => reroll({ faces: [], mode: "all" }), TypeError);
    assert.throws(() => reroll({ faces: [7], mode: "all" }), RangeError);
  });
});

describe("consequences", () => {
  it("changes nothing without critical result or reroll", () => {
    const result = consequences({ before: 1, critical: 0 });
    assert.equal(result.value, 1);
    assert.equal(result.delta, 0);
    assert.equal(result.clamped, false);
  });

  it("shifts +1 on a critical success and -1 on a critical failure", () => {
    assert.equal(consequences({ before: 0, critical: 1 }).delta, 1);
    assert.equal(consequences({ before: 0, critical: -1 }).delta, -1);
  });

  it("stops at +3 and -3 and reports it", () => {
    let result = consequences({ before: 3, critical: 1 });
    assert.equal(result.value, 3);
    assert.equal(result.delta, 0);
    assert.equal(result.clamped, true);
    result = consequences({ before: -3, critical: -1 });
    assert.equal(result.value, -3);
    assert.equal(result.clamped, true);
  });

  it("shifts only once for a double triple by default", () => {
    assert.equal(consequences({ before: 0, critical: 2 }).delta, 1);
    assert.equal(consequences({ before: 0, critical: -2 }).delta, -1);
  });

  it("shifts once per triple with the option 'each'", () => {
    assert.equal(consequences({ before: 0, critical: 2, options: { tripleShift: "each" } }).delta, 2);
    const result = consequences({ before: -2, critical: -2, options: { tripleShift: "each" } });
    assert.equal(result.value, -3);
    assert.equal(result.clamped, true);
  });

  it("has 'once' as default option", () => {
    assert.equal(OPTIONS.tripleShift[0], "once");
  });

  it("costs one point for a reroll", () => {
    const result = consequences({ before: 1, rerolled: true, critical: 0 });
    assert.equal(result.value, 0);
    assert.equal(result.delta, -1);
  });

  it("applies the reroll first, then the shift of the new result", () => {
    let result = consequences({ before: 3, rerolled: true, critical: 1 });
    assert.equal(result.value, 3);
    assert.equal(result.delta, 0);
    assert.equal(result.clamped, false);
    result = consequences({ before: -2, rerolled: true, critical: -1 });
    assert.equal(result.value, -3);
    assert.equal(result.delta, -1);
    assert.equal(result.clamped, true);
  });

  it("lists the parts for display", () => {
    const result = consequences({ before: 3, rerolled: true, critical: 1 });
    assert.deepEqual(result.parts, [{ key: "reroll", value: -1 }, { key: "shift", value: 1 }]);
    assert.deepEqual(consequences({ before: 3, critical: 1 }).parts, [{ key: "shift", value: 0 }]);
    assert.deepEqual(consequences({ before: 0, critical: 0 }).parts, []);
  });

  it("does not shift when critical results cancel out", () => {
    assert.equal(consequences({ before: 0, critical: 0 }).delta, 0);
  });

  it("rejects a reroll at -3", () => {
    assert.throws(() => consequences({ before: -3, rerolled: true, critical: 0 }), RangeError);
  });

  it("rejects invalid input", () => {
    assert.throws(() => consequences({ before: 4, critical: 0 }), RangeError);
    assert.throws(() => consequences({ before: 0, critical: 0.5 }), TypeError);
    assert.throws(() => consequences({ before: 0, critical: 1, options: { tripleShift: "twice" } }), RangeError);
  });
});
