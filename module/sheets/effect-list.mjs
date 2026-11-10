import { describeChange } from "../data/effect-targets.mjs";

/**
 * The list of active effects (#44), shared by the character sheet and the item sheet (#45).
 * A sheet renders the partial with `effectGroups` from prepareEffectGroups() and adds EFFECT_ACTIONS
 * to its actions. The actions work on the sheet's document.
 */

/** Name of the partial, loaded during init. */
export const PARTIAL = "kristallpunk.effect-list";

/** Template of the partial. */
export const TEMPLATE = "systems/kristallpunk/templates/parts/effect-list.hbs";

/**
 * The effects of a document as two groups: active and inactive (switched off, or suppressed, e.g. because
 * their duration ran out), each sorted by name. An actor lists its own effects and those transferred from its
 * items; an item lists its own.
 * @param {Actor|Item} document
 * @returns {object[]}
 */
export function prepareEffectGroups(document) {
  const groups = {
    active: { key: "active", label: "KRISTALLPUNK.Effects.Active", disabled: false, effects: [] },
    inactive: { key: "inactive", label: "KRISTALLPUNK.Effects.Inactive", disabled: true, effects: [] }
  };
  for ( const group of Object.values(groups) ) {
    group.createHint = game.i18n.localize(`KRISTALLPUNK.Effects.Create.${group.key}`);
  }
  const effects = document instanceof foundry.documents.Actor ? document.allApplicableEffects() : document.effects;
  for ( const effect of effects ) {
    // Only effects transferred from an item of the actor have an item as source
    const item = (effect.parent !== document) && (effect.parent instanceof foundry.documents.Item) ? effect.parent : null;
    groups[effect.active ? "active" : "inactive"].effects.push({
      uuid: effect.uuid,
      name: effect.name,
      img: effect.img,
      item: item?.name ?? null,
      origin: item ? null : effectOrigin(effect, document),
      changes: effect.system.changes.filter(change => change.key).map(describeChange).join(", "),
      disabled: effect.disabled,
      toggleHint: game.i18n.localize(`KRISTALLPUNK.Effects.${effect.disabled ? "Enable" : "Disable"}`)
    });
  }
  for ( const group of Object.values(groups) ) group.effects.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return Object.values(groups);
}

/**
 * Name of what caused an effect, from its `origin` (e.g. a spell or another figure).
 * Null if it has none, if it points to the document showing the list, or if that document no longer exists.
 * @param {ActiveEffect} effect
 * @param {Actor|Item} document  The document whose list shows the effect.
 * @returns {string|null}
 */
function effectOrigin(effect, document) {
  if ( !effect.origin || (effect.origin === document.uuid) ) return null;
  try {
    return foundry.utils.fromUuidSync(effect.origin)?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * The effect of the clicked row; on an actor it may belong to one of its items.
 * @param {HTMLElement} target
 * @returns {ActiveEffect|null}
 */
function effectOf(target) {
  const uuid = target.closest("[data-effect]")?.dataset.effect;
  return uuid ? foundry.utils.fromUuidSync(uuid) : null;
}

/**
 * Actions of the effect list, to be spread into a sheet's actions. `this` is the sheet.
 * @type {Record<string, Function>}
 */
export const EFFECT_ACTIONS = {
  /**
   * Create an effect on the sheet's document and open it: switched on from the group of active effects,
   * switched off from the group of inactive ones.
   * @this {DocumentSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async createEffect(event, target) {
    const [effect] = await this.document.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("KRISTALLPUNK.Effects.NewEffect"),
      img: "icons/svg/aura.svg",
      disabled: "disabled" in target.dataset
    }]);
    effect?.sheet.render({ force: true });
  },

  /**
   * Switch an effect of the sheet's document on or off. Effects transferred from items are left alone:
   * they are changed on the item, and whether they work follows the item (#49).
   * @this {DocumentSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async toggleEffect(event, target) {
    const effect = effectOf(target);
    if ( !effect || (effect.parent !== this.document) ) return;
    await effect.update({ disabled: !effect.disabled });
  },

  /**
   * Open the configuration of an effect of the sheet's document.
   * @this {DocumentSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  editEffect(event, target) {
    const effect = effectOf(target);
    if ( effect?.parent === this.document ) effect.sheet.render({ force: true });
  },

  /**
   * Delete an effect of the sheet's document after asking. Effects transferred from items are deleted on the item.
   * @this {DocumentSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async deleteEffect(event, target) {
    const effect = effectOf(target);
    if ( !effect || (effect.parent !== this.document) ) return;
    await effect.deleteDialog();
  },

  /**
   * Open the item an effect comes from, on the tab named by `data-tab` if given (e.g. its effects).
   * @this {DocumentSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async openEffectSource(event, target) {
    const item = effectOf(target)?.parent;
    if ( !(item instanceof foundry.documents.Item) ) return;
    await item.sheet.render({ force: true });
    if ( target.dataset.tab ) item.sheet.changeTab(target.dataset.tab, "primary");
  }
};
