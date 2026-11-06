/**
 * Checks (Proben). Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.check.
 */

/** Largest net bonus or penalty on a single check (rule of 3, Kurzregeln 1.0, p. 5 and 12). */
export const MAX_MODIFIER = 3;

/** Smallest number of dice on any check (rule of 1, Kurzregeln 1.0, p. 12). */
export const MIN_DICE = 1;

/**
 * Check grades and the number of sixes they need (Kurzregeln 1.0, p. 12–13).
 * A carefree check counts as successful without any six.
 */
export const GRADES = {
  carefree: { successes: 0 },
  daring: { successes: 1 },
  fateful: { successes: 2 }
};

/** Equal faces that form a triple (Dreierpasch). */
export const TRIPLE = 3;

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
 * Evaluate a rolled check (Kurzregeln 1.0, p. 4, 12–13).
 * - Every six is a success; ones are counted for rerolls.
 * - Every full triple of sixes is a critical success, every full triple of ones a critical failure.
 *   With fewer than three dice, all showing 1 also count as a critical failure.
 * - Triples of sixes and ones are netted against each other (provisional, see issue #17):
 *   `critical` is positive for critical successes, negative for critical failures, 0 if they cancel out.
 * - A critical success always succeeds, a critical failure always fails;
 *   otherwise the grade decides how many sixes are needed.
 * @param {object} data
 * @param {number[]} data.faces  The rolled faces, 1 to 6.
 * @param {string} data.grade    Key of the grade: carefree, daring or fateful.
 * @returns {{successes: number, ones: number, critical: number,
 *   criticalSuccess: boolean, criticalFailure: boolean, success: boolean}}
 */
export function evaluate({ faces, grade }) {
  if ( !Array.isArray(faces) || !faces.length ) throw new TypeError("faces must contain at least one die");
  for ( const face of faces ) {
    if ( !Number.isInteger(face) || (face < 1) || (face > 6) ) throw new RangeError(`invalid face ${face}`);
  }
  if ( !(grade in GRADES) ) throw new RangeError(`unknown grade ${grade}`);

  const successes = faces.filter(face => face === 6).length;
  const ones = faces.filter(face => face === 1).length;

  const sixTriples = Math.floor(successes / TRIPLE);
  let oneTriples = Math.floor(ones / TRIPLE);
  if ( (faces.length < TRIPLE) && (ones === faces.length) ) oneTriples = 1;
  const critical = sixTriples - oneTriples;

  let success;
  if ( critical > 0 ) success = true;
  else if ( critical < 0 ) success = false;
  else success = successes >= GRADES[grade].successes;

  return {
    successes,
    ones,
    critical,
    criticalSuccess: critical > 0,
    criticalFailure: critical < 0,
    success
  };
}

/**
 * Ways to reroll dice of a check:
 * - by spending conviction (Kurzregeln 1.0, p. 9–10): `keepSixes` keeps the sixes, `all` rerolls every die;
 * - by a competence (Kurzregeln 1.0, p. 6): `ones` rerolls all ones.
 */
export const REROLL_MODES = ["keepSixes", "all", "ones"];

/** The reroll modes that spend conviction. */
export const CONVICTION_REROLLS = ["keepSixes", "all"];

/**
 * Interpretations that can be switched; the first value is the default.
 * `competenceAgain`: after a conviction reroll a competence may be used once more,
 * "afterConviction" even if it was used before, "onlyIfUnused" only if it was not (issue #7).
 */
export const OPTIONS = {
  competenceAgain: ["afterConviction", "onlyIfUnused"]
};

/**
 * Which dice stay and how many are rolled anew.
 * @param {object} data
 * @param {number[]} data.faces  The current faces, 1 to 6.
 * @param {string} data.mode     keepSixes, all or ones, see REROLL_MODES.
 * @returns {{keep: number[], count: number}}  `keep` in their current order.
 */
export function reroll({ faces, mode }) {
  if ( !Array.isArray(faces) || !faces.length ) throw new TypeError("faces must contain at least one die");
  for ( const face of faces ) {
    if ( !Number.isInteger(face) || (face < 1) || (face > 6) ) throw new RangeError(`invalid face ${face}`);
  }
  assertRerollMode(mode);
  let keep;
  if ( mode === "keepSixes" ) keep = faces.filter(face => face === 6);
  else if ( mode === "ones" ) keep = faces.filter(face => face !== 1);
  else keep = [];
  return { keep, count: faces.length - keep.length };
}

/**
 * Whether a check may still be rerolled in a mode, given the rerolls so far.
 * - Conviction: once per check (Kurzregeln 1.0, p. 9–10).
 * - Competence: once per check, and once more after a conviction reroll (Kurzregeln 1.0, p. 6 and 9–10;
 *   provisional, see issue #7 and OPTIONS).
 * Whether there are dice to reroll, whether the check is on a skill and how conviction stands
 * is up to the caller.
 * @param {object} data
 * @param {string[]} data.rerolls  Modes of the rerolls so far, in order.
 * @param {string} data.mode       The mode asked for.
 * @param {object} [data.options]  Interpretations, see OPTIONS; defaults are the first values.
 * @returns {boolean}
 */
export function canReroll({ rerolls, mode, options = {} }) {
  assertRerollMode(mode);
  for ( const done of rerolls ) assertRerollMode(done);
  const competenceAgain = options.competenceAgain ?? OPTIONS.competenceAgain[0];
  if ( !OPTIONS.competenceAgain.includes(competenceAgain) ) {
    throw new RangeError(`unknown competenceAgain ${competenceAgain}`);
  }

  const conviction = rerolls.findIndex(done => CONVICTION_REROLLS.includes(done));
  if ( CONVICTION_REROLLS.includes(mode) ) return conviction === -1;

  const used = rerolls.filter(done => done === "ones").length;
  if ( conviction === -1 ) return used === 0;
  if ( competenceAgain === "onlyIfUnused" ) return used === 0;
  return !rerolls.slice(conviction + 1).includes("ones");
}

/**
 * @param {string} mode
 * @throws {RangeError} If the mode is unknown.
 */
function assertRerollMode(mode) {
  if ( !REROLL_MODES.includes(mode) ) throw new RangeError(`unknown reroll mode ${mode}`);
}

/**
 * @param {*} value
 * @param {string} name
 * @throws {TypeError} If the value is not an integer.
 */
function assertInteger(value, name) {
  if ( !Number.isInteger(value) ) throw new TypeError(`${name} must be an integer, got ${value}`);
}
