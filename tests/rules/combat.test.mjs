import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TIE_ORDER, sortOrder } from "../../module/rules/combat.mjs";

describe("sortOrder", () => {
  describe("initiative", () => {
    it("is higher for a higher initiative (Kurzregeln 1.0, p. 14)", () => {
      assert.ok(sortOrder({ initiative: 2, isProtagonist: false }) > sortOrder({ initiative: 1, isProtagonist: false }));
    });
    it("orders negative initiatives below zero and positive ones (p. 8)", () => {
      assert.ok(sortOrder({ initiative: 1, isProtagonist: false }) > sortOrder({ initiative: -1, isProtagonist: false }));
      assert.ok(sortOrder({ initiative: 0, isProtagonist: false }) > sortOrder({ initiative: -1, isProtagonist: false }));
      assert.ok(sortOrder({ initiative: 1, isProtagonist: false }) > sortOrder({ initiative: 0, isProtagonist: false }));
    });
    it("is -Infinity without initiative (null, NaN or left out)", () => {
      assert.equal(sortOrder({ initiative: null, isProtagonist: false }), -Infinity);
      assert.equal(sortOrder({ isProtagonist: false }), -Infinity);
      assert.equal(sortOrder({ initiative: NaN, isProtagonist: false }), -Infinity);
    });
    it("infinite initiative gets passed through", () => {
      assert.equal(sortOrder({ initiative: Infinity, isProtagonist: false }), Infinity);
      assert.equal(sortOrder({ initiative: -Infinity, isProtagonist: false }), -Infinity);
    })
  });

  describe("protagonists", () => {
    it("puts a protagonist before another figure with the same initiative (p. 14)", () => {
      assert.ok(sortOrder({ initiative: 1, isProtagonist: true }) > sortOrder({ initiative: 1, isProtagonist: false }));
    });
    it("never puts a protagonist before a higher initiative", () => {
      assert.ok(sortOrder({ initiative: 2, isProtagonist: false }) > sortOrder({ initiative: 1, isProtagonist: true }));
    });
    it("keeps the order at the border between negative and positive initiatives", () => {
      assert.ok(sortOrder({ initiative: 0, isProtagonist: false }) > sortOrder({ initiative: -1, isProtagonist: true }));
    });
    it("is -Infinity without initiative, even for a protagonist", () => {
      assert.equal(sortOrder({ initiative: null, isProtagonist: true }), -Infinity);
    });
  });

  describe("tie order", () => {
    it("puts a higher tie order first within the same initiative and status", () => {
      assert.ok(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: 2 }) > sortOrder({ initiative: 1, isProtagonist: false, tieOrder: 1 }));
    });
    it("never lets the tie order outrank the protagonist status", () => {
      assert.ok(sortOrder({ initiative: 1, isProtagonist: true, tieOrder: TIE_ORDER.min }) > sortOrder({ initiative: 1, isProtagonist: false, tieOrder: TIE_ORDER.max }));
    });
    it("never lets the tie order outrank a higher initiative", () => {
      assert.ok(sortOrder({ initiative: 2, isProtagonist: false, tieOrder: TIE_ORDER.min }) > sortOrder({ initiative: 1, isProtagonist: true, tieOrder: TIE_ORDER.max }));
    });
    it("treats a missing tie order as the middle of its range", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: null }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: (TIE_ORDER.min + TIE_ORDER.max) / 2 }));
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: (TIE_ORDER.min + TIE_ORDER.max) / 2 }));
    });
    it("treats a NaN tie order as the middle of its range", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: NaN }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: (TIE_ORDER.min + TIE_ORDER.max) / 2 }));
    });
    it("caps a tie order outside its range", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: -1 }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: TIE_ORDER.min }));
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: -Infinity }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: TIE_ORDER.min }));
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: 101 }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: TIE_ORDER.max }));
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: Infinity }), sortOrder({ initiative: 1, isProtagonist: false, tieOrder: TIE_ORDER.max }));
    });
  });

  describe("hold", () => {
    it("returns the hold value instead of the calculation", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, hold: 5 }), 5);
    });
    it("takes a hold value of 0", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, hold: 0 }), 0);
    });
    it("ignores initiative, status and tie order while holding", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, tieOrder: 2, hold: 5 }), 5);
    });
    it("is -Infinity without initiative, even while holding", () => {
      assert.equal(sortOrder({ initiative: null, isProtagonist: false, hold: 5 }), -Infinity);
    });
    it("ignores a NaN hold value", () => {
      assert.equal(sortOrder({ initiative: 1, isProtagonist: false, hold: NaN }), sortOrder({ initiative: 1, isProtagonist: false }));
    });
  });
});
