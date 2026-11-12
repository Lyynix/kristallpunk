import { PICKER_PACKS, pickItem } from "../apps/item-picker.mjs";

/**
 * Lists of a figure's items by type (#45), shared by the tabs of the character sheet.
 * A sheet renders the partial with a list from prepareItemList() and adds ITEM_ACTIONS to its actions.
 * Rows are draggable: Foundry's actor sheet sorts them on drop and lets them be dragged elsewhere. The name opens
 * an item, a button on the row deletes it.
 */

/** Name of the partial, loaded during init. */
export const PARTIAL = "kristallpunk.item-list";

/** Template of the partial. */
export const TEMPLATE = "systems/kristallpunk/templates/parts/item-list.hbs";

/** Name and template of the partial of one item as tag (#47, #48), loaded during init. */
export const TAG_PARTIAL = "kristallpunk.item-tag";
export const TAG_TEMPLATE = "systems/kristallpunk/templates/parts/item-tag.hbs";

/**
 * The items of one type of an actor, in their sort order, for the item list partial.
 * @param {Actor} actor
 * @param {string} type                   Item type.
 * @param {object} [options]
 * @param {string} [options.label]        Heading; defaults to the type's name.
 * @param {string} [options.detailLabel]  Heading of an extra column, if the type has one.
 * @param {(item: Item) => string|null} [options.detail]   Content of the extra column.
 * @param {(item: Item) => string|null} [options.warning]  A problem shown as warning in the extra column instead.
 * @param {(item: Item) => string} [options.name]          Name to show; defaults to the item's name.
 * @returns {{type: string, label: string, createHint: string, detailLabel: string|null,
 *   items: {id: string, name: string, img: string, automation: object|null, detail: string|null,
 *   warning: string|null}[]}}
 */
export function prepareItemList(actor, type, { label, detailLabel, detail, warning, name } = {}) {
  const typeLabel = game.i18n.localize(CONFIG.Item.typeLabels[type]);
  return {
    type,
    label: label ? game.i18n.localize(label) : typeLabel,
    // Types with a picker add an existing item or create one; others only create
    createHint: game.i18n.format(type in PICKER_PACKS ? "KRISTALLPUNK.Items.Add" : "KRISTALLPUNK.Items.Create", { type: typeLabel }),
    detailLabel: detailLabel ? game.i18n.localize(detailLabel) : null,
    items: actor.itemTypes[type]
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({
        id: item.id,
        name: name ? name(item) : item.name,
        img: item.img,
        automation: item.system.automationInfo ?? null,
        detail: detail ? detail(item) : null,
        warning: warning ? warning(item) : null
      }))
  };
}

/**
 * The item of the clicked row.
 * @param {Actor} actor
 * @param {HTMLElement} target
 * @returns {Item|null}
 */
function itemOf(actor, target) {
  const id = target.closest("[data-item-id]")?.dataset.itemId;
  return id ? (actor.items.get(id) ?? null) : null;
}

/**
 * Actions of the item lists, to be spread into a sheet's actions. `this` is the actor's sheet.
 * @type {Record<string, Function>}
 */
export const ITEM_ACTIONS = {
  /**
   * Add an item of the type named by `data-type` to the figure. Types with a picker offer the existing ones from
   * compendiums and world, with a pinned entry to create a new one; others create one right away. A new item opens.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async createItem(event, target) {
    const { type } = target.dataset;
    if ( (type in PICKER_PACKS) && ((await pickItem(this.actor, type, target)) !== "created") ) return;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("KRISTALLPUNK.Items.New", { type: game.i18n.localize(CONFIG.Item.typeLabels[type]) }),
      type
    }]);
    item?.sheet.render({ force: true });
  },

  /**
   * Open an item of the figure.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  editItem(event, target) {
    itemOf(this.actor, target)?.sheet.render({ force: true });
  },

  /**
   * Delete an item of the figure after asking.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async deleteItem(event, target) {
    await itemOf(this.actor, target)?.deleteDialog();
  }
};
