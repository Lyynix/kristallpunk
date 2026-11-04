/**
 * Age groups (Erschaffung 1.0, p. 32). Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.age.
 */

/** Official age ranges; `max: null` means open-ended. */
export const AGE_GROUPS = {
  youth: { min: 15, max: 20 },
  adult: { min: 21, max: 45 },
  mature: { min: 46, max: 65 },
  elder: { min: 66, max: null }
};

/** Groups playing without the age rule treat everyone as 21–45 (Erschaffung 1.0, p. 32). */
export const DEFAULT_AGE_GROUP = "adult";

/**
 * Determine the age group for an age.
 * @param {number|null} age                     Age in years; null or undefined if not set.
 * @param {object} [options]
 * @param {object} [options.groups]             Age ranges, keyed by group.
 * @param {string} [options.fallback]           Group used when no age is set.
 * @returns {string}  The key of the age group. Ages below the youngest range count as that range.
 */
export function ageGroup(age, { groups = AGE_GROUPS, fallback = DEFAULT_AGE_GROUP } = {}) {
  if ( (age === null) || (age === undefined) ) return fallback;
  const entries = Object.entries(groups);
  const match = entries.find(([, { min, max }]) => (age >= min) && ((max === null) || (age <= max)));
  if ( match ) return match[0];
  // Younger than any playable range: use the youngest one
  return entries.reduce((youngest, entry) => (entry[1].min < youngest[1].min ? entry : youngest))[0];
}
