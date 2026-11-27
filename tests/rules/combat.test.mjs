import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TIE_ORDER, sortOrder, RESOLVE_TURN_ORDER_TYPE, resolveTurnOrderChange, canMove } from "../../module/rules/combat.mjs";

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

/**
 * Emulates the initiative order with only necessary data for testing the turn order resolution.
 */
class TestTurnOrder {
  constructor() {
    this.combatants = [];
  }

  /**
   * Add a protagonist to the combatants list and sort it according to the sortOrder function
   * @param {string} name - The name of the combatant.
   * @param {number} initiative - The initiative value of the combatant.
   * @param {number} [tieOrder] - The tie order value of the combatant.
   * @param {number} [hold] - A hold value for this round, if any.
   */
  pg(name, initiative, tieOrder, hold) {
    this._addData({ name, initiative, tieOrder, isProtagonist: true, hold });
    return this;
  }

  /**
   * Add an npc to the combatants list and sort it according to the sortOrder function
   * @param {string} name - The name of the combatant.
   * @param {number} initiative - The initiative value of the combatant.
   * @param {number} [tieOrder] - The tie order value of the combatant.
   * @param {number} [hold] - A hold value for this round, if any.
   */
  npc(name, initiative, tieOrder, hold) {
    this._addData({ name, initiative, tieOrder, isProtagonist: false, hold });
    return this;
  }
  _addData(data = { name, initiative, tieOrder, isProtagonist, hold }) {
    this.combatants.push(data);
    this.combatants.sort((a, b) => {
      const orderA = sortOrder(a);
      const orderB = sortOrder(b);

      if (orderA === orderB) return 0;
      return orderB - orderA;
    });
  }

  /**
   * Returns the index of the combatant with the specified name.
   * @param {string} name - Name of the combatant to find.
   * @returns {number} - The index of the combatant.
   * @throws {Error} - If the combatant with the specified name is not found.
   */
  indexOf(name) {
    const index = this.combatants.findIndex(c => c.name === name);
    if (index === -1) throw new Error(`Combatant with name "${name}" not found.`);
    return index;
  }

  /**
   * Returns the combatant with the specified name.
   * @param {string} name - Name of the combatant to find.
   * @returns {Object} - The combatant object.
   * @throws {Error} - If the combatant with the specified name is not found.
   */
  get(name) {
    return this.combatants[this.indexOf(name)];
  }

  /**
   * Returns the index that is needed to move a combatant to the position before the targeted entry.
   * @param {string} name - name of the targeted entry
   * @returns {number} - The index of the targeted entry.
   * @throws {Error} - If the combatant with the specified name is not found.
   */
  indexBefore(name) {
    return this.indexOf(name);
  }

  /**
   * Returns the index that is needed to move a combatant to the position after the targeted entry.
   * @param {string} name - name of the targeted entry
   * @returns {number} - The index of the targeted entry + 1.
   * @throws {Error} - If the combatant with the specified name is not found.
   */
  indexAfter(name) {
    return this.indexOf(name) + 1;
  }
}

