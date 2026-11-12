/**
 * Migration 4 (#48): skills no longer have an entered value; their points come from items as active effects
 * (Metier, profession, innate traits), plus manual points in the modifier. The former entered value is added to the
 * modifier, so the total stays the same. The field stays in the data model for now, so it can be read here.
 * Migration 3 (innate traits) runs before and takes a trait's points out of the entered value first.
 */

/** Version of this migration; migrations are run in this order. */
export const version = 4;

/**
 * The stored skills of an actor: for unlinked tokens only what the token overrides, since the rest is
 * the world actor's and cleaned there.
 * @param {Actor} actor
 * @returns {object|undefined}
 */
function storedSkills(actor) {
  return (actor.isToken ? actor.token.delta?._source.system : actor._source.system)?.skills;
}

/**
 * The skills with an entered value other than 0, with their stored modifier. An entered 0 only needs emptying.
 * @param {Actor} actor
 * @returns {{key: string, value: number, mod: number}[]}
 */
function entered(actor) {
  return Object.entries(storedSkills(actor) ?? {})
    .filter(([, skill]) => (skill.value ?? null) !== null)
    .map(([key, skill]) => ({ key, value: skill.value, mod: actor._source.system.skills[key]?.mod ?? 0 }));
}

/**
 * Whether an actor still has an entered value for a skill.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needs(actor) {
  return (actor.type === "protagonist") && (entered(actor).length > 0);
}

/**
 * What the migration would do with an actor, for the GM to see before.
 * @param {Actor} actor
 * @returns {{text: string, details: string}[]}
 */
export function preview(actor) {
  return [{
    text: game.i18n.localize("KRISTALLPUNK.Cleanup.Skills"),
    details: entered(actor).filter(({ value }) => value).map(({ key, value }) => game.i18n.format(
      "KRISTALLPUNK.Cleanup.AttributeValue", { attribute: game.i18n.localize(CONFIG.KRISTALLPUNK.skills[key].label), value }
    )).join(", ")
  }];
}

/**
 * Add the entered values to the modifiers and empty them.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function migrate(actor) {
  const update = {};
  for ( const { key, value, mod } of entered(actor) ) {
    update[`system.skills.${key}.mod`] = mod + value;
    update[`system.skills.${key}.value`] = null;
  }
  await actor.update(update);
}
