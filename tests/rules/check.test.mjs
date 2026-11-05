import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluate, pool } from "../../module/rules/check.mjs";

/* -------------------------------------------- */
/*  Pool (Kurzregeln 1.0, p. 4–5, 11–12)        */
/* -------------------------------------------- */

describe("pool", () => {
  it("uses the base value without modifiers", () => {
    const result = pool({ base: 5 });
    assert.equal(result.dice, 5);
    assert.equal(result.modifier, 0);
    assert.equal(result.capped, false);
    assert.equal(result.minimum, false);
  });

  it("nets bonuses and penalties before anything else (bonus 4, penalty 2 → +2)", () => {
    const result = pool({ base: 5, modifiers: [4, -2] });
    assert.equal(result.rawModifier, 2);
    assert.equal(result.modifier, 2);
    assert.equal(result.dice, 7);
    assert.equal(result.capped, false);
  });

  it("caps a net bonus at +3 (rule of 3)", () => {
    const result = pool({ base: 5, modifiers: [2, 2, 1] });
    assert.equal(result.rawModifier, 5);
    assert.equal(result.modifier, 3);
    assert.equal(result.dice, 8);
    assert.equal(result.capped, true);
  });

  it("caps a net penalty at -3 (rule of 3, example on p. 12: penalty 4 → 3)", () => {
    const result = pool({ base: 5, modifiers: [-2, -1, -1] });
    assert.equal(result.rawModifier, -4);
    assert.equal(result.modifier, -3);
    assert.equal(result.dice, 2);
    assert.equal(result.capped, true);
  });

  it("counts helpers (+1 each) towards the rule of 3", () => {
    const result = pool({ base: 4, modifiers: [1, 1, 1, 2] });
    assert.equal(result.modifier, 3);
    assert.equal(result.dice, 7);
  });

  it("keeps exactly +3 and -3 uncapped", () => {
    assert.equal(pool({ base: 4, modifiers: [3] }).capped, false);
    assert.equal(pool({ base: 4, modifiers: [-3] }).capped, false);
  });

  it("always rolls at least one die (rule of 1)", () => {
    const result = pool({ base: 2, modifiers: [-3] });
    assert.equal(result.dice, 1);
    assert.equal(result.minimum, true);
  });

  it("rolls one die with base 0 and the full penalty", () => {
    const result = pool({ base: 0, modifiers: [-3] });
    assert.equal(result.dice, 1);
    assert.equal(result.minimum, true);
  });

  it("rolls one die with base 0 and no modifiers", () => {
    const result = pool({ base: 0 });
    assert.equal(result.dice, 1);
    assert.equal(result.minimum, true);
  });

  it("does not flag the rule of 1 when one die results naturally", () => {
    assert.equal(pool({ base: 1 }).minimum, false);
  });

  it("rejects non-integer values", () => {
    assert.throws(() => pool({ base: 2.5 }));
    assert.throws(() => pool({ base: 3, modifiers: [1.5] }));
  });
});

/* -------------------------------------------- */
/*  Evaluation (Kurzregeln 1.0, p. 4, 12–13)    */
/* -------------------------------------------- */

describe("evaluate: counting", () => {
  it("counts sixes as successes and ones separately", () => {
    const result = evaluate({ faces: [6, 1, 4, 6, 1, 3], grade: "daring" });
    assert.equal(result.successes, 2);
    assert.equal(result.ones, 2);
  });
});

describe("evaluate: grades", () => {
  it("daring needs one six", () => {
    assert.equal(evaluate({ faces: [6, 2, 3], grade: "daring" }).success, true);
    assert.equal(evaluate({ faces: [5, 2, 3], grade: "daring" }).success, false);
  });

  it("fateful needs two sixes", () => {
    assert.equal(evaluate({ faces: [6, 6, 3], grade: "fateful" }).success, true);
    assert.equal(evaluate({ faces: [6, 2, 3], grade: "fateful" }).success, false);
  });

  it("carefree succeeds without a six", () => {
    assert.equal(evaluate({ faces: [5, 2, 3], grade: "carefree" }).success, true);
  });

  it("carefree fails on a critical failure", () => {
    const result = evaluate({ faces: [1, 1, 1, 4], grade: "carefree" });
    assert.equal(result.criticalFailure, true);
    assert.equal(result.success, false);
  });

  it("carefree stays a success on a critical success", () => {
    const result = evaluate({ faces: [6, 6, 6], grade: "carefree" });
    assert.equal(result.criticalSuccess, true);
    assert.equal(result.success, true);
  });
});

