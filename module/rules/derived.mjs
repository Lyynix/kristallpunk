/**
 * Calculation of derived values. Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.derived.
 */

/** Hard limits of an attribute's total (Kurzregeln 1.0, p. 23; #17). */
export const ATTRIBUTE_LIMITS = { min: 0, max: 7 };

/** Limits of a skill's own part, without the attribute (Erschaffung 1.0, p. 12). */
export const SKILL_LIMITS = { min: 0, max: 9 };

/**
 * Total value of an attribute: the entered value plus its modifier (manual adjustment and active effects),
 * kept within the limits.
 * @param {object} data
 * @param {number} data.value                 The entered value.
 * @param {number} [data.mod=0]               Modifier added to it.
 * @param {{min: number, max: number}} [data.limits]  Defaults to ATTRIBUTE_LIMITS.
 * @returns {number}
 */
export function attributeTotal({ value, mod = 0, limits = ATTRIBUTE_LIMITS }) {
  return clamp(value + mod, limits);
}

/**
 * Total value of a skill: its own part plus its linked attribute (Kurzregeln 1.0, p. 5).
 * The own part is the skill value plus its modifier (manual adjustment and active effects),
 * kept within the limits.
 * @param {object} data
 * @param {number} data.value                 The skill value.
 * @param {number} data.attribute             The total of the linked attribute.
 * @param {number} [data.mod=0]               Modifier added to the skill value.
 * @param {{min: number, max: number}} [data.limits]  Limits of the own part; defaults to SKILL_LIMITS.
 * @returns {number}
 */
export function skillTotal({ value, attribute, mod = 0, limits = SKILL_LIMITS }) {
  return clamp(value + mod, limits) + attribute;
}

/**
 * @param {number} value
 * @param {{min: number, max: number}} limits
 * @returns {number}
 */
function clamp(value, { min, max }) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Maximum stamina of a domain: sum of the domain's three attributes (Kurzregeln 1.0, p. 5).
 * @param {object} data
 * @param {number[]} data.attributes  The values of the domain's attributes.
 * @param {number} [data.mod=0]       Manual adjustment added to the result.
 * @returns {number}
 */
export function staminaMax({ attributes, mod = 0 }) {
  return attributes.reduce((sum, value) => sum + value, 0) + mod;
}

/**
 * Mut: strength plus will (Kurzregeln 1.0, p. 7).
 * @param {object} data
 * @param {number} data.strength
 * @param {number} data.will
 * @param {number} [data.mod=0]    Manual adjustment added to the result.
 * @returns {number}
 */
export function courage({ strength, will, mod = 0 }) {
  return strength + will + mod;
}

/**
 * Kristall-Echo: senses plus empathy (Kurzregeln 1.0, p. 7).
 * @param {object} data
 * @param {number} data.senses
 * @param {number} data.empathy
 * @param {number} [data.mod=0]    Manual adjustment added to the result.
 * @returns {number}
 */
export function crystalEcho({ senses, empathy, mod = 0 }) {
  return senses + empathy + mod;
}

/**
 * Erkennen: dexterity plus intelligence (Kurzregeln 1.0, p. 7).
 * @param {object} data
 * @param {number} data.dexterity
 * @param {number} data.intelligence
 * @param {number} [data.mod=0]    Manual adjustment added to the result.
 * @returns {number}
 */
export function insight({ dexterity, intelligence, mod = 0 }) {
  return dexterity + intelligence + mod;
}

/**
 * Härte: maximum body stamina halved, rounded down (Kurzregeln 1.0, p. 7).
 * @param {object} data
 * @param {number} data.staminaMax  Maximum body stamina.
 * @param {number} [data.mod=0]     Manual adjustment added to the result.
 * @returns {number}
 */
export function toughness({ staminaMax, mod = 0 }) {
  return Math.floor(staminaMax / 2) + mod;
}

/**
 * Seelenhalt: maximum mind stamina halved, rounded down (Kurzregeln 1.0, p. 7).
 * @param {object} data
 * @param {number} data.staminaMax  Maximum mind stamina.
 * @param {number} [data.mod=0]     Manual adjustment added to the result.
 * @returns {number}
 */
export function resilience({ staminaMax, mod = 0 }) {
  return Math.floor(staminaMax / 2) + mod;
}
