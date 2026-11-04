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
    position: { width: 600, height: "auto" },
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
      editMode: this.isEditMode,
      locked: !this.isEditMode,
      attributeGroups: this.#prepareAttributeGroups()
    });
  }

  /**
   * Attributes grouped by domain, with the input maximum depending on the creation exception.
   * The exception itself is not editable here; it is set during character creation.
   * @returns {object[]}
   */
  #prepareAttributeGroups() {
    const { domains, attributes } = CONFIG.KRISTALLPUNK;
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits.attribute;
    return Object.entries(domains).map(([domain, { label }]) => ({
      key: domain,
      label,
      attributes: Object.entries(attributes)
        .filter(([, config]) => config.domain === domain)
        .map(([key, config]) => {
          const data = this.actor.system.attributes[key];
          return {
            key,
            label: config.label,
            value: data.value,
            min: limits.min,
            max: data.exception ? limits.exceptionMax : limits.max
          };
        })
    }));
  }

  /**
   * The edit toggle sits in the window title bar, so it takes no room in the sheet itself.
   * @override
   */
  _getFrameButtons(options) {
    const buttons = super._getFrameButtons(options);
    if ( this.isEditable ) buttons.unshift({
      icon: "fa-solid fa-lock edit-toggle",
      label: "KRISTALLPUNK.Sheet.EditMode",
      action: "toggleEditMode"
    });
    return buttons;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Styles for play and edit mode hang off this class
    this.element.classList.toggle("edit-mode", this.isEditMode);
    // The frame is rendered once, so the toggle icon is updated here
    const toggle = this.window.header?.querySelector(".edit-toggle");
    if ( toggle ) {
      toggle.classList.toggle("fa-lock", !this.isEditMode);
      toggle.classList.toggle("fa-lock-open", this.isEditMode);
      toggle.setAttribute("aria-pressed", String(this.isEditMode));
    }
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
