/**
 * The values of a protagonist that active effects are meant to change (#43, #44): the modifiers of attributes,
 * skills, stamina maxima and derived values. Effects never target entered values, see the data model.
 * Used to describe changes readably and to suggest targets in the effect configuration.
 */

/**
 * All targets with their effect key and readable name, in the order of the character sheet.
 * @returns {{key: string, label: string, group: string}[]}
 *   `key` is the full effect key (e.g. "system.attributes.strength.mod"); `group` the localized heading.
 */
export function effectTargets() {
  const { attributes, skills, domains, derived } = CONFIG.KRISTALLPUNK;
  const localize = key => game.i18n.localize(key);
  const targets = [];
  const add = (group, entries) => {
    for ( const [key, label] of entries ) targets.push({ key: `system.${key}`, label, group: localize(group) });
  };
  add("KRISTALLPUNK.Sheet.Attributes", Object.entries(attributes)
    .map(([key, config]) => [`attributes.${key}.mod`, localize(config.label)]));
  add("KRISTALLPUNK.Sheet.Skills", Object.entries(skills)
    .map(([key, config]) => [`skills.${key}.mod`, localize(config.label)]));
  add("KRISTALLPUNK.Sheet.Stamina", Object.keys(domains)
    .map(domain => [`stamina.${domain}.maxMod`, staminaMaxLabel(domain)]));
  add("KRISTALLPUNK.Sheet.Derived", Object.entries(derived)
    .map(([key, config]) => [`derived.${key}.mod`, localize(config.label)]));
  return targets;
}

/**
 * Readable name of an effect key: the target's name, or the key itself if it is no known target.
 * @param {string} key
 * @returns {string}
 */
export function targetLabel(key) {
  return effectTargets().find(target => target.key === key)?.label ?? key;
}

/**
 * One change of an effect in words, e.g. "Kraft +2", or "Kraft: Überschreiben 5" for other kinds than adding.
 * @param {{key: string, type: string, value: *}} change
 * @returns {string}
 */
export function describeChange(change) {
  const label = targetLabel(change.key);
  if ( change.type === "add" ) {
    const value = Number(change.value);
    if ( Number.isFinite(value) ) return `${label} ${value > 0 ? "+" : ""}${value}`;
  }
  return game.i18n.format("KRISTALLPUNK.Effects.OtherChange", { label, type: changeTypeLabel(change.type), value: change.value });
}

/**
 * Localized name of a kind of change, e.g. "Überschreiben".
 * @param {string} type
 * @returns {string}
 */
export function changeTypeLabel(type) {
  const label = foundry.documents.ActiveEffect.implementation.CHANGE_TYPES[type]?.label ?? type;
  return game.i18n.localize(label);
}

/**
 * "Körperausdauer max.", from the field label of the stamina.
 * @param {string} domain
 * @returns {string}
 */
function staminaMaxLabel(domain) {
  const fields = CONFIG.Actor.dataModels.protagonist.schema.fields;
  return game.i18n.format("KRISTALLPUNK.Sheet.MaxOf", { label: fields.stamina.fields[domain].fields.value.label });
}

/**
 * Suggest the targets in Foundry's effect configuration (#44): each key field of a change gets a list of the
 * targets with their names, and a tooltip with the name of the target it holds. Typing any other key stays
 * possible. Called during init.
 */
export function registerEffectTargetHooks() {
  Hooks.on("renderActiveEffectConfig", (app, element) => {
    const inputs = element.querySelectorAll('input[name^="system.changes."][name$=".key"]');
    if ( !inputs.length ) return;
    const id = `${app.id}-kristallpunk-targets`;
    let list = element.querySelector(`datalist#${CSS.escape(id)}`);
    if ( !list ) {
      list = document.createElement("datalist");
      list.id = id;
      for ( const target of effectTargets() ) {
        const option = document.createElement("option");
        option.value = target.key;
        option.label = `${target.group}: ${target.label}`;
        list.append(option);
      }
      element.append(list);
    }
    const labels = new Map(effectTargets().map(target => [target.key, target.label]));
    const showLabel = input => {
      const label = labels.get(input.value);
      if ( label ) input.dataset.tooltip = label;
      else delete input.dataset.tooltip;
    };
    for ( const input of inputs ) {
      input.setAttribute("list", id);
      input.setAttribute("autocomplete", "off");
      showLabel(input);
      input.addEventListener("input", () => showLabel(input));
    }
  });
}
