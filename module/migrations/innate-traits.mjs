/**
 * Migration 3 (#47): the free text of innate traits becomes innate trait items. Where a trait of the same name exists
 * as template, the item is made from it with its effects; alternatives are chosen in the dialog of #47. The points of
 * its effects were part of the former entered values already, so they are taken out of them again, and the totals
 * stay the same:
 * - attribute points out of the manual points of the attribute, where migration 2 put the former value;
 * - skill points out of the skill value, the rest out of its modifier; once migration 4 emptied the value (#48),
 *   all of it out of the modifier.
 * Mut, Härte and Seelenhalt were computed on the former sheet and never held a trait's points, so they stay.
 * The free text is emptied afterwards. The field stays in the data model for now, so it can still be read here.
 */

import { gatherTemplates } from "./templates.mjs";

/** Version of this migration; migrations are run in this order. */
export const version = 3;

/** The system's compendium of innate traits. */
const SYSTEM_PACK = "kristallpunk.innateTraits";

/**
 * The trait names of the free text: the non-empty entries.
 * @param {Actor} actor
 * @returns {string[]}
 */
function namesOf(actor) {
  return (actor.system.innateTraits ?? []).map(name => name?.trim()).filter(Boolean);
}

/**
 * Whether an actor still has a free text of innate traits. Unlinked tokens only count with a text of their own.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needs(actor) {
  if ( actor.type !== "protagonist" ) return false;
  const source = actor.isToken ? actor.token.delta?._source.system : actor._source.system;
  return (source?.innateTraits ?? []).some(name => name?.trim());
}

/**
 * Data shared by all actors of one cleanup: the templates, gathered once.
 * @returns {Promise<{templates: Map<string, object[]>}>}
 */
export async function prepare() {
  return { templates: await gatherTemplates({ type: "innateTrait", pack: SYSTEM_PACK }) };
}

/**
 * What the migration would do with an actor, for the GM to see before.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {{text: string, details?: string, warning?: boolean}[]}
 */
export function preview(actor, { templates }) {
  const { escapeHTML } = foundry.utils;
  const plan = namesOf(actor).map(name => ({ name, template: templates.get(name.toLowerCase())?.[0] ?? null }));
  const describe = entry => escapeHTML(entry.template ? `${entry.name} (${entry.template.source})` : entry.name);
  const lines = [{
    text: game.i18n.format("KRISTALLPUNK.Cleanup.InnateTraits", { count: plan.length }),
    details: plan.map(describe).join("<br>")
  }];
  const fromTemplate = plan.filter(entry => entry.template);
  if ( fromTemplate.length ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.InnateTraitsFromTemplate", { count: fromTemplate.length }),
    details: fromTemplate.map(describe).join("<br>")
  });
  const without = plan.filter(entry => !entry.template);
  if ( without.length ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.InnateTraitsWithoutTemplate", { count: without.length }),
    details: without.map(describe).join("<br>"),
    warning: true
  });
  return lines;
}

/**
 * Turn the free text of one actor into innate trait items, take their points out of the former values, and empty
 * the text. A trait whose choice is cancelled is skipped, with a warning.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {Promise<void>}
 */
export async function migrate(actor, { templates }) {
  const created = [];
  for ( const name of namesOf(actor) ) {
    const template = templates.get(name.toLowerCase())?.[0];
    const source = template ? await fromUuid(template.uuid) : null;
    const data = source
      ? game.items.fromCompendium(source, { clearFolder: true, keepId: false })
      : { name, type: "innateTrait" };
    const [item] = await actor.createEmbeddedDocuments("Item", [data]);
    if ( item ) created.push(item);
    else ui.notifications.warn(game.i18n.format("KRISTALLPUNK.Cleanup.InnateTraitSkipped", { name, actor: actor.name }));
  }

  // The points the new traits give, by attribute and skill
  const points = { attributes: {}, skills: {} };
  for ( const item of created ) {
    for ( const effect of item.effects ) {
      for ( const change of effect.system.changes ) {
        const match = change.key.match(/^system\.(attributes|skills)\.(\w+)\.mod$/);
        const value = Number(change.value);
        if ( !match || (change.type !== "add") || !Number.isFinite(value) ) continue;
        points[match[1]][match[2]] = (points[match[1]][match[2]] ?? 0) + value;
      }
    }
  }

  const stored = actor._source.system;
  const update = { "system.innateTraits": ["", "", ""] };
  for ( const [key, value] of Object.entries(points.attributes) ) {
    update[`system.attributes.${key}.mod`] = (stored.attributes[key]?.mod ?? 0) - value;
  }
  for ( const [key, value] of Object.entries(points.skills) ) {
    const skill = stored.skills[key];
    if ( !skill ) continue;
    const current = skill.value ?? 0;
    const fromValue = Math.min(current, value);
    if ( skill.value !== null ) update[`system.skills.${key}.value`] = current - fromValue;
    if ( value > fromValue ) update[`system.skills.${key}.mod`] = skill.mod - (value - fromValue);
  }
  await actor.update(update);
}
