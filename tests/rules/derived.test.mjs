import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attributeTotal, courage, crystalEcho, insight, protection, protectionValue, resilience, skillTotal, staminaMax, toughness
} from "../../module/rules/derived.mjs";

describe("attributeTotal", () => {
  it("is the entered value without modifier", () => {
    assert.equal(attributeTotal({ value: 4 }), 4);
  });

  it("adds the modifier", () => {
    assert.equal(attributeTotal({ value: 4, mod: 2 }), 6);
    assert.equal(attributeTotal({ value: 4, mod: -1 }), 3);
  });

  it("is capped at 7 by default (Kurzregeln 1.0, p. 23; #17)", () => {
    assert.equal(attributeTotal({ value: 6, mod: 2 }), 7);
    assert.equal(attributeTotal({ value: 7, mod: 0 }), 7);
  });

  it("does not drop below 0", () => {
    assert.equal(attributeTotal({ value: 1, mod: -3 }), 0);
  });

  it("takes other limits", () => {
    assert.equal(attributeTotal({ value: 5, mod: 3, limits: { min: 0, max: 6 } }), 6);
  });
});

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

  it("caps the skill part (value and modifier) at 9 by default (Erschaffung 1.0, p. 12)", () => {
    assert.equal(skillTotal({ value: 9, attribute: 4, mod: 2 }), 13);
    assert.equal(skillTotal({ value: 8, attribute: 7, mod: 3 }), 16);
  });

  it("does not let the skill part drop below 0", () => {
    assert.equal(skillTotal({ value: 0, attribute: 4, mod: -2 }), 4);
  });

  it("takes other limits", () => {
    assert.equal(skillTotal({ value: 5, attribute: 2, mod: 2, limits: { min: 0, max: 6 } }), 8);
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

describe("protectionValue (#49)", () => {
  it("is the rating of an intact piece", () => {
    assert.equal(protectionValue({ rating: 2, wear: 0 }), 2);
  });

  it("drops by 1 per wound it took or charge it spent (Kurzregeln 1.0, p. 7 and 20)", () => {
    assert.equal(protectionValue({ rating: 2, wear: 1 }), 1);
  });

  it("does not drop below 0", () => {
    assert.equal(protectionValue({ rating: 2, wear: 3 }), 0);
  });

  it("knows ratings above 3 of rare items (Kurzregeln 1.0, p. 20)", () => {
    assert.equal(protectionValue({ rating: 5, wear: 1 }), 4);
  });
});

describe("protection (#49)", () => {
  it("is 0 without equipped protection", () => {
    assert.equal(protection({ values: [] }), 0);
  });

  it("is the value of a single piece", () => {
    assert.equal(protection({ values: [2] }), 2);
  });

  it("takes the highest of several pieces, not their sum", () => {
    assert.equal(protection({ values: [1, 3, 2] }), 3);
  });

  it("adds the modifier, e.g. cover (Kurzregeln 1.0, p. 7)", () => {
    assert.equal(protection({ values: [2], mod: 1 }), 3);
    assert.equal(protection({ values: [], mod: 1 }), 1);
  });

  it("does not drop below 0", () => {
    assert.equal(protection({ values: [1], mod: -3 }), 0);
  });

  it("is not capped at 3", () => {
    assert.equal(protection({ values: [3], mod: 2 }), 5);
  });
});
