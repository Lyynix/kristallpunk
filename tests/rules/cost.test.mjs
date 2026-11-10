import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stamina } from "../../module/rules/cost.mjs";

/** A rested adult without wounds or fear; tests override what they need. */
function cost(overrides = {}) {
  return stamina({
    domain: "body",
    stamina: { body: 10, mind: 10 },
    wounds: { body: 0, mind: 0 },
    fear: 0,
    ageGroup: "adult",
    ...overrides
  });
}

/* -------------------------------------------- */
/*  Normal checks (Kurzregeln 1.0, p. 5, 7, 23) */
/* -------------------------------------------- */

describe("stamina cost: normal checks", () => {
  it("a body skill costs 1 body stamina", () => {
    const result = cost();
    assert.equal(result.possible, true);
    assert.deepEqual(result.payments, [{ domain: "body", amount: 1 }]);
    assert.equal(result.strained, false);
    assert.equal(result.unconsciousAfter, false);
  });

  it("a mind skill costs 1 mind stamina", () => {
    assert.deepEqual(cost({ domain: "mind" }).payments, [{ domain: "mind", amount: 1 }]);
  });

  it("each wound of the same domain adds 1", () => {
    assert.deepEqual(cost({ wounds: { body: 2, mind: 0 } }).payments, [{ domain: "body", amount: 3 }]);
    assert.deepEqual(cost({ wounds: { body: 3, mind: 0 } }).payments, [{ domain: "body", amount: 4 }]);
  });

  it("wounds of the other domain do not count", () => {
    assert.deepEqual(cost({ wounds: { body: 0, mind: 3 } }).payments, [{ domain: "body", amount: 1 }]);
  });

  it("fear adds its level", () => {
    assert.deepEqual(cost({ fear: 2 }).payments, [{ domain: "body", amount: 3 }]);
  });

  it("from age 66 a check costs 2 instead of 1 (Erschaffung 1.0, p. 32)", () => {
    assert.deepEqual(cost({ ageGroup: "elder" }).payments, [{ domain: "body", amount: 2 }]);
  });

  it("lists the parts of the cost for display", () => {
    const result = cost({ ageGroup: "elder", wounds: { body: 2, mind: 0 }, fear: 1 });
    assert.deepEqual(result.parts, [
      { key: "base", value: 1 },
      { key: "age", value: 1 },
      { key: "wounds", value: 2 },
      { key: "fear", value: 1 }
    ]);
    assert.deepEqual(result.payments, [{ domain: "body", amount: 5 }]);
  });

  it("leaves out parts that add nothing", () => {
    assert.deepEqual(cost().parts, [{ key: "base", value: 1 }]);
  });
});

describe("stamina cost: surcharges from wounds and fear (#5, #17)", () => {
  const wounds = { body: 3, mind: 0 };

  it("adds both by default", () => {
    assert.deepEqual(cost({ wounds, fear: 3 }).payments, [{ domain: "body", amount: 7 }]);
  });

  it("option: only the higher one counts", () => {
    const result = cost({ wounds: { body: 1, mind: 0 }, fear: 2, options: { surcharges: "higher" } });
    assert.deepEqual(result.payments, [{ domain: "body", amount: 3 }]);
  });

  it("option: their sum is capped at +3", () => {
    const result = cost({ wounds, fear: 3, options: { surcharges: "capped" } });
    assert.deepEqual(result.payments, [{ domain: "body", amount: 4 }]);
  });
});

/* -------------------------------------------- */
/*  Derived values (Kurzregeln 1.0, p. 6–7)     */
/* -------------------------------------------- */

describe("stamina cost: derived values", () => {
  it("cost nothing, even with wounds, fear and old age", () => {
    const result = cost({ domain: null, wounds: { body: 3, mind: 3 }, fear: 3, ageGroup: "elder" });
    assert.equal(result.possible, true);
    assert.deepEqual(result.payments, []);
    assert.deepEqual(result.parts, []);
  });

  it("are not possible while unconscious (both stamina at 0)", () => {
    assert.equal(cost({ domain: null, stamina: { body: 0, mind: 0 } }).possible, false);
  });
});

/* -------------------------------------------- */
/*  Straining (Kurzregeln 1.0, p. 9)            */
/* -------------------------------------------- */

describe("stamina cost: straining", () => {
  it("with the own stamina at 0, the other one pays 2", () => {
    const result = cost({ stamina: { body: 0, mind: 5 } });
    assert.equal(result.possible, true);
    assert.equal(result.strained, true);
    assert.deepEqual(result.payments, [{ domain: "mind", amount: 2 }]);
  });

  it("adds the wounds of the skill's domain by default (#17)", () => {
    const result = cost({ stamina: { body: 0, mind: 8 }, wounds: { body: 2, mind: 1 } });
    assert.deepEqual(result.payments, [{ domain: "mind", amount: 4 }]);
  });

  it("option: adds the wounds of the paying domain instead", () => {
    const result = cost({
      stamina: { body: 0, mind: 8 }, wounds: { body: 2, mind: 1 }, options: { strainWounds: "payer" }
    });
    assert.deepEqual(result.payments, [{ domain: "mind", amount: 3 }]);
  });

  it("adds fear", () => {
    assert.deepEqual(cost({ stamina: { body: 0, mind: 8 }, fear: 1 }).payments, [{ domain: "mind", amount: 3 }]);
  });

  it("costs 1 more from age 66, like any action (Erschaffung 1.0, p. 32; #17)", () => {
    const result = cost({ stamina: { body: 0, mind: 8 }, ageGroup: "elder", wounds: { body: 1, mind: 0 } });
    assert.deepEqual(result.payments, [{ domain: "mind", amount: 4 }]);
    assert.deepEqual(result.parts, [{ key: "strain", value: 2 }, { key: "age", value: 1 }, { key: "wounds", value: 1 }]);
  });

  it("lists strain instead of the base cost", () => {
    const result = cost({ stamina: { body: 0, mind: 8 }, wounds: { body: 1, mind: 0 } });
    assert.deepEqual(result.parts, [{ key: "strain", value: 2 }, { key: "wounds", value: 1 }]);
  });

  it("is not possible with both stamina at 0 (unconscious)", () => {
    const result = cost({ stamina: { body: 0, mind: 0 } });
    assert.equal(result.possible, false);
    assert.deepEqual(result.payments, []);
  });
});

