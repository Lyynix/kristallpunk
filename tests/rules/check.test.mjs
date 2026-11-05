import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../module/rules/check.mjs";

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
