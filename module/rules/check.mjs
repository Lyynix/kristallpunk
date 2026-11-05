/**
 * Checks (Proben). Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.check.
 */

/** Largest net bonus or penalty on a single check (rule of 3, Kurzregeln 1.0, p. 5 and 12). */
export const MAX_MODIFIER = 3;

/** Smallest number of dice on any check (rule of 1, Kurzregeln 1.0, p. 12). */
export const MIN_DICE = 1;

/**
 * Number of dice for a check.
 * Bonuses and penalties are netted first, then capped at ±3; helpers count as +1 each.
 * However low the result, at least one die is rolled.
 * @param {object} data
 * @param {number} data.base           Total value of the skill, or the derived value.
 * @param {number[]} [data.modifiers]  Bonuses (positive) and penalties (negative), in dice.
 * @returns {{dice: number, modifier: number, rawModifier: number, capped: boolean, minimum: boolean}}
 *   `modifier` is the net modifier after the rule of 3, `rawModifier` the one before;
 *   `capped` and `minimum` tell whether the rule of 3 or the rule of 1 applied.
 */
export function pool({ base, modifiers = [] }) {
  assertInteger(base, "base");
  for ( const modifier of modifiers ) assertInteger(modifier, "modifier");

  const rawModifier = modifiers.reduce((sum, value) => sum + value, 0);
  const modifier = Math.min(MAX_MODIFIER, Math.max(-MAX_MODIFIER, rawModifier));
  const dice = base + modifier;
  return {
    dice: Math.max(MIN_DICE, dice),
    modifier,
    rawModifier,
    capped: modifier !== rawModifier,
    minimum: dice < MIN_DICE
  };
}

/**
 * @param {*} value
 * @param {string} name
 * @throws {TypeError} If the value is not an integer.
 */
function assertInteger(value, name) {
  if ( !Number.isInteger(value) ) throw new TypeError(`${name} must be an integer, got ${value}`);
}
