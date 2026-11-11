/**
 * Migration 2 (#47): attributes no longer have an entered value; their points come from items as active effects,
 * plus manual points in the modifier. The former entered value is added to the modifier, so the total stays the
 * same, and the creation exception is dropped. The fields stay in the data model for now, so they can be read here.
 */

/** Version of this migration; migrations are run in this order. */
export const version = 2;

/**
 * The stored attributes of an actor: for unlinked tokens only what the token overrides, since the rest is
 * the world actor's and cleaned there.
 * @param {Actor} actor
 * @returns {object|undefined}
 */
function storedAttributes(actor) {
  return (actor.isToken ? actor.token.delta?._source.system : actor._source.system)?.attributes;
}

/**
 * Whether an actor still has an entered value for an attribute.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needs(actor) {
  if ( actor.type !== "protagonist" ) return false;
  return Object.values(storedAttributes(actor) ?? {}).some(attribute => (attribute.value ?? null) !== null);
}

/**
 * What the migration would do with an actor, for the GM to see before.
 * @param {Actor} actor
 * @returns {{text: string, details: string}[]}
 */
export function preview(actor) {
  return [{
    text: game.i18n.localize("KRISTALLPUNK.Cleanup.Attributes"),
    details: changes(actor).map(({ key, value }) => game.i18n.format("KRISTALLPUNK.Cleanup.AttributeValue", {
      attribute: game.i18n.localize(CONFIG.KRISTALLPUNK.attributes[key].label), value
    })).join(", ")
  }];
}

/**
 * Add the entered values to the modifiers and empty them.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function migrate(actor) {
  const update = {};
  for ( const { key, value, mod } of changes(actor) ) {
    Object.assign(update, {
      [`system.attributes.${key}.mod`]: mod + value,
      [`system.attributes.${key}.value`]: null,
      [`system.attributes.${key}.exception`]: false
    });
  }
  await actor.update(update);
}

/**
 * The attributes with an entered value, with their stored modifier.
 * @param {Actor} actor
 * @returns {{key: string, value: number, mod: number}[]}
 */
function changes(actor) {
  return Object.entries(storedAttributes(actor) ?? {})
    .filter(([, attribute]) => (attribute.value ?? null) !== null)
    .map(([key, attribute]) => ({ key, value: attribute.value, mod: actor._source.system.attributes[key]?.mod ?? 0 }));
}
