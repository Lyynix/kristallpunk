/**
 * Where a value comes from (#43): the parts of a modifier and the tooltip text that explains a value.
 * Used by the character sheet; built so the token hotbar can use it too.
 */

/**
 * The parts of a stored modifier after active effects: one part per change of an applied effect that targets
 * the modifier, then the manual adjustment. Only changes of the phase "initial" count, since only they are
 * applied before the derived values are computed.
 * @param {Actor} actor
 * @param {string} path  Path of the modifier in the system data, e.g. "attributes.strength.mod".
 * @returns {{label: string, value: number|null, type: string|null}[]}
 *   `value` is the amount for changes that add, null for other kinds of change; `type` names those kinds
 *   (localized), null for adding changes and the manual adjustment.
 */
export function modifierParts(actor, path) {
  const key = `system.${path}`;
  const parts = [];
  for ( const effect of actor.appliedEffects ) {
    for ( const change of effect.system.changes ) {
      if ( (change.key !== key) || ((change.phase ?? "initial") !== "initial") ) continue;
      const label = effectLabel(effect);
      if ( change.type === "add" ) {
        const value = Number(change.value);
        parts.push({ label, value: Number.isFinite(value) ? value : null, type: null });
      } else {
        const type = foundry.documents.ActiveEffect.implementation.CHANGE_TYPES[change.type]?.label ?? change.type;
        parts.push({ label, value: null, type: `${game.i18n.localize(type)} ${change.value}` });
      }
    }
  }
  const manual = foundry.utils.getProperty(actor._source.system, path) ?? 0;
  if ( manual ) parts.push({ label: game.i18n.localize("KRISTALLPUNK.Sheet.Column.Mod"), value: manual, type: null });
  return parts;
}

/**
 * Name of an effect for the breakdown, with the item it comes from if it is named differently.
 * @param {ActiveEffect} effect
 * @returns {string}
 */
function effectLabel(effect) {
  const item = effect.parent instanceof foundry.documents.Item ? effect.parent : null;
  if ( !item || (item.name === effect.name) ) return effect.name;
  return game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.FromItem", { effect: effect.name, item: item.name });
}

/**
 * Tooltip text of a value: the base computation, the parts of its modifier, and a cap if one applied.
 * Lines are separated by <br>; labels are escaped, since effect names are entered by users.
 * - Without parts and cap: "Kraft 6 + Wille 4 = 10"
 * - With parts: "Kraft 6 + Wille 4 = 10, Trank +1, Mod +1 → 12"
 * - With a cap: an extra line "Grenze 7: 8 wird zu 7"
 * @param {object} data
 * @param {({label: string, value: number}|string)[]} data.terms  The terms of the base computation; a string
 *                                                       is a term formatted already (not escaped).
 * @param {number} data.base                             Result of the base computation.
 * @param {number} [data.mod=0]                          The prepared modifier, after active effects.
 * @param {{label: string, value: number|null, type: string|null}[]} [data.parts]  From modifierParts.
 *                                                       They only describe the modifier: changes of other
 *                                                       kinds than adding cannot be summed up.
 * @param {{min: number, max: number}} [data.limits]     Limits the value is kept within, if any.
 * @returns {{text: string, value: number, detailed: boolean}}  The text, the resulting value, and whether
 *   the text lists modifier parts or a cap.
 */
export function breakdown({ terms, base, mod = 0, parts = [], limits }) {
  const { escapeHTML } = foundry.utils;
  const term = ({ label, value }) => game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Term", { label: escapeHTML(label), value });
  let text = terms.map(entry => (typeof entry === "string" ? entry : term(entry))).join(" + ");
  if ( (terms.length > 1) || (typeof terms[0] === "string") || (terms[0]?.value !== base) ) {
    text = game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Result", { terms: text, result: base });
  }

  // A modifier without known parts, e.g. from effects of a later phase, still shows up
  if ( !parts.length && mod ) parts = [{ label: game.i18n.localize("KRISTALLPUNK.Sheet.Column.Mod"), value: mod, type: null }];
  const raw = base + mod;
  if ( parts.length ) {
    const mods = parts.map(part => (part.type === null
      ? term({ label: part.label, value: signed(part.value) })
      : term({ label: part.label, value: escapeHTML(part.type) })));
    text = game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.WithMods", { base: text, mods: mods.join(", "), total: raw });
  }

  let value = raw;
  if ( limits ) {
    value = Math.min(limits.max, Math.max(limits.min, raw));
    if ( value !== raw ) {
      const key = value === limits.max ? "CappedMax" : "CappedMin";
      text += `<br>${game.i18n.format(`KRISTALLPUNK.Sheet.Breakdown.${key}`, { limit: value, raw, value })}`;
    }
  }
  return { text, value, detailed: (parts.length > 0) || (value !== raw) };
}

/**
 * A number with its sign, e.g. +2, -1, 0.
 * @param {number} value
 * @returns {string}
 */
function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}
