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
 */
export const TIE_ORDER = {
  min: 0,
  max: 100
};

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
  if (typeof tieOrder !== "number" || Number.isNaN(tieOrder)) tieOrder = (TIE_ORDER.min + TIE_ORDER.max) / 2;

  const cappedTieOrder = clamp(tieOrder, TIE_ORDER);
  const tieOrderRange = TIE_ORDER.max - TIE_ORDER.min;
  const protagonistValue = isProtagonist ? tieOrderRange * 5 : 0;
  const initiativeMultiplier = tieOrderRange * 10;

  return initiative * initiativeMultiplier + protagonistValue + cappedTieOrder;
}