describe("resolveTurnOrderChange", () => {

  describe("no change", () => {
    it("does nothing when dropped onto its own place (to === from)", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 1)
        .pg("B", 1)
        .pg("C", 1);
      const from = turnOrder.indexOf("B");
      const to = turnOrder.indexBefore("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.NO_CHANGE);
    });
    it("does nothing when dropped right below itself (to === from + 1)", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 1)
        .pg("B", 1)
        .pg("C", 1);
      const from = turnOrder.indexOf("B");
      const to = turnOrder.indexAfter("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.NO_CHANGE);
    });
  });

  describe("tie order", () => {
    it("moves up within the tie group, between its new neighbors", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 3)
        .pg("C", 1, 2)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("D");
      const to = turnOrder.indexAfter("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
      assert.ok(result.value < turnOrder.get("B").tieOrder);
      assert.ok(result.value > turnOrder.get("C").tieOrder);
    });
    it("moves down within the tie group, between its new neighbors", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 3)
        .pg("C", 1, 2)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("B");
      const to = turnOrder.indexAfter("C");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
      assert.ok(result.value < turnOrder.get("C").tieOrder);
      assert.ok(result.value > turnOrder.get("D").tieOrder);
    });
    it("moves to the top of the tie group, between the top value and the maximum", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 3)
        .pg("C", 1, 2)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexBefore("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
      assert.ok(result.value < TIE_ORDER.max);
      assert.ok(result.value > turnOrder.get("B").tieOrder);
    });
    it("moves to the bottom of the tie group, between the bottom value and the minimum", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 3)
        .pg("C", 1, 2)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("B");
      const to = turnOrder.indexAfter("D");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
      assert.ok(result.value < turnOrder.get("D").tieOrder);
      assert.ok(result.value > TIE_ORDER.min);
    });
    it("stays a tie order when dropped between its group and the next lower one", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 3)
        .pg("B", 2, 2)
        .pg("C", 2, 1)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("B");
      const to = turnOrder.indexAfter("C");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
      assert.ok(result.value < turnOrder.get("C").tieOrder);
      assert.ok(result.value > TIE_ORDER.min);
    });
    it("lets the active combatant move within its group (until announcing, #67)", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 3)
        .pg("C", 1, 2)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("B");
      const to = turnOrder.indexAfter("D");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
    });
    it("lets others move ahead of the active combatant within their group", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 3)
        .pg("C", 1, 2)
        .pg("D", 1, 1);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexBefore("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
    });
    it("lands between a holding neighbor and the group member above", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 1, 4)
        .pg("B", 1, 3)
        .pg("C", 1, 2);
      const holdVal = (sortOrder(turnOrder.get("B")) + sortOrder(turnOrder.get("C"))) / 2;
      turnOrder.pg("holder", 3, 8, holdVal);
      assert.ok(sortOrder(turnOrder.get("B")) > sortOrder(turnOrder.get("holder")));
      assert.ok(sortOrder(turnOrder.get("C")) < sortOrder(turnOrder.get("holder")));

      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });

      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.TIE_ORDER);
      assert.ok(result.value < turnOrder.get("B").tieOrder);
      assert.ok(result.value > turnOrder.get("C").tieOrder);

      const newData = { ...turnOrder.get("A"), tieOrder: result.value };
      assert.ok(sortOrder(newData) > sortOrder(turnOrder.get("holder")));
    });
  });

  describe("hold", () => {
    it("holds when a player moves behind the own initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 2)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });

      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
    });
    it("holds when moved into a lower group of protagonists or other figures", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 2)
        .pg("C", 1, 1)
        .npc("D", 1, 2)
        .npc("E", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("D");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
      assert.ok(sortOrder(turnOrder.get("D")) > result.value);
      assert.ok(sortOrder(turnOrder.get("E")) < result.value);
    });
    it("puts the hold value between the sort values of the new neighbors", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 2, 1)
        .pg("B", 1, 2)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });

      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
      assert.ok(sortOrder(turnOrder.get("B")) > result.value);
      assert.ok(sortOrder(turnOrder.get("C")) < result.value);
    });
    it("always holds when the GM moves, also within a tie group", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 1, 3)
        .pg("B", 1, 2)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: true });

      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
    });
    it("lets the GM move ahead of the initiative, as a hold", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexBefore("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: true });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
    });
    it("holds in front of the active combatant (stepping in 'now')", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const holdVal = (sortOrder(turnOrder.get("B")) + sortOrder(turnOrder.get("C"))) / 2;
      turnOrder.pg("holder", 4, 1, holdVal);
      assert.ok(sortOrder(turnOrder.get("B")) > sortOrder(turnOrder.get("holder")));
      assert.ok(sortOrder(turnOrder.get("C")) < sortOrder(turnOrder.get("holder")));

      const from = turnOrder.indexOf("holder");
      const to = turnOrder.indexBefore("B");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
      assert.ok(sortOrder(turnOrder.get("A")) > result.value);
      assert.ok(sortOrder(turnOrder.get("B")) < result.value);
    });
    it("holds before the first combatant with initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexBefore("A");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: true });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
      assert.ok(sortOrder(turnOrder.get("A")) < result.value);
    });
    it("holds behind the last combatant with initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("C");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.HOLD);
      assert.ok(sortOrder(turnOrder.get("C")) > result.value);
    });
  });


  describe("forbidden", () => {
    it("forbids a player to move ahead of the own initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexAfter("A");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids moving a figure that has already acted this round", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("C");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids moving to a place that has already acted this round, also for the GM", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 1, 3)
        .pg("B", 1, 2)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexBefore("A");
      const resultProt = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: false });
      const resultGM = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 1, isGM: true });
      assert.equal(resultProt.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
      assert.equal(resultGM.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids moving a figure without initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", null);
      const from = turnOrder.indexOf("C");
      const to = turnOrder.indexAfter("A");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids dropping among or behind figures without initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", null)
        .pg("C", null);
      const from = turnOrder.indexOf("A");
      const toAmong = turnOrder.indexAfter("B");
      const toBehind = turnOrder.indexAfter("C");
      const resultAmong = resolveTurnOrderChange({ order: turnOrder.combatants, from, to: toAmong, turn: 0, isGM: false });
      const resultBehind = resolveTurnOrderChange({ order: turnOrder.combatants, from, to: toBehind, turn: 0, isGM: false });
      assert.equal(resultAmong.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
      assert.equal(resultBehind.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids moving a figure with infinite initiative", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", Infinity)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("C");
      const result = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: 0, isGM: false });
      assert.equal(result.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids every move before the combat has started (turn null), also for the GM (#61)", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("A");
      const to = turnOrder.indexAfter("C");
      const resultPlayer = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: null, isGM: false });
      const resultGM = resolveTurnOrderChange({ order: turnOrder.combatants, from, to, turn: null, isGM: true });
      assert.equal(resultPlayer.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
      assert.equal(resultGM.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
    it("forbids dropping onto its own place before the combat has started, instead of no change", () => {
      const turnOrder = new TestTurnOrder()
        .pg("A", 3, 1)
        .pg("B", 2, 1)
        .pg("C", 1, 1);
      const from = turnOrder.indexOf("B");
      const toBefore = turnOrder.indexBefore("B");
      const toAfter = turnOrder.indexAfter("B");
      const resultBefore = resolveTurnOrderChange({ order: turnOrder.combatants, from, to: toBefore, turn: null, isGM: false });
      const resultAfter = resolveTurnOrderChange({ order: turnOrder.combatants, from, to: toAfter, turn: null, isGM: false });
      assert.equal(resultBefore.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
      assert.equal(resultAfter.type, RESOLVE_TURN_ORDER_TYPE.FORBIDDEN);
    });
  });
});

