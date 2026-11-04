const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/kristallpunk/templates/actor/protagonist";

/**
 * Character sheet of the "protagonist" actor type (Protagonist*innen-Akte).
 * Header with portrait, attributes and status; content split into tabs.
 */
export default class ProtagonistSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk", "protagonist"],
    position: { width: "auto", height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleEditMode: ProtagonistSheet.#onToggleEditMode
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    character: { template: `${TEMPLATES}/character.hbs`, scrollable: [""] },
    competences: { template: `${TEMPLATES}/competences.hbs`, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/inventory.hbs`, scrollable: [""] },
    profile: { template: `${TEMPLATES}/profile.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "character" }, { id: "competences" }, { id: "inventory" }, { id: "profile" }],
      initial: "character",
      labelPrefix: "KRISTALLPUNK.Sheet.Tab"
    }
  };

  /**
   * Whether the sheet is in edit mode. Play mode locks the fields and hides modifiers.
   * Not stored: every newly opened sheet starts in play mode.
   * @type {boolean}
   */
  #editMode = false;

  /**
   * Edit mode is only available to users who may edit the actor.
   * @type {boolean}
   */
  get isEditMode() {
    return this.isEditable && this.#editMode;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      editMode: this.isEditMode
    });
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    // Each tab part renders its own tab descriptor
    if ( partId in context.tabs ) context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Switch between play mode and edit mode.
   * @this {ProtagonistSheet}
   */
  static #onToggleEditMode() {
    this.#editMode = !this.#editMode;
    this.render();
  }
}
