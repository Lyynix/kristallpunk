/**
 * Migration 1 (#46): the free text of competences becomes competence items. One item per non-empty line;
 * a skill in a trailing parenthesis is taken over (see parse-competences.mjs). Where a competence of the same name
 * exists as template (in the system's compendium, in the world, or in another compendium), the item is made from
 * it, with its description, skill, automation and effects. The free text is emptied afterwards.
 * The field stays in the data model for now, so its content can still be read here.
 */

import { parseCompetences } from "./parse-competences.mjs";

/** Version of this migration; migrations are run in this order. */
export const version = 1;

/** The system's compendium of competences, searched first. */
const SYSTEM_PACK = "kristallpunk.competences";

/**
 * Whether an actor still has a free text of competences. Unlinked tokens only count with a text of their own:
 * otherwise they show the text of their world actor, which is cleaned there.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needs(actor) {
  if ( actor.type !== "protagonist" ) return false;
  const source = actor.isToken ? actor.token.delta?._source.system : actor._source.system;
  return !!source?.competences?.trim();
}

/**
 * Data shared by all actors of one cleanup: the skill names and the templates, gathered once.
 * @returns {Promise<{skills: Record<string, string>, templates: Map<string, object[]>}>}
 */
export async function prepare() {
  return { skills: skillNames(), templates: await gatherTemplates() };
}

/**
 * What the migration would do with an actor, for the GM to see before.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {{text: string, details?: string, warning?: boolean}[]}  Lines, the details shown on hover.
 */
export function preview(actor, context) {
  const plan = planFor(actor, context);
  const lines = [{
    text: plan.length === 1 ? game.i18n.localize("KRISTALLPUNK.Cleanup.Competence")
      : game.i18n.format("KRISTALLPUNK.Cleanup.Competences", { count: plan.length }),
    details: plan.map(describe).join("<br>")
  }];
  const fromTemplate = plan.filter(entry => entry.template);
  if ( fromTemplate.length ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.FromTemplate", { count: fromTemplate.length }),
    details: fromTemplate.map(describe).join("<br>")
  });
  const withoutSkill = plan.filter(entry => !entry.template && !entry.skill);
  if ( withoutSkill.length ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.WithoutSkill", { count: withoutSkill.length }),
    details: withoutSkill.map(describe).join("<br>"),
    warning: true
  });
  return lines;
}

/**
 * Turn the free text of one actor into competence items and empty it.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {Promise<void>}
 */
export async function migrate(actor, context) {
  const data = [];
  for ( const entry of planFor(actor, context) ) {
    const template = entry.template ? await fromUuid(entry.template.uuid) : null;
    if ( template ) {
      const item = game.items.fromCompendium(template, { clearFolder: true, keepId: false });
      if ( entry.specification ) item.system.specification = entry.specification;
      data.push(item);
    }
    else data.push({ name: entry.name, type: "competence", system: { skill: entry.skill, specification: entry.specification } });
  }
  if ( data.length ) await actor.createEmbeddedDocuments("Item", data);
  await actor.update({ "system.competences": "" });
}

/**
 * The competences an actor's free text becomes, each with its template if one fits.
 * A template fits by name; if several share the name, the skill named in the text decides.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {{name: string, skill: string|null, specification: string, template: object|null}[]}
 */
function planFor(actor, { skills, templates }) {
  return parseCompetences(actor.system.competences, skills).map(entry => {
    const candidates = templates.get(entry.name.toLowerCase()) ?? [];
    let template = null;
    if ( entry.skill ) template = candidates.find(candidate => candidate.skill === entry.skill) ?? null;
    else if ( new Set(candidates.map(candidate => candidate.skill)).size === 1 ) template = candidates[0];
    return { ...entry, template };
  });
}

/**
 * One planned competence for the tooltip, e.g. "Schleichen: Heimlichkeit (Kompendium Kompetenzen)".
 * @param {object} entry
 * @returns {string}
 */
function describe(entry) {
  const { escapeHTML } = foundry.utils;
  const name = entry.specification ? `${entry.name} (${entry.specification})` : entry.name;
  const skill = entry.template?.skill ?? entry.skill;
  const skillLabel = skill ? game.i18n.localize(CONFIG.KRISTALLPUNK.skills[skill]?.label ?? skill) : null;
  let text = skillLabel ? `${name}: ${skillLabel}` : name;
  if ( entry.template ) text += ` (${entry.template.source})`;
  return escapeHTML(text);
}

/**
 * Competences that can serve as templates, by their names in lower case. The system's compendium comes first,
 * then the world's items, then other compendiums of items.
 * @returns {Promise<Map<string, {uuid: string, skill: string|null, source: string}[]>>}
 */
async function gatherTemplates() {
  const templates = new Map();
  const add = (name, uuid, skill, source) => {
    const key = name.toLowerCase();
    if ( !templates.has(key) ) templates.set(key, []);
    const list = templates.get(key);
    // An earlier source wins over a later one with the same skill
    if ( !list.some(entry => entry.skill === skill) ) list.push({ uuid, skill: skill ?? null, source });
  };

  const systemPack = game.packs.get(SYSTEM_PACK);
  const otherPacks = game.packs.filter(pack => (pack.documentName === "Item") && (pack !== systemPack));
  const fromPack = async pack => {
    const index = await pack.getIndex({ fields: ["type", "system.skill"] });
    for ( const entry of index ) {
      if ( entry.type === "competence" ) add(entry.name, entry.uuid, entry.system?.skill, pack.title);
    }
  };

  if ( systemPack ) await fromPack(systemPack);
  for ( const item of game.items ) {
    if ( item.type === "competence" ) add(item.name, item.uuid, item.system.skill, game.i18n.localize("KRISTALLPUNK.Cleanup.World"));
  }
  for ( const pack of otherPacks ) await fromPack(pack);
  return templates;
}

/**
 * Skill keys by their localized names in lower case, plus the name used in the short rules for the skill
 * the sheet calls "Resonanz" (Kurzregeln 1.0, p. 6).
 * @returns {Record<string, string>}
 */
function skillNames() {
  const names = {};
  for ( const [key, { label }] of Object.entries(CONFIG.KRISTALLPUNK.skills) ) {
    names[game.i18n.localize(label).toLowerCase()] = key;
  }
  names[game.i18n.localize("KRISTALLPUNK.Skill.PrismResonanceShortRules").toLowerCase()] = "prismResonance";
  return names;
}
