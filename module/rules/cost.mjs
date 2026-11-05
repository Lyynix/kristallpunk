/**
 * Stamina cost of checks. Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.cost.
 */

import { AGE_GROUPS } from "./age.mjs";

/** Cost of a skill check (Kurzregeln 1.0, p. 5). */
export const BASE_COST = 1;

/** Extra cost from age 66, making a check cost 2 (Erschaffung 1.0, p. 32). */
export const ELDER_SURCHARGE = 1;

/** Cost of straining, paid from the other stamina when the own one is at 0 (Kurzregeln 1.0, p. 9). */
export const STRAIN_COST = 2;

/** Largest surcharge from wounds, and the cap for the "capped" option (Kurzregeln 1.0, p. 23). */
export const MAX_SURCHARGE = 3;

/** Highest number of wounds per domain and highest fear level (Kurzregeln 1.0, p. 7, 20). */
const MAX_WOUNDS = 3;
const MAX_FEAR = 3;

/**
 * Interpretations of open rule questions (issues #5, #17), with the provisional default first.
 * - surcharges: wounds and fear are added; or only the higher one counts; or their sum is capped at +3
 * - strainWounds: when straining, the wounds of the skill's domain count; or those of the paying domain
 * - shortfall: if the own stamina does not cover the cost, it drops to 0 and the other stamina pays
 *   the full original cost; or only the rest; or the cost of straining
 */
export const OPTIONS = {
  surcharges: ["add", "higher", "capped"],
  strainWounds: ["check", "payer"],
  shortfall: ["full", "rest", "strain"]
};

const DOMAINS = ["body", "mind"];

/**
 * Stamina cost of a check.
 * - A skill check costs 1 of its domain's stamina (2 from age 66), plus 1 per wound of that domain
 *   (up to +3) and the fear level.
 * - Checks on derived values cost nothing.
 * - If the own stamina is at 0, the figure strains: the other stamina pays 2 plus surcharges.
 * - If the own stamina does not cover the cost, see the `shortfall` option.
 * - With both stamina at 0 the figure is unconscious and cannot act at all. A check that empties
 *   both still happens, but leaves the figure unconscious (provisional, see #17).
 * Payments never exceed the available stamina.
 * @param {object} data
 * @param {string|null} data.domain                  "body" or "mind" for a skill; null for a derived value.
 * @param {{body: number, mind: number}} data.stamina Current stamina.
 * @param {{body: number, mind: number}} data.wounds  Wounds per domain, 0 to 3.
 * @param {number} [data.fear=0]                     Fear level, 0 to 3.
 * @param {string} [data.ageGroup="adult"]           Age group key (rules/age.mjs).
 * @param {object} [data.options]                    Interpretations, see OPTIONS; defaults are the first values.
 * @returns {{possible: boolean, payments: {domain: string, amount: number}[], parts: {key: string, value: number}[],
 *   strained: boolean, unconsciousAfter: boolean}}
 *   `parts` lists what the cost is made of (base, age, strain, wounds, fear) for display.
 */
export function stamina({ domain, stamina: current, wounds, fear = 0, ageGroup = "adult", options = {} }) {
  validate({ domain, current, wounds, fear, ageGroup, options });
  const opts = Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, options[key] ?? values[0]]));
  const none = { payments: [], parts: [], strained: false, unconsciousAfter: false };

  // Unconscious: no action at all. Derived values cost nothing.
  if ( (current.body === 0) && (current.mind === 0) ) return { possible: false, ...none };
  if ( domain === null ) return { possible: true, ...none };

  const other = domain === "body" ? "mind" : "body";

  const normalParts = [{ key: "base", value: BASE_COST }];
  if ( ageGroup === "elder" ) normalParts.push({ key: "age", value: ELDER_SURCHARGE });
  normalParts.push(...surchargeParts(wounds[domain], fear, opts.surcharges));
  const normalCost = sum(normalParts);

  const strainWounds = wounds[opts.strainWounds === "check" ? domain : other];
  const strainParts = [{ key: "strain", value: STRAIN_COST }, ...surchargeParts(strainWounds, fear, opts.surcharges)];
  const strainCost = sum(strainParts);

  const left = { ...current };
  const payments = [];
  const pay = (payer, amount) => {
    const paid = Math.min(amount, left[payer]);
    if ( paid > 0 ) payments.push({ domain: payer, amount: paid });
    left[payer] -= paid;
  };

  let parts;
  let strained;
  if ( current[domain] === 0 ) {
    pay(other, strainCost);
    parts = strainParts;
    strained = true;
  }
  else if ( current[domain] >= normalCost ) {
    pay(domain, normalCost);
    parts = normalParts;
    strained = false;
  }
  else {
    const rest = normalCost - current[domain];
    pay(domain, current[domain]);
    pay(other, { full: normalCost, rest, strain: strainCost }[opts.shortfall]);
    parts = normalParts;
    strained = true;
  }

  return { possible: true, payments, parts, strained, unconsciousAfter: (left.body === 0) && (left.mind === 0) };
}

/**
 * Surcharges from wounds and fear as parts, leaving out those that add nothing.
 * @param {number} wounds
 * @param {number} fear
 * @param {string} mode  See OPTIONS.surcharges.
 * @returns {{key: string, value: number}[]}
 */
function surchargeParts(wounds, fear, mode) {
  let woundValue = Math.min(wounds, MAX_SURCHARGE);
  let fearValue = fear;
  if ( mode === "higher" ) {
    if ( woundValue >= fearValue ) fearValue = 0;
    else woundValue = 0;
  }
  else if ( mode === "capped" ) fearValue = Math.min(fearValue, MAX_SURCHARGE - woundValue);
  return [{ key: "wounds", value: woundValue }, { key: "fear", value: fearValue }].filter(part => part.value > 0);
}

/**
 * @param {{value: number}[]} parts
 * @returns {number}
 */
function sum(parts) {
  return parts.reduce((total, part) => total + part.value, 0);
}

/**
 * @throws {TypeError|RangeError} On invalid input.
 */
function validate({ domain, current, wounds, fear, ageGroup, options }) {
  const assertRange = (value, name, max = Infinity) => {
    if ( !Number.isInteger(value) ) throw new TypeError(`${name} must be an integer, got ${value}`);
    if ( (value < 0) || (value > max) ) throw new RangeError(`${name} out of range: ${value}`);
  };
  if ( (domain !== null) && !DOMAINS.includes(domain) ) throw new RangeError(`unknown domain ${domain}`);
  for ( const key of DOMAINS ) {
    assertRange(current?.[key], `stamina.${key}`);
    assertRange(wounds?.[key], `wounds.${key}`, MAX_WOUNDS);
  }
  assertRange(fear, "fear", MAX_FEAR);
  if ( !(ageGroup in AGE_GROUPS) ) throw new RangeError(`unknown age group ${ageGroup}`);
  for ( const [key, value] of Object.entries(options) ) {
    if ( !OPTIONS[key]?.includes(value) ) throw new RangeError(`unknown option ${key}: ${value}`);
  }
}
