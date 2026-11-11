/**
 * Alternative effects of an item (#47): effects that share a choice group (`flags.kristallpunk.choice`) are
 * alternatives, e.g. "Medizin +2" or "Wissenschaft +2" of an innate trait. When the item is added to a figure,
 * one effect per group is chosen; the copy on the figure keeps only that one. Effects without a group always count.
 * The profession (#48) uses the same.
 */

/** Flag scope and key of the choice group. */
const SCOPE = "kristallpunk";
const KEY = "choice";

/**
 * The choice group of an effect, or null.
 * @param {object} effect  Effect data or document.
 * @returns {string|null}
 */
export function choiceGroup(effect) {
  const group = foundry.utils.getProperty(effect, `flags.${SCOPE}.${KEY}`);
  return (typeof group === "string") && group.trim() ? group.trim() : null;
}

/**
 * Groups with more than one effect to choose from.
 * @param {object[]} effects  Effect data.
 * @returns {Map<string, object[]>}
 */
function choiceGroups(effects) {
  const groups = new Map();
  for ( const effect of effects ) {
    const group = choiceGroup(effect);
    if ( !group ) continue;
    if ( !groups.has(group) ) groups.set(group, []);
    groups.get(group).push(effect);
  }
  for ( const [group, list] of groups ) if ( list.length < 2 ) groups.delete(group);
  return groups;
}

/**
 * Resolve the alternatives of an item that is about to be added to a figure: ask for the groups not chosen
 * already, then keep only the chosen effect of each group, without its group.
 * Called from the item's _preCreate, so it changes the item before it is created.
 * @param {Item} item  The item about to be created.
 * @param {Record<string, string>} [preset]  Chosen effect ids by group, e.g. from the file cleanup.
 * @returns {Promise<boolean>}  False if the choice was cancelled; the item should not be created then.
 */
export async function resolveEffectChoices(item, preset = {}) {
  const effects = item._source.effects ?? [];
  const groups = choiceGroups(effects);
  if ( !groups.size ) return true;

  const chosen = { ...preset };
  const open = [...groups].filter(([group, list]) => !list.some(effect => effect._id === chosen[group]));
  if ( open.length ) {
    const answer = await askChoices(item, open);
    if ( !answer ) return false;
    Object.assign(chosen, answer);
  }

  const kept = effects.filter(effect => {
    const group = choiceGroup(effect);
    return !groups.has(group) || (effect._id === chosen[group]);
  }).map(effect => {
    if ( !choiceGroup(effect) ) return effect;
    const copy = foundry.utils.deepClone(effect);
    delete copy.flags[SCOPE][KEY];
    return copy;
  });
  // Not recursive: otherwise Foundry merges the effects by id and keeps the ones left out
  item.updateSource({ effects: kept }, { recursive: false });
  return true;
}

/**
 * Ask which effect of each group should count.
 * @param {Item} item
 * @param {[string, object[]][]} groups
 * @returns {Promise<Record<string, string>|null>}  Chosen effect ids by group, or null if cancelled.
 */
async function askChoices(item, groups) {
  const { escapeHTML } = foundry.utils;
  const fieldsets = groups.map(([group, effects], index) => `
    <fieldset>
      <legend>${escapeHTML(group)}</legend>
      ${effects.map((effect, i) => `
        <label class="checkbox">
          <input type="radio" name="group${index}" value="${effect._id}" ${i === 0 ? "checked" : ""}>
          ${escapeHTML(effect.name)}
        </label>`).join("")}
    </fieldset>`).join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.format("KRISTALLPUNK.EffectChoice.Title", { item: item.name }), icon: "fa-solid fa-list-check" },
    classes: ["kristallpunk", "effect-choice"],
    content: `<p>${escapeHTML(game.i18n.format("KRISTALLPUNK.EffectChoice.Hint", { item: item.name }))}</p>${fieldsets}`,
    ok: {
      label: "KRISTALLPUNK.EffectChoice.Confirm",
      icon: "fa-solid fa-check",
      callback: (event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        return Object.fromEntries(groups.map(([group], index) => [group, data[`group${index}`]]));
      }
    },
    rejectClose: false
  });
  return result ?? null;
}

/**
 * The field for the choice group in Foundry's effect configuration, on the details tab, and the hint in effect
 * lists. Called during init.
 */
export function registerEffectChoiceHooks() {
  Hooks.on("renderActiveEffectConfig", (app, element) => {
    const details = element.querySelector('.tab[data-tab="details"]');
    if ( !details || details.querySelector(".kristallpunk-choice") ) return;
    const group = document.createElement("div");
    group.className = "form-group kristallpunk-choice";
    const label = game.i18n.localize("KRISTALLPUNK.EffectChoice.Group");
    const hint = game.i18n.localize("KRISTALLPUNK.EffectChoice.GroupHint");
    group.innerHTML = `<label>${label}</label>
      <div class="form-fields"><input type="text" name="flags.${SCOPE}.${KEY}"></div>
      <p class="hint">${hint}</p>`;
    group.querySelector("input").value = choiceGroup(app.document) ?? "";
    group.querySelector("input").disabled = !app.isEditable;
    details.append(group);
  });
}
