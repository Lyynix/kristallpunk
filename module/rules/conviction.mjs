/**
 * Conviction (Innenleben, Kurzregeln 1.0, p. 9–10 and 13): stages, rerolls and shifts. Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.conviction.
 */

/** Official stages and their value ranges. */
export const CONVICTION_STAGES = {
  steadfast: { min: 3, max: 3 },
  confident: { min: 1, max: 2 },
  neutral: { min: 0, max: 0 },
  doubtful: { min: -2, max: -1 },
  desperate: { min: -3, max: -3 }
};

/**
 * Determine the conviction stage for a value.
 * @param {number} value                Conviction from -3 to +3.
 * @param {object} [options]
 * @param {object} [options.stages]     Value ranges, keyed by stage.
 * @returns {string|null}  The key of the stage, or null if the value lies outside all ranges.
 */
export function convictionStage(value, { stages = CONVICTION_STAGES } = {}) {
  const match = Object.entries(stages).find(([, { min, max }]) => (value >= min) && (value <= max));
  return match?.[0] ?? null;
}

/** Lowest and highest conviction (Kurzregeln 1.0, p. 9). */
export const LIMITS = { min: -3, max: 3 };

/**
 * Interpretations that can be switched; the first value is the default.
 * `tripleShift`: how far a double triple shifts conviction, "once" (±1 per check) or "each" (±1 per triple).
 * Open question, see issue #17.
 */
export const OPTIONS = {
  tripleShift: ["once", "each"]
};

/**
 * How a check may be rerolled by spending conviction (Kurzregeln 1.0, p. 9–10):
 * from +3 to +1 the sixes stay, from 0 to -2 all dice are rerolled, at -3 there is no reroll.
 * The value is the one before this check shifted conviction (provisional, see issue #17).
 * @param {number} value  Conviction from -3 to +3.
 * The dice themselves are rerolled with rules.check.reroll.
 * @returns {"keepSixes"|"all"|null}
 */
export function rerollMode(value) {
  assertConviction(value, "value");
  if ( value >= 1 ) return "keepSixes";
  if ( value > LIMITS.min ) return "all";
  return null;
}

/**
 * How a check changes conviction (Kurzregeln 1.0, p. 9–10 and 13).
 * - A reroll costs one point.
 * - The final result shifts conviction: +1 for a critical success, -1 for a critical failure.
 *   With a reroll only the new result counts; the shift of the first result does not apply (provisional, #17).
 * - The reroll is applied first, then the shift; each step stops at -3 and +3.
 * @param {object} data
 * @param {number} data.before            Conviction before this check changed it.
 * @param {boolean} [data.rerolled=false] Whether conviction was spent on a reroll.
 * @param {number} [data.critical=0]      Netted triples of the final result, from rules.check.evaluate.
 * @param {object} [data.options]         Interpretations, see OPTIONS; defaults are the first values.
 * @returns {{value: number, delta: number, clamped: boolean, parts: {key: string, value: number}[]}}
 *   `value` is the conviction afterwards, `delta` the change; `parts` lists reroll and shift as applied,
 *   `clamped` tells whether a limit cut a step short.
 */
export function consequences({ before, rerolled = false, critical = 0, options = {} }) {
  assertConviction(before, "before");
  if ( !Number.isInteger(critical) ) throw new TypeError("critical must be an integer");
  const tripleShift = options.tripleShift ?? OPTIONS.tripleShift[0];
  if ( !OPTIONS.tripleShift.includes(tripleShift) ) throw new RangeError(`unknown tripleShift ${tripleShift}`);
  if ( rerolled && (rerollMode(before) === null) ) throw new RangeError(`no reroll possible at ${before}`);

  let value = before;
  let clamped = false;
  const parts = [];
  const step = (key, change) => {
    const next = Math.min(LIMITS.max, Math.max(LIMITS.min, value + change));
    if ( next !== value + change ) clamped = true;
    parts.push({ key, value: next - value });
    value = next;
  };

  if ( rerolled ) step("reroll", -1);
  if ( critical !== 0 ) step("shift", tripleShift === "once" ? Math.sign(critical) : critical);
  return { value, delta: value - before, clamped, parts };
}

/**
 * @param {number} value
 * @param {string} name
 */
function assertConviction(value, name) {
  if ( !Number.isInteger(value) ) throw new TypeError(`${name} must be an integer`);
  if ( (value < LIMITS.min) || (value > LIMITS.max) ) throw new RangeError(`${name} must lie between -3 and +3`);
}