describe("canMove", () => {
  describe("before the combat has started", () => {
    it("forbids moving before the combat has started (turn null), even with initiative (#61)", () => {
      assert.equal(canMove({ initiative: 4, from: 2, turn: null }), false);
    });
  });

  describe("position relative to the turn", () => {
    it("allows moving a combatant that has not acted yet this round (from > turn) (Kurzregeln 1.0, p. 14)", () => {
      assert.equal(canMove({ initiative: 4, from: 2, turn: 1 }), true);
    });
    it("allows moving the active combatant (from === turn), until announcing an action", () => {
      assert.equal(canMove({ initiative: 4, from: 2, turn: 2, actionAnnounced: false }), true);
    });
    it("forbids moving a combatant that has already acted this round (from < turn)", () => {
      assert.equal(canMove({ initiative: 4, from: 1, turn: 2 }), false);
    });
    it("forbids moving after announcing an action for the active combatant (#67)", () => {
      assert.equal(canMove({ initiative: 4, from: 2, turn: 2, actionAnnounced: true }), false);
    });
    it("treats turn 0 as a started combat, not like null", () => {
      assert.equal(canMove({ initiative: 4, from: 0, turn: 0 }), true);
    });
  });

  describe("initiative", () => {
    it("forbids moving without initiative (null, undefined or NaN)", () => {
      assert.equal(canMove({ initiative: null, from: 2, turn: 1 }), false);
      assert.equal(canMove({ initiative: undefined, from: 2, turn: 1 }), false);
      assert.equal(canMove({ initiative: Number.NaN, from: 2, turn: 1 }), false);
    });
    it("forbids moving with infinite initiative", () => {
      assert.equal(canMove({ initiative: -Number.Infinity, from: 2, turn: 1 }), false);
      assert.equal(canMove({ initiative: Number.Infinity, from: 2, turn: 1 }), false);
    });
    it("allows moving with an initiative of 0 or below (p. 8)", () => {
      assert.equal(canMove({ initiative: 0, from: 2, turn: 1 }), true);
      assert.equal(canMove({ initiative: -2, from: 2, turn: 1 }), true);
    });
  });
});