/* -------------------------------------------- */
/*  Not enough stamina (#17, provisional)       */
/* -------------------------------------------- */

describe("stamina cost: not enough stamina", () => {
  const short = { stamina: { body: 2, mind: 8 }, wounds: { body: 3, mind: 0 } };

  it("by default drains the own stamina, then the other one pays the full original cost", () => {
    const result = cost(short);
    assert.equal(result.strained, true);
    assert.deepEqual(result.payments, [{ domain: "body", amount: 2 }, { domain: "mind", amount: 4 }]);
  });

  it("option: the other one pays only the rest", () => {
    const result = cost({ ...short, options: { shortfall: "rest" } });
    assert.deepEqual(result.payments, [{ domain: "body", amount: 2 }, { domain: "mind", amount: 2 }]);
  });

  it("option: the other one pays the cost of straining", () => {
    const result = cost({ ...short, options: { shortfall: "strain" } });
    assert.deepEqual(result.payments, [{ domain: "body", amount: 2 }, { domain: "mind", amount: 5 }]);
  });
});

describe("stamina cost: checks the stamina cannot pay for (#17)", () => {
  const impossible = result => {
    assert.equal(result.possible, false);
    assert.equal(result.reason, "insufficient");
    assert.deepEqual(result.payments, []);
    assert.equal(result.unconsciousAfter, false);
  };

  it("straining is not possible if the other stamina cannot pay it all", () => {
    impossible(cost({ stamina: { body: 0, mind: 1 } }));
  });

  it("is not possible if the other stamina cannot pay the full original cost", () => {
    impossible(cost({ stamina: { body: 1, mind: 2 }, wounds: { body: 3, mind: 0 } }));
    impossible(cost({ stamina: { body: 2, mind: 3 }, wounds: { body: 3, mind: 0 } }));
  });

  it("is not possible if the other stamina cannot pay what the option asks for", () => {
    impossible(cost({ stamina: { body: 2, mind: 1 }, wounds: { body: 3, mind: 0 }, options: { shortfall: "rest" } }));
    impossible(cost({ stamina: { body: 2, mind: 4 }, wounds: { body: 3, mind: 0 }, options: { shortfall: "strain" } }));
  });

  it("still lists the parts of the cost, for the warning", () => {
    const result = cost({ stamina: { body: 0, mind: 1 } });
    assert.deepEqual(result.parts, [{ key: "strain", value: 2 }]);
  });

  it("is not possible while unconscious, with its own reason", () => {
    const result = cost({ stamina: { body: 0, mind: 0 } });
    assert.equal(result.possible, false);
    assert.equal(result.reason, "unconscious");
  });

  it("has no reason when possible", () => {
    assert.equal(cost().reason, null);
    assert.equal(cost({ domain: null }).reason, null);
  });
});

describe("stamina cost: checks that leave the figure unconscious (#17)", () => {
  it("paying the last point with the other stamina already at 0", () => {
    const result = cost({ stamina: { body: 1, mind: 0 } });
    assert.equal(result.possible, true);
    assert.deepEqual(result.payments, [{ domain: "body", amount: 1 }]);
    assert.equal(result.unconsciousAfter, true);
  });

  it("straining with exactly enough left", () => {
    const result = cost({ stamina: { body: 0, mind: 2 } });
    assert.equal(result.possible, true);
    assert.deepEqual(result.payments, [{ domain: "mind", amount: 2 }]);
    assert.equal(result.unconsciousAfter, true);
  });

  it("not enough in the own stamina, and exactly enough in the other one", () => {
    const result = cost({ stamina: { body: 2, mind: 4 }, wounds: { body: 3, mind: 0 } });
    assert.deepEqual(result.payments, [{ domain: "body", amount: 2 }, { domain: "mind", amount: 4 }]);
    assert.equal(result.unconsciousAfter, true);
  });

  it("is not flagged while stamina remains", () => {
    assert.equal(cost({ stamina: { body: 1, mind: 3 } }).unconsciousAfter, false);
  });
});

/* -------------------------------------------- */
/*  Invalid input                               */
/* -------------------------------------------- */

describe("stamina cost: invalid input", () => {
  it("rejects an unknown domain", () => {
    assert.throws(() => cost({ domain: "soul" }));
  });

  it("rejects negative or non-integer stamina", () => {
    assert.throws(() => cost({ stamina: { body: -1, mind: 5 } }));
    assert.throws(() => cost({ stamina: { body: 1.5, mind: 5 } }));
  });

  it("rejects wounds and fear outside 0–3", () => {
    assert.throws(() => cost({ wounds: { body: 4, mind: 0 } }));
    assert.throws(() => cost({ fear: 4 }));
    assert.throws(() => cost({ fear: -1 }));
  });

  it("rejects an unknown age group or option", () => {
    assert.throws(() => cost({ ageGroup: "ancient" }));
    assert.throws(() => cost({ options: { shortfall: "skip" } }));
  });
});
