import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  courage, crystalEcho, insight, resilience, skillTotal, staminaMax, toughness
} from "../../module/rules/derived.mjs";

describe("skillTotal", () => {
  it("adds skill value and linked attribute", () => {
    assert.equal(skillTotal({ value: 2, attribute: 3 }), 5);
  });

  it("adds the modifier", () => {
    assert.equal(skillTotal({ value: 2, attribute: 3, mod: 1 }), 6);
    assert.equal(skillTotal({ value: 2, attribute: 3, mod: -2 }), 3);
  });

  it("works with zero values", () => {
    assert.equal(skillTotal({ value: 0, attribute: 0 }), 0);
  });

  it("reaches 15 at the human maximum (attribute 6, skill 9)", () => {
    assert.equal(skillTotal({ value: 9, attribute: 6 }), 15);
  });
});

describe("staminaMax", () => {
  it("sums the attributes of a domain", () => {
    assert.equal(staminaMax({ attributes: [3, 4, 5] }), 12);
  });

  it("adds the modifier", () => {
    assert.equal(staminaMax({ attributes: [3, 4, 5], mod: 2 }), 14);
    assert.equal(staminaMax({ attributes: [3, 4, 5], mod: -3 }), 9);
  });

  it("reaches 21 with three attributes at the creation exception of 7", () => {
    assert.equal(staminaMax({ attributes: [7, 7, 7] }), 21);
  });

  it("is 0 without attributes", () => {
    assert.equal(staminaMax({ attributes: [] }), 0);
  });
});

describe("courage, crystalEcho, insight", () => {
  it("courage is strength plus will", () => {
    assert.equal(courage({ strength: 3, will: 2 }), 5);
    assert.equal(courage({ strength: 3, will: 2, mod: 2 }), 7);
  });

  it("crystal echo is senses plus empathy", () => {
    assert.equal(crystalEcho({ senses: 4, empathy: 1 }), 5);
    assert.equal(crystalEcho({ senses: 4, empathy: 1, mod: -1 }), 4);
  });

  it("insight is dexterity plus intelligence", () => {
    assert.equal(insight({ dexterity: 2, intelligence: 5 }), 7);
    assert.equal(insight({ dexterity: 2, intelligence: 5, mod: 1 }), 8);
  });
});

describe("toughness and resilience", () => {
  for ( const [name, fn] of [["toughness", toughness], ["resilience", resilience]] ) {
    it(`${name} halves an even stamina maximum`, () => {
      assert.equal(fn({ staminaMax: 12 }), 6);
    });

    it(`${name} rounds an odd stamina maximum down`, () => {
      assert.equal(fn({ staminaMax: 13 }), 6);
      assert.equal(fn({ staminaMax: 1 }), 0);
    });

    it(`${name} adds the modifier after halving`, () => {
      assert.equal(fn({ staminaMax: 13, mod: 1 }), 7);
      assert.equal(fn({ staminaMax: 13, mod: -2 }), 4);
    });
  }
});
