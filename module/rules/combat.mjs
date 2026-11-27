/**
 * Combat-related calculations. Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.combat.
 */

import { clamp } from "./_utils.mjs";

/**
 * Defines the range of valid tie order values for combatants.
 * The tie order is used to break ties between combatants with the same initiative value.
 * Tie order values are capped to this range, and a missing tie order is treated as the middle of this range.
 * @constant {object} TIE_ORDER
 * @property {number} min - The minimum tie order value.
 * @property {number} max - The maximum tie order value.
 * @property {number} center - The center value of the tie order range.
 */
export const TIE_ORDER = {
  min: 0,
  max: 100,
  get center() {
    return (this.min + this.max) / 2;
  }
};

/**
 * The step size between two initiative numbers within the final sort order scale.
 */
const INITIATIVE_STEP = (TIE_ORDER.max - TIE_ORDER.min) * 10;

/**
 * Calculates the sort order for combatants based on their initiative, tieOrder, isProtagonist and hold value. (Kurzregeln 1.0, p. 14, #61)
 * @param {object} options - The options for sorting combatants.
 * @param {number|null} options.initiative - The initiative value of the combatant.
 * @param {number|null} [options.tieOrder] - The tie order value of the combatant.
 * @param {boolean} [options.isProtagonist=false] - Whether the combatant is a protagonist.
 * @param {number|null} [options.hold] - A hold value for this round, if any.
 * @returns {number} - The sort order value for the combatant. Higher values indicate higher priority in the sort order. If initiative is NaN, null or undefined, returns -Infinity.
 */
export function sortOrder({ initiative, tieOrder, isProtagonist = false, hold }) {
  if (typeof initiative !== "number" || Number.isNaN(initiative)) return -Infinity;
  if (typeof hold === "number" && !Number.isNaN(hold)) return hold;
  if (typeof tieOrder !== "number" || Number.isNaN(tieOrder)) tieOrder = TIE_ORDER.center;

  const cappedTieOrder = clamp(tieOrder, TIE_ORDER);
  const tieOrderRange = TIE_ORDER.max - TIE_ORDER.min;
  const protagonistValue = isProtagonist ? tieOrderRange * 5 : 0;

  return initiative * INITIATIVE_STEP + protagonistValue + cappedTieOrder;
}

/**
 * Defines the types of turn order changes that can be resolved.
 * @property {string} NO_CHANGE - No change in turn order.
 * @property {string} FORBIDDEN - The change is forbidden.
 * @property {string} HOLD - The combatant is holding their turn.
 * @property {string} TIE_ORDER - The change is based on tie order.
 */
export const RESOLVE_TURN_ORDER_TYPE = Object.freeze({
  NO_CHANGE: "noChange",
  FORBIDDEN: "forbidden",
  HOLD: "hold",
  TIE_ORDER: "tieOrder"
});

/**
 * Whether a combatant may be moved in the turn order: the combat has started,
 * its initiative is rolled, it has not acted yet this round and has not announced an action.
 * (KR p. 14; #61, #67)
 * @param {object} options
 * @param {number|null} [options.initiative] - The initiative value. Only a finite number counts as a valid initiative.
 * @param {number} options.from - Index of the combatant in the turn order.
 * @param {number|null} options.turn - Index of the active combatant, or null before the combat has started.
 * @param {boolean} [options.actionAnnounced] - Whether the combatant has announced their action for the turn. Defaults to false. (#67)
 * @returns {boolean} - True if combatant is allowed to move.
 */
export function canMove({ initiative, from, turn, actionAnnounced = false }) {
  if (turn === null) return false;
  if (from < turn) return false;
  if (from === turn && actionAnnounced) return false;

  if (!Number.isFinite(initiative)) return false;

  return true;
}

/**
 * Resolves the change in turn order based on the provided options.
 * (KR p. 14; #61)
 * @param {object} options - The options for resolving the turn order change.
 * @param {Array} options.order - The current turn order sorted in sort order.
 * @param {number} options.from - The index of the combatant to move.
 * @param {number} options.to - The index where the combatant will be moved in front of. Length of list will move to end.
 * @param {number|null} options.turn - index of active combatant or null if the conflict has not started.
 * @param {boolean} options.isGM - Whether the user is a game master.
 * @returns {object} - The resolved turn order change. type: RESOLVE_TURN_ORDER_TYPE. value: undefined if type is "noChange" or "forbidden", otherwise the new value.
 */
export function resolveTurnOrderChange({ order, from, to, turn, isGM }) {
  const noChange = { type: RESOLVE_TURN_ORDER_TYPE.NO_CHANGE };
  const forbidden = { type: RESOLVE_TURN_ORDER_TYPE.FORBIDDEN };

  const moved = order[from];
  const upperNeighbor = order[to - 1];
  const lowerNeighbor = order[to];

  // TODO: (#67) account for whether action has been announced
  // Is it allowed to move?
  if (!canMove({ initiative: moved.initiative, from, turn })) return forbidden;

  // Did it actually move?
  if (moved === upperNeighbor || moved === lowerNeighbor) return noChange;

  // Is it allowed to be moved to?
  if (to < turn) return forbidden; // TODO: (#67) Needs to account for announcing an action
  if (upperNeighbor && !Number.isFinite(upperNeighbor.initiative)) return forbidden;

  // Range of the moved combatant's own tie group on the sort order scale:
  // the same initiative and status, with the lowest and the highest tie order, not holding
  const groupBottom = sortOrder({ ...moved, tieOrder: TIE_ORDER.min, hold: null });
  const groupTop = sortOrder({ ...moved, tieOrder: TIE_ORDER.max, hold: null });

  // Sort values around the drop position; a missing neighbor counts as infinitely high (top) or low (bottom)
  const above = upperNeighbor ? sortOrder(upperNeighbor) : Infinity;
  const below = lowerNeighbor ? sortOrder(lowerNeighbor) : -Infinity;

  // Where the drop position lies relative to the own group
  const behindGroup = above < groupBottom;
  const aheadOfGroup = below > groupTop;

  // What type of move
  let type;
  if (isGM || behindGroup) type = RESOLVE_TURN_ORDER_TYPE.HOLD;
  else if (aheadOfGroup) return forbidden;
  else type = RESOLVE_TURN_ORDER_TYPE.TIE_ORDER;

  // Calculate value
  let value;
  switch (type) {
    case RESOLVE_TURN_ORDER_TYPE.TIE_ORDER: {
      const upperTieOrder = clamp(above - groupBottom + TIE_ORDER.min, TIE_ORDER);
      const lowerTieOrder = clamp(below - groupBottom + TIE_ORDER.min, TIE_ORDER);
      value = (upperTieOrder + lowerTieOrder) / 2;
      break;
    }
    case RESOLVE_TURN_ORDER_TYPE.HOLD: {
      const upperSortOrder = above !== Infinity ? above : below + INITIATIVE_STEP * 2;
      const lowerSortOrder = below !== -Infinity ? below : above - INITIATIVE_STEP * 2;
      value = (upperSortOrder + lowerSortOrder) / 2;
      break;
    }
  }

  return { type, value };
}
