import { activateStatusTracker, prepareStatusTracker } from "../apps/status-tracker.mjs";
import { breakdown, modifierParts } from "./value-breakdown.mjs";
import { EFFECT_ACTIONS, prepareEffectGroups } from "./effect-list.mjs";
import { activateItemMenus, ITEM_ACTIONS, prepareItemList } from "./item-list.mjs";
import { needsCleanup } from "../migrations/_module.mjs";
import FileCleanup from "../apps/file-cleanup.mjs";

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
      toggleEditMode: ProtagonistSheet.#onToggleEditMode,
      rollCheck: ProtagonistSheet.#onRollCheck,
      ...EFFECT_ACTIONS,
      ...ITEM_ACTIONS
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    character: { template: `${TEMPLATES}/character.hbs`, scrollable: [""] },
    competences: { template: `${TEMPLATES}/competences.hbs`, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/inventory.hbs`, scrollable: [""] },
    profile: { template: `${TEMPLATES}/profile.hbs`, scrollable: [""] },
    effects: { template: `${TEMPLATES}/effects.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "character" }, { id: "competences" }, { id: "inventory" }, { id: "profile" }, { id: "effects" }],
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
      // Field labels for templates, localized via LOCALIZATION_PREFIXES
      systemFields: this.actor.system.schema.fields,
      // Always three fields, as on the official sheet
      innateTraits: Array.from({ length: 3 }, (_, i) => this.actor.system.innateTraits[i] ?? ""),
      valueGroups: this.#prepareValueGroups(),
      // Usable in play mode too, since status changes during play
      statusTracker: prepareStatusTracker(this.actor),
      ageGroupLabel: CONFIG.KRISTALLPUNK.ageGroups[this.actor.system.ageGroup]?.label ?? "",
      enriched: await this.#enrichTexts(["equipment", "background", "relationships"]),
      effectGroups: prepareEffectGroups(this.actor),
      equipmentList: prepareItemList(this.actor, "equipment", {
        detailLabel: "KRISTALLPUNK.Item.Equipment.FIELDS.quantity.label",
        detail: item => String(item.system.quantity)
      }),
      competenceList: prepareItemList(this.actor, "competence", {
        label: "KRISTALLPUNK.Sheet.Competences",
        detailLabel: "KRISTALLPUNK.Item.Competence.FIELDS.skill.label",
        name: item => item.system.fullName,
        detail: item => item.system.skillLabel,
        warning: item => (item.system.skill ? null : game.i18n.localize("KRISTALLPUNK.Sheet.NoSkill"))
      })
    });
  }

  /**
   * Formatted text fields as displayed HTML, with links and other enrichers resolved.
   * @param {string[]} keys  Keys of HTML fields in the system data.
   * @returns {Promise<Record<string, string>>}
   */
  async #enrichTexts(keys) {
    const { TextEditor } = foundry.applications.ux;
    const options = { relativeTo: this.actor, secrets: this.actor.isOwner };
    const entries = await Promise.all(keys.map(async key => (
      [key, await TextEditor.implementation.enrichHTML(this.actor.system[key], options)]
    )));
    return Object.fromEntries(entries);
  }

  /**
   * Attributes grouped by domain. Play mode shows the total, edit mode the entered value and the modifier
   * (#43). The input maximum depends on the creation exception, which is not editable here; it is set
   * during character creation.
   * Inputs show the stored values: active effects change the prepared modifier, and saving that would
   * store their result as input.
   * @returns {object[]}
   */
  #prepareAttributeGroups() {
    const { domains, attributes } = CONFIG.KRISTALLPUNK;
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits.attribute;
    const source = this.actor._source.system;
    return Object.entries(domains).map(([domain, { label }]) => ({
      key: domain,
      label,
      attributes: Object.entries(attributes)
        .filter(([, config]) => config.domain === domain)
        .map(([key, config]) => {
          const data = this.actor.system.attributes[key];
          const stored = source.attributes[key];
          return {
            key,
            label: config.label,
            value: stored.value,
            total: data.total,
            breakdown: breakdown({
              terms: [{ label: game.i18n.localize("KRISTALLPUNK.Sheet.Column.Value"), value: stored.value }],
              base: stored.value,
              mod: data.mod,
              parts: modifierParts(this.actor, `attributes.${key}.mod`),
              limits: { min: limits.min, max: limits.exceptionMax }
            }).text,
            mod: modInput(`system.attributes.${key}.mod`, stored.mod),
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
    const source = this.actor._source.system;
    const fields = system.schema.fields;
    const { domains, attributes, derived } = CONFIG.KRISTALLPUNK;
    const attributeName = key => game.i18n.localize(attributes[key].label);
    const attributeTerm = key => ({ label: attributeName(key), value: system.attributes[key].total });
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
        // Derived values can be rolled as checks
        check: key,
        label: game.i18n.localize(config.label),
        value,
        formula,
        breakdown: breakdown({ terms, base: value - mod, mod, parts: modifierParts(this.actor, `derived.${key}.mod`) }).text,
        mod: modInput(`system.derived.${key}.mod`, source.derived[key].mod)
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
        breakdown: breakdown({
          terms: domainAttributes.map(attributeTerm), base: max - maxMod, mod: maxMod,
          parts: modifierParts(this.actor, `stamina.${domain}.maxMod`)
        }).text,
        mod: modInput(`system.stamina.${domain}.maxMod`, source.stamina[domain].maxMod)
      }];
      for ( const [key, config] of Object.entries(derived) ) {
        if ( config.domain === domain ) tiles.push(derivedTile(key));
      }
      if ( protection ) tiles.push({
        key: protection,
        label: fields[protection].label,
        hint: fields[protection].hint,
        input: { name: `system.${protection}`, value: source[protection], min: fields[protection].min, max: fields[protection].max }
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
   * Inputs show the stored values, see #prepareAttributeGroups.
   * @returns {object[]}
   */
  #prepareSkillGroups() {
    const { domains, attributes, skills } = CONFIG.KRISTALLPUNK;
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits.skill;
    const source = this.actor._source.system;
    return Object.entries(domains).map(([domain, { label }]) => ({
      key: domain,
      label,
      skills: Object.entries(skills)
        .filter(([, config]) => attributes[config.attribute].domain === domain)
        .map(([key, config]) => {
          const data = this.actor.system.skills[key];
          const stored = source.skills[key];
          return {
            key,
            label: config.label,
            attribute: attributes[config.attribute].abbreviation,
            value: stored.value,
            modDisplay: modInput(`system.skills.${key}.mod`, stored.mod).display,
            total: data.total,
            breakdown: this.#skillBreakdown(key, stored.value, data, limits),
            min: limits.min,
            max: limits.max
          };
        })
    }));
  }

  /**
   * Tooltip of a skill. Without modifier and cap in one line ("Wert 5 + Kraft 6 = 11"); otherwise first
   * the skill's own part with its modifier and cap, then the attribute added to it.
   * @param {string} key
   * @param {number} value                 The stored skill value.
   * @param {object} data                  The prepared skill data.
   * @param {{min: number, max: number}} limits  Limits of the own part.
   * @returns {string}
   */
  #skillBreakdown(key, value, data, limits) {
    const { attributes, skills } = CONFIG.KRISTALLPUNK;
    const attributeKey = skills[key].attribute;
    const attribute = { label: game.i18n.localize(attributes[attributeKey].label), value: this.actor.system.attributes[attributeKey].total };
    const valueTerm = { label: game.i18n.localize("KRISTALLPUNK.Sheet.Column.Value"), value };
    const own = breakdown({
      terms: [valueTerm], base: value, mod: data.mod, parts: modifierParts(this.actor, `skills.${key}.mod`), limits
    });
    if ( !own.detailed ) return breakdown({ terms: [valueTerm, attribute], base: value + attribute.value }).text;
    const sum = breakdown({ terms: [String(own.value), attribute], base: data.total }).text;
    return `${own.text}<br>${sum}`;
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

  /**
   * A figure whose data an update of the system changed opens only after it has been cleaned (#46), so the sheet
   * only has to know the current data. The GM gets the "Aktenbereinigung" instead.
   * @override
   */
  _canRender(options) {
    if ( !needsCleanup(this.actor) ) return super._canRender(options);
    if ( game.user.isGM ) {
      ui.notifications.info("KRISTALLPUNK.Cleanup.SheetBlockedGM", { localize: true });
      FileCleanup.open();
    }
    else ui.notifications.warn("KRISTALLPUNK.Cleanup.SheetBlocked", { localize: true });
    return false;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    activateItemMenus(this);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyEditMode();
    this.#fitHeader();
    activateStatusTracker(this.element, this.actor);
  }

  /**
   * Size the header to its content:
   * - Portrait and name are exactly as tall as attributes plus status tracker. CSS alone cannot
   *   do this, because the width of the portrait column would then depend on the image size.
   * - The window cannot be made narrower than attributes and status tracker need. Foundry clamps
   *   resizing to the element's CSS min-width. Since the number of stamina cells follows the
   *   stamina maximum, this is measured after every render.
   */
  #fitHeader() {
    const header = this.element.querySelector(".sheet-header");
    const overview = header?.querySelector(".overview");
    const profile = header?.querySelector(".profile");
    const name = profile?.querySelector(".name");
    if ( !overview || !name || !this.element.offsetWidth ) return;

    const gap = parseFloat(getComputedStyle(profile).rowGap) || 0;
    const portraitSize = Math.max(0, overview.offsetHeight - name.offsetHeight - gap);
    header.style.setProperty("--kp-portrait-size", `${portraitSize}px`);

    // Everything beside the overview, plus the narrowest the overview can get
    overview.style.width = "min-content";
    const overviewMin = overview.offsetWidth;
    overview.style.width = "";
    const minWidth = Math.ceil(this.element.offsetWidth - overview.offsetWidth + overviewMin);
    this.element.style.minWidth = `${minWidth}px`;
    if ( this.element.offsetWidth < minWidth ) this.setPosition({ width: minWidth });
  }

  /**
   * Apply play or edit mode to the rendered sheet without rendering it again,
   * so that the modifier fields can open and close with an animation.
   * Fields marked with `data-lockable` are disabled in play mode. Text editors marked with
   * `data-lockable-editor` get `data-locked` instead, which hides their edit button: switching
   * `disabled` on a closed toggled <prose-mirror> throws inside Foundry.
   */
  #applyEditMode() {
    const editMode = this.isEditMode;
    // Styles for play and edit mode hang off this class
    this.element.classList.toggle("edit-mode", editMode);
    for ( const field of this.element.querySelectorAll("[data-lockable]") ) field.disabled = !editMode;
    for ( const editor of this.element.querySelectorAll("prose-mirror[data-lockable-editor]") ) {
      // Close (and thereby save) an editor that is open while locking
      if ( !editMode && editor.open ) editor.open = false;
      editor.toggleAttribute("data-locked", !editMode);
    }

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
    // The attributes show inputs instead of their totals, which may change the width of the header
    this.#fitHeader();
  }

  /**
   * Roll a check for the clicked skill or derived value.
   * @this {ProtagonistSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target  Element carrying `data-check` with the skill or derived value key.
   */
  static #onRollCheck(event, target) {
    game.kristallpunk.api.rollCheck(this.actor, target.dataset.check);
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
 * Input of a stored modifier. Takes the stored value, never the prepared one: active effects change the
 * prepared modifier, and saving that would store their result as manual adjustment (#43).
 * @param {string} name   Field path, e.g. "system.skills.athletics.mod".
 * @param {number} value  The stored modifier.
 * @returns {{name: string, value: number, display: string}}
 */
function modInput(name, value) {
  return { name, value, display: signed(value) };
}
