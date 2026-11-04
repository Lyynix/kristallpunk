import { activateStatusTracker, prepareStatusTracker } from "../apps/status-tracker.mjs";

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
      attributeGroups: this.#prepareAttributeGroups(),
      skillGroups: this.#prepareSkillGroups(),
      valueGroups: this.#prepareValueGroups(),
      // Usable in play mode too, since status changes during play
      statusTracker: prepareStatusTracker(this.actor)
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
   * Values of the character tab as tiles: per domain the stamina maximum, its defense value
   * and its protection, then the derived values that belong to no single domain.
   * Each tile shows a computed value with its modifier, or an input for entered values.
   * @returns {object[]}
   */
  #prepareValueGroups() {
    const system = this.actor.system;
    const fields = system.schema.fields;
    const { domains, attributes, derived } = CONFIG.KRISTALLPUNK;
    const attributeName = key => game.i18n.localize(attributes[key].label);
    const attributeTerm = key => term(attributeName(key), system.attributes[key].value);
    // Formulas use the abbreviations (as on the official sheet) so they fit on one line
    const attributeAbbr = key => game.i18n.localize(attributes[key].abbreviation);
    const staminaMaxLabel = domain => game.i18n.format("KRISTALLPUNK.Sheet.MaxOf", {
      label: fields.stamina.fields[domain].fields.value.label
    });

    // Formula (shown in edit mode) and breakdown with the actual numbers (tooltip)
    const derivedTile = key => {
      const config = derived[key];
      const { value, mod } = system.derived[key];
      let formula;
      let terms;
      if ( config.halfStaminaMax ) {
        const label = staminaMaxLabel(config.domain);
        formula = game.i18n.localize("KRISTALLPUNK.Sheet.Formula.Half");
        terms = [game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Half", { label, value: system.stamina[config.domain].max })];
      } else {
        formula = config.attributes.map(attributeAbbr).join(" + ");
        terms = config.attributes.map(attributeTerm);
      }
      return {
        key,
        label: game.i18n.localize(config.label),
        value,
        formula,
        breakdown: breakdown(terms, value - mod, mod),
        mod: { name: `system.derived.${key}.mod`, value: mod, display: signed(mod) }
      };
    };

    const groups = Object.entries(domains).map(([domain, { label, protection }]) => {
      const domainAttributes = Object.keys(attributes).filter(key => attributes[key].domain === domain);
      const { max, maxMod } = system.stamina[domain];
      const tiles = [{
        key: `stamina-${domain}`,
        label: staminaMaxLabel(domain),
        value: max,
        formula: domainAttributes.map(attributeAbbr).join(" + "),
        breakdown: breakdown(domainAttributes.map(attributeTerm), max - maxMod, maxMod),
        mod: { name: `system.stamina.${domain}.maxMod`, value: maxMod, display: signed(maxMod) }
      }];
      for ( const [key, config] of Object.entries(derived) ) {
        if ( config.domain === domain ) tiles.push(derivedTile(key));
      }
      if ( protection ) tiles.push({
        key: protection,
        label: fields[protection].label,
        hint: fields[protection].hint,
        input: { name: `system.${protection}`, value: system[protection], min: fields[protection].min, max: fields[protection].max }
      });
      return { key: domain, label, tiles };
    });

    groups.push({
      key: "shared",
      label: "KRISTALLPUNK.Sheet.Derived",
      tiles: Object.entries(derived).filter(([, config]) => !config.domain).map(([key]) => derivedTile(key))
    });
    return groups;
  }

  /**
   * Skills grouped by domain (the domain of their linked attribute), as on the official sheet.
   * @returns {object[]}
   */
  #prepareSkillGroups() {
    const { domains, attributes, skills } = CONFIG.KRISTALLPUNK;
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits.skill;
    return Object.entries(domains).map(([domain, { label }]) => ({
      key: domain,
      label,
      skills: Object.entries(skills)
        .filter(([, config]) => attributes[config.attribute].domain === domain)
        .map(([key, config]) => {
          const data = this.actor.system.skills[key];
          const terms = [
            term(game.i18n.localize("KRISTALLPUNK.Sheet.Column.Value"), data.value),
            term(game.i18n.localize(attributes[config.attribute].label), this.actor.system.attributes[config.attribute].value)
          ];
          return {
            key,
            label: config.label,
            attribute: attributes[config.attribute].abbreviation,
            value: data.value,
            mod: data.mod,
            modDisplay: signed(data.mod),
            total: data.total,
            breakdown: breakdown(terms, data.total - data.mod, data.mod),
            min: limits.min,
            max: limits.max
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
    this.#applyEditMode();
    activateStatusTracker(this.element, this.actor);
  }

  /**
   * Apply play or edit mode to the rendered sheet without rendering it again,
   * so that the modifier fields can open and close with an animation.
   * Fields marked with `data-lockable` are disabled in play mode.
   */
  #applyEditMode() {
    const editMode = this.isEditMode;
    // Styles for play and edit mode hang off this class
    this.element.classList.toggle("edit-mode", editMode);
    for ( const field of this.element.querySelectorAll("[data-lockable]") ) field.disabled = !editMode;

    const portrait = this.element.querySelector(".portrait");
    if ( portrait ) {
      if ( editMode ) Object.assign(portrait.dataset, { action: "editImage", edit: "img" });
      else { delete portrait.dataset.action; delete portrait.dataset.edit; }
    }

    // The frame is rendered once, so the toggle icon is updated here
    const toggle = this.window.header?.querySelector(".edit-toggle");
    if ( toggle ) {
      toggle.classList.toggle("fa-lock", !editMode);
      toggle.classList.toggle("fa-lock-open", editMode);
      toggle.setAttribute("aria-pressed", String(editMode));
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
    this.#applyEditMode();
  }
}

/* -------------------------------------------- */
/*  Display helpers                             */
/* -------------------------------------------- */

/**
 * Modifiers with their sign: +2, 0, -1. A plain hyphen keeps the value parseable as a number.
 * @param {number} value
 * @returns {string}
 */
function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * One term of a breakdown, e.g. "Kraft 3".
 * @param {string} label
 * @param {number} value
 * @returns {string}
 */
function term(label, value) {
  return game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Term", { label, value });
}

/**
 * Breakdown of a computed value with the actual numbers, e.g. "Kraft 3 + Wille 5 = 8",
 * extended by the modifier if one is set.
 * @param {string[]} terms  The terms that add up to the rule result.
 * @param {number} base     The rule result without modifier.
 * @param {number} mod      The modifier.
 * @returns {string}
 */
function breakdown(terms, base, mod) {
  const result = game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Result", { terms: terms.join(" + "), result: base });
  if ( !mod ) return result;
  return game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.WithMod", { base: result, mod: signed(mod), total: base + mod });
}
