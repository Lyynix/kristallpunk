/**
 * Calculation of derived values. Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.derived.
 */

/**
 * Total value of a skill: skill value plus its linked attribute (Kurzregeln 1.0, p. 5).
 * @param {object} data
 * @param {number} data.value      The skill value.
 * @param {number} data.attribute  The value of the linked attribute.
 * @param {number} [data.bonus=0]  Manual adjustment added to the result.
 * @returns {number}
 */
export function skillTotal({ value, attribute, bonus = 0 }) {
  return value + attribute + bonus;
}

/**
 * Maximum stamina of a domain: sum of the domain's three attributes (Kurzregeln 1.0, p. 5).
 * @param {object} data
 * @param {number[]} data.attributes  The values of the domain's attributes.
 * @param {number} [data.bonus=0]     Manual adjustment added to the result.
 * @returns {number}
 */
export function staminaMax({ attributes, bonus = 0 }) {
  return attributes.reduce((sum, value) => sum + value, 0) + bonus;
}
