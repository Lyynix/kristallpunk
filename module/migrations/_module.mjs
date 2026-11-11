/**
 * Data migrations of actors, shown to the GM as "Aktenbereinigung" (#46). Nothing is migrated on its own:
 * the GM sees which figures need cleaning and what would change, and cleans single figures or all of them.
 *
 * A migration is a module with:
 * - `version`: its place in the order, starting at 1
 * - `needs(actor)`: whether the actor's data still needs it; tells from the data itself, so a cleaned actor
 *   no longer needs it
 * - `prepare()` (optional, async): data shared by all actors of one cleanup, e.g. templates looked up once
 * - `preview(actor, context)`: what it would do, as lines `{text, details?, warning?}`
 * - `migrate(actor, context)`: do it
 */

import * as competences from "./competences.mjs";

/** All migrations, in order. */
const MIGRATIONS = [competences].sort((a, b) => a.version - b.version);

/** The version of the newest migration. */
export const NEWEST = MIGRATIONS.at(-1).version;

/**
 * The migrations an actor still needs.
 * @param {Actor} actor
 * @returns {object[]}
 */
export function pendingFor(actor) {
  return MIGRATIONS.filter(migration => migration.needs(actor));
}

/**
 * Whether an actor needs cleaning before its sheet can be used.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needsCleanup(actor) {
  return MIGRATIONS.some(migration => migration.needs(actor));
}

/**
 * All actors that need cleaning: the actors of the world, and the actors of unlinked tokens on scenes, whose
 * data lives with the token.
 * @returns {Actor[]}
 */
export function actorsToClean() {
  const actors = game.actors.filter(needsCleanup);
  for ( const scene of game.scenes ) {
    for ( const token of scene.tokens ) {
      if ( !token.actorLink && token.actor && needsCleanup(token.actor) ) actors.push(token.actor);
    }
  }
  return actors;
}

/**
 * The shared data of all migrations for one cleanup, from their prepare().
 * @returns {Promise<Map<object, object>>}  Context by migration.
 */
export async function prepareCleanup() {
  const contexts = new Map();
  for ( const migration of MIGRATIONS ) contexts.set(migration, await migration.prepare?.());
  return contexts;
}

/**
 * What cleaning an actor would do, as lines from the previews of the migrations it needs.
 * @param {Actor} actor
 * @param {Map<object, object>} contexts  From prepareCleanup().
 * @returns {{text: string, details?: string, warning?: boolean}[]}
 */
export function previewCleanup(actor, contexts) {
  return pendingFor(actor).flatMap(migration => migration.preview(actor, contexts.get(migration)));
}

/**
 * Run the migrations an actor needs, in order.
 * @param {Actor} actor
 * @param {Map<object, object>} [contexts]  From prepareCleanup(); prepared anew if not given.
 * @returns {Promise<void>}
 */
export async function cleanActor(actor, contexts) {
  contexts ??= await prepareCleanup();
  for ( const migration of pendingFor(actor) ) await migration.migrate(actor, contexts.get(migration));
}
