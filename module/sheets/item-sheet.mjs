import { AUTOMATION_LEVELS } from "../data/item/base.mjs";
import { EFFECT_ACTIONS, prepareEffectGroups } from "./effect-list.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/kristallpunk/templates/item";

/**
 * Sheet of all item types (#45). Header with image, name and automation; tabs for the description,
 * the details of the item type and its effects. Each item type brings its details as
 * `templates/item/details/<type>.hbs`.
 */
export default class KristallpunkItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk", "item"],
    position: { width: 520, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      ...EFFECT_ACTIONS,
      addCompetenceSlot: KristallpunkItemSheet.#onAddCompetenceSlot,
      removeCompetenceSlot: KristallpunkItemSheet.#onRemoveCompetenceSlot
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    description: { template: `${TEMPLATES}/description.hbs`, scrollable: [""] },
    // Template set per item type, see _configureRenderParts
    details: { template: "", scrollable: [""] },
    effects: { template: `${TEMPLATES}/effects.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "description" }, { id: "details" }, { id: "effects" }],
      initial: "description",
      labelPrefix: "KRISTALLPUNK.Item.Tab"
    }
  };

  /**
   * The details tab renders the template of the item's type.
   * @override
   */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.details = { ...parts.details, template: `${TEMPLATES}/details/${this.item.type}.hbs` };
    return parts;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { TextEditor } = foundry.applications.ux;
    const system = this.item.system;
    return Object.assign(context, {
      item: this.item,
      system,
      systemFields: system.schema.fields,
      typeLabel: game.i18n.localize(CONFIG.Item.typeLabels[this.item.type]),
      automation: system.constructor.hasRules ? {
        info: system.automationInfo,
        levels: Object.fromEntries(AUTOMATION_LEVELS.map(level => [level, `KRISTALLPUNK.Item.Automation.Level.${level}`])),
        // Fully automated items need no note
        showNote: system.automation.level !== "full"
      } : null,
      effectGroups: prepareEffectGroups(this.item),
      // Places for competences of a profession (#48), numbered for display
      ...(this.item.type === "profession" ? {
        slotFields: system.schema.fields.competenceSlots.element.fields,
        competenceSlots: system.competenceSlots.map((slot, index) => ({ ...slot, index, number: index + 1 }))
      } : {}),
      enrichedDescription: await TextEditor.implementation.enrichHTML(system.description, {
        relativeTo: this.item, secrets: this.item.isOwner
      })
    });
  }

  /**
   * Add an empty place for competences to a profession (#48).
   * @this {KristallpunkItemSheet}
   */
  static async #onAddCompetenceSlot() {
    const slots = foundry.utils.deepClone(this.item._source.system.competenceSlots);
    await this.item.update({ "system.competenceSlots": [...slots, { options: [], specifications: [] }] });
  }

  /**
   * Remove a place for competences from a profession (#48).
   * @this {KristallpunkItemSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onRemoveCompetenceSlot(event, target) {
    const index = Number(target.closest("[data-index]")?.dataset.index);
    const slots = foundry.utils.deepClone(this.item._source.system.competenceSlots);
    slots.splice(index, 1);
    await this.item.update({ "system.competenceSlots": slots });
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    // Each tab part renders its own tab descriptor
    if ( partId in context.tabs ) context.tab = context.tabs[partId];
    return context;
  }
}
