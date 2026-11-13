/**
 * Migration 6 (#49): armor and ward are no longer entered; they come from equipped protection items. A former
 * entered value becomes an equipped item of that rating, so the figure keeps its armor and ward. A former 0 is only
 * emptied. The field stays in the data model for now, so it can be read here.
 */

/** Version of this migration; migrations are run in this order. */
export const version = 6;

/**
 * The former entered values of an actor other than empty, by domain: for unlinked tokens only what the token
 * overrides, since the rest is the world actor's and cleaned there. Numbers stored before the data model changed
 * count as well.
 * @param {Actor} actor
 * @returns {{domain: string, key: string, value: number}[]}
 */
function entered(actor) {
  const source = actor.isToken ? actor.token.delta?._source.system : actor._source.system;
  return Object.entries(CONFIG.KRISTALLPUNK.domains).map(([domain, { protection: key }]) => {
    const stored = source?.[key];
    const value = typeof stored === "number" ? stored : (stored?.value ?? null);
    return { domain, key, value };
  }).filter(({ value }) => value !== null);
}

/**
 * Whether an actor still has an entered armor or ward.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needs(actor) {
  return (actor.type === "protagonist") && (entered(actor).length > 0);
}

/**
 * Label of armor or ward.
 * @param {string} key
 * @returns {string}
 */
function labelOf(key) {
  return game.i18n.localize(`KRISTALLPUNK.${key === "armor" ? "Armor" : "Ward"}.Label`);
}

/**
 * What the migration would do with an actor, for the GM to see before.
 * @param {Actor} actor
 * @returns {{text: string, details?: string}[]}
 */
export function preview(actor) {
  const items = entered(actor).filter(({ value }) => value > 0);
  if ( !items.length ) return [{ text: game.i18n.localize("KRISTALLPUNK.Cleanup.ProtectionEmpty") }];
  return [{
    text: game.i18n.format("KRISTALLPUNK.Cleanup.Protection", { count: items.length }),
    details: items.map(({ key, value }) => game.i18n.format("KRISTALLPUNK.Cleanup.AttributeValue", {
      attribute: labelOf(key), value
    })).join(", ")
  }];
}

/**
 * Turn the entered values into equipped protection items and empty them.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function migrate(actor) {
  const values = entered(actor);
  const items = values.filter(({ value }) => value > 0).map(({ domain, key, value }) => ({
    name: game.i18n.format("KRISTALLPUNK.Cleanup.ProtectionItem", { label: labelOf(key) }),
    type: "protection",
    system: { domain, rating: value, wear: 0, equipped: true }
  }));
  if ( items.length ) await actor.createEmbeddedDocuments("Item", items);
  const update = {};
  for ( const { key } of values ) update[`system.${key}.value`] = null;
  await actor.update(update);
}
