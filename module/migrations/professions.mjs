/**
 * Migration 5 (#48): the free text "Metier / Profession" becomes calling and profession items, from the templates
 * named in it (see profession-text.mjs). The profession brings its calling as on a figure, but no competences: the
 * figure's competences became items in migration 1 already, so those that fit the profession's places are marked as
 * brought by it instead. Their points were part of the former entered values, which migrations 2 and 4 made manual
 * points, so they are taken out of the manual points again, and the totals stay the same; manual points do not go
 * below 0, a shortfall is reported.
 *
 * A text without a calling or profession found, or with several professions that fit, is appended to the
 * background instead, so nothing is lost; the GM adds calling and profession by hand. Either way the free text is
 * emptied. The field stays in the data model for now, so it can still be read here.
 */

import { gatherTemplates } from "./templates.mjs";
import { matchProfessionText } from "./profession-text.mjs";

/** Version of this migration; migrations are run in this order. */
export const version = 5;

/** The system's compendiums of callings and professions. */
const PACKS = { calling: "kristallpunk.callings", profession: "kristallpunk.professions" };

/**
 * The stored free text of an actor: for unlinked tokens only a text of their own.
 * @param {Actor} actor
 * @returns {string}
 */
function textOf(actor) {
  const source = actor.isToken ? actor.token.delta?._source.system : actor._source.system;
  return (source?.profession ?? "").trim();
}

/**
 * Whether an actor still has a free text of calling and profession.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needs(actor) {
  return (actor.type === "protagonist") && !!textOf(actor);
}

/**
 * Data shared by all actors of one cleanup: the templates of callings and professions, gathered once.
 * @returns {Promise<{templates: {calling: Map, profession: Map}, names: {callings: string[], professions: string[]}}>}
 */
export async function prepare() {
  const templates = {
    calling: await gatherTemplates({ type: "calling", pack: PACKS.calling }),
    profession: await gatherTemplates({ type: "profession", pack: PACKS.profession, fields: ["system.calling"] })
  };
  const namesOf = map => [...map.values()].map(([first]) => first.entry.name);
  return { templates, names: { callings: namesOf(templates.calling), professions: namesOf(templates.profession) } };
}

/**
 * What to do with an actor: the templates of calling and profession found, and what the figure has already.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {{text: string, calling: object|null, profession: object|null, candidates: string[], keep: boolean}}
 */
function planFor(actor, { templates, names }) {
  const text = textOf(actor);
  const match = matchProfessionText(text, names);
  const template = (type, name) => (name ? templates[type].get(name.toLowerCase())?.[0] ?? null : null);
  const profession = actor.itemTypes.profession.length ? null : template("profession", match.profession);
  const calling = actor.itemTypes.calling.length ? null : template("calling", match.calling);
  // Kept in the background if the text names nothing that was found, or several professions
  const keep = match.candidates.length > 0 || (!match.calling && !match.profession);
  return { text, calling, profession, candidates: match.candidates, keep };
}

/**
 * What the migration would do with an actor, for the GM to see before.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {{text: string, details?: string, warning?: boolean}[]}
 */
export function preview(actor, context) {
  const { escapeHTML } = foundry.utils;
  const plan = planFor(actor, context);
  const describe = template => escapeHTML(`${template.entry.name}${template.inSystemPack ? "" : ` (${template.source})`}`);
  const lines = [];
  const found = [plan.calling, plan.profession].filter(Boolean);
  if ( found.length ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.Profession", { text: plan.text }),
    details: found.map(describe).join("<br>")
  });
  if ( plan.candidates.length ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.ProfessionAmbiguous", { text: plan.text }),
    details: plan.candidates.map(escapeHTML).join("<br>"),
    warning: true
  });
  else if ( plan.keep ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.ProfessionUnknown", { text: plan.text }),
    warning: true
  });
  if ( !found.length && !plan.keep ) lines.push({
    text: game.i18n.format("KRISTALLPUNK.Cleanup.ProfessionPresent", { text: plan.text })
  });
  return lines;
}

/**
 * Turn the free text of one actor into calling and profession, take their points out of the manual points, and
 * empty the text.
 * @param {Actor} actor
 * @param {object} context  From prepare().
 * @returns {Promise<void>}
 */
export async function migrate(actor, context) {
  const plan = planFor(actor, context);
  const created = [];
  const fromTemplate = async template => {
    const source = template ? await fromUuid(template.uuid) : null;
    return source ? game.items.fromCompendium(source, { clearFolder: true, keepId: false }) : null;
  };

  // The profession, without bringing anything along itself
  let profession = null;
  const professionData = await fromTemplate(plan.profession);
  if ( professionData ) {
    [profession] = await actor.createEmbeddedDocuments("Item", [professionData], { kristallpunk: { bringAlong: false } });
    if ( profession ) created.push(profession);
  }

  // The calling: named in the text, or the profession's, then brought by it
  if ( !actor.itemTypes.calling.length ) {
    let callingData = await fromTemplate(plan.calling);
    let grantedBy = null;
    if ( !callingData && profession?.system.calling ) {
      const source = await fromUuid(profession.system.calling);
      if ( source ) callingData = game.items.fromCompendium(source, { clearFolder: true, keepId: false });
      grantedBy = profession.id;
    }
    if ( callingData ) {
      if ( grantedBy ) foundry.utils.setProperty(callingData, "flags.kristallpunk.grantedBy", grantedBy);
      const [calling] = await actor.createEmbeddedDocuments("Item", [callingData]);
      if ( calling ) created.push(calling);
    }
  }

  // The figure's competences that fit the profession's places count as brought by it
  if ( profession ) {
    const names = new Set();
    for ( const slot of profession.system.competenceSlots ) {
      for ( const uuid of slot.options ) {
        const name = (await fromUuid(uuid))?.name;
        if ( name ) names.add(name.toLowerCase());
      }
    }
    const fitting = actor.itemTypes.competence.filter(item => names.has(item.name.toLowerCase())
      && !item.getFlag("kristallpunk", "grantedBy"));
    if ( fitting.length ) await actor.updateEmbeddedDocuments("Item", fitting.map(item => ({
      _id: item.id, "flags.kristallpunk.grantedBy": profession.id
    })));
  }

  // The points the new items give, out of the manual points
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
  const update = { "system.profession": "" };
  const short = [];
  for ( const group of ["attributes", "skills"] ) {
    for ( const [key, value] of Object.entries(points[group]) ) {
      if ( !stored[group][key] || !value ) continue;
      const mod = stored[group][key].mod ?? 0;
      // Not below 0, unless it was below already
      const result = Math.max(mod - value, Math.min(mod, 0));
      if ( result !== mod - value ) {
        const config = CONFIG.KRISTALLPUNK[group][key];
        short.push(`${game.i18n.localize(config?.label ?? key)} ${result - (mod - value)}`);
      }
      update[`system.${group}.${key}.mod`] = result;
    }
  }

  // An unclear text is kept in the background
  if ( plan.keep ) {
    const label = game.i18n.localize("KRISTALLPUNK.Cleanup.ProfessionKept");
    const note = `<p><strong>${foundry.utils.escapeHTML(label)}</strong> ${foundry.utils.escapeHTML(plan.text)}</p>`;
    update["system.background"] = `${stored.background ?? ""}${note}`;
  }
  await actor.update(update);

  if ( short.length ) ui.notifications.warn(game.i18n.format("KRISTALLPUNK.Cleanup.ProfessionShort", {
    actor: actor.name, points: short.join(", ")
  }));
}
