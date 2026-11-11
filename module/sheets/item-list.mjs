/**
 * Lists of a figure's items by type (#45), shared by the tabs of the character sheet.
 * A sheet renders the partial with a list from prepareItemList() and adds ITEM_ACTIONS to its actions.
 * Rows are draggable: Foundry's actor sheet sorts them on drop and lets them be dragged elsewhere.
 */

/** Name of the partial, loaded during init. */
export const PARTIAL = "kristallpunk.item-list";

/** Template of the partial. */
export const TEMPLATE = "systems/kristallpunk/templates/parts/item-list.hbs";

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
    createHint: game.i18n.format("KRISTALLPUNK.Items.Create", { type: typeLabel }),
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
 * The menu of the item rows (#46): edit and delete, opened by the row's menu button or by right-clicking the row.
 * Call once per sheet, on its first render: the menus listen on the sheet's element, which outlives re-renders.
 * @param {ActorSheetV2} sheet
 */
export function activateItemMenus(sheet) {
  const { ContextMenu } = foundry.applications.ux;
  const item = target => itemOf(sheet.actor, target);
  const entries = [
    {
      label: "KRISTALLPUNK.Items.Edit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      onClick: (event, target) => item(target)?.sheet.render({ force: true })
    },
    {
      label: "KRISTALLPUNK.Items.Delete",
      icon: '<i class="fa-solid fa-trash"></i>',
      visible: () => sheet.isEditable,
      onClick: (event, target) => item(target)?.deleteDialog()
    }
  ];
  const options = { jQuery: false, fixed: true };
  new ContextMenu(sheet.element, "[data-item-menu]", entries, { ...options, eventName: "click", relative: "target" });
  new ContextMenu(sheet.element, ".item-row[data-item-id]", entries, options);
}

/**
 * Actions of the item lists, to be spread into a sheet's actions. `this` is the actor's sheet.
 * @type {Record<string, Function>}
 */
export const ITEM_ACTIONS = {
  /**
   * Create an item of the type named by `data-type` on the figure and open it.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  async createItem(event, target) {
    const { type } = target.dataset;
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
  }
};