describe("evaluate: criticals", () => {
  it("three sixes are a critical success, even on a fateful check", () => {
    const result = evaluate({ faces: [6, 6, 6, 2], grade: "fateful" });
    assert.equal(result.criticalSuccess, true);
    assert.equal(result.criticalFailure, false);
    assert.equal(result.success, true);
  });

  it("three ones are a critical failure", () => {
    const result = evaluate({ faces: [1, 1, 1, 4, 5], grade: "daring" });
    assert.equal(result.criticalFailure, true);
    assert.equal(result.success, false);
  });

  it("a single die showing 1 is a critical failure", () => {
    assert.equal(evaluate({ faces: [1], grade: "daring" }).criticalFailure, true);
  });

  it("two dice both showing 1 are a critical failure", () => {
    assert.equal(evaluate({ faces: [1, 1], grade: "daring" }).criticalFailure, true);
  });

  it("two dice with only one 1 are no critical failure", () => {
    assert.equal(evaluate({ faces: [1, 6], grade: "daring" }).criticalFailure, false);
  });

  it("two ones among three or more dice are no critical failure", () => {
    assert.equal(evaluate({ faces: [1, 1, 4], grade: "daring" }).criticalFailure, false);
  });

  it("a critical failure fails even with enough sixes (decided, see #17)", () => {
    const result = evaluate({ faces: [6, 6, 1, 1, 1], grade: "fateful" });
    assert.equal(result.criticalFailure, true);
    assert.equal(result.success, false);
  });

  it("counts every full triple: six sixes are two critical successes (#8, #17)", () => {
    const result = evaluate({ faces: [6, 6, 6, 6, 6, 6], grade: "daring" });
    assert.equal(result.critical, 2);
    assert.equal(result.criticalSuccess, true);
  });

  it("four of a kind is still only one triple", () => {
    assert.equal(evaluate({ faces: [6, 6, 6, 6, 2], grade: "daring" }).critical, 1);
    assert.equal(evaluate({ faces: [1, 1, 1, 1, 2], grade: "daring" }).critical, -1);
  });

  it("a critical success and a critical failure cancel out (decided, see #17)", () => {
    const result = evaluate({ faces: [6, 6, 6, 1, 1, 1], grade: "daring" });
    assert.equal(result.critical, 0);
    assert.equal(result.criticalSuccess, false);
    assert.equal(result.criticalFailure, false);
    // Without criticals the grade decides: three sixes are enough for daring
    assert.equal(result.success, true);
  });

  it("mixed triples are netted: three ones and six sixes give one critical success (#17)", () => {
    const result = evaluate({ faces: [1, 1, 1, 6, 6, 6, 6, 6, 6], grade: "daring" });
    assert.equal(result.critical, 1);
    assert.equal(result.criticalSuccess, true);
    assert.equal(result.criticalFailure, false);
    assert.equal(result.success, true);
  });
});

describe("evaluate: invalid input", () => {
  it("rejects an empty roll", () => {
    assert.throws(() => evaluate({ faces: [], grade: "daring" }));
  });

  it("rejects faces outside 1–6", () => {
    assert.throws(() => evaluate({ faces: [0, 3], grade: "daring" }));
    assert.throws(() => evaluate({ faces: [7], grade: "daring" }));
    assert.throws(() => evaluate({ faces: [2.5], grade: "daring" }));
  });

  it("rejects an unknown grade", () => {
    assert.throws(() => evaluate({ faces: [6], grade: "reckless" }));
  });
});
