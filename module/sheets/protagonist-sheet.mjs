import { activateStatusTracker, prepareStatusTracker } from "../apps/status-tracker.mjs";
import { breakdown, modifierParts } from "./value-breakdown.mjs";
import { EFFECT_ACTIONS, prepareEffectGroups } from "./effect-list.mjs";
import { ITEM_ACTIONS, prepareItemList } from "./item-list.mjs";
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
    // As tall as the character tab needs; longer tabs scroll inside the window instead of growing it
    position: { width: 600, height: 775 },
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
      // One list per domain: armor and ward (#49); the value shows its wear, e.g. "1 / 2"
      protectionLists: Object.entries(CONFIG.KRISTALLPUNK.domains).map(([domain, { protection }]) => prepareItemList(
        this.actor, "protection", {
          domain,
          label: `KRISTALLPUNK.${protection === "armor" ? "Armor" : "Ward"}.Label`,
          detailLabel: "KRISTALLPUNK.Item.Protection.Value",
          detail: item => (item.system.wear ? `${item.system.value} / ${item.system.rating}` : String(item.system.rating)),
          warning: item => item.system.conflictsOn(this.actor).join(" ") || null
        }
      )),
      innateTraitSlots: this.#prepareInnateTraitSlots(),
      callingSlots: this.#prepareSingleSlots("calling"),
      professionSlots: this.#prepareSingleSlots("profession"),
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
   * Attributes grouped by domain. Play mode shows the total, edit mode the manual modifier (#47): the points of an
   * attribute come from items as active effects, the tooltip lists them.
   * The input shows the stored modifier: active effects change the prepared one, and saving that would store
   * their result as manual points.
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
          return {
            key,
            label: config.label,
            total: data.total,
            breakdown: breakdown({
              terms: [], base: 0, mod: data.mod, parts: modifierParts(this.actor, `attributes.${key}.mod`), limits
            }).text,
            mod: modInput(`system.attributes.${key}.mod`, source.attributes[key].mod)
          };
        })
    }));
  }

  /**
   * The innate traits as slots side by side, as on the official sheet (#47): at least three, empty ones to add a
   * trait. A figure with more traits gets more slots. Traits that exclude each other, or more than a figure has,
   * are marked; nothing is blocked.
   * @returns {{item: object|null}[]}
   */
  #prepareInnateTraitSlots() {
    const { items } = prepareItemList(this.actor, "innateTrait", {
      warning: item => item.system.conflictsOn(this.actor).join(" ") || null
    });
    const count = Math.max(CONFIG.Item.dataModels.innateTrait.PER_FIGURE, items.length);
    // Each of the three columns aligns its tag: at the start, in the middle, at the end
    const columns = ["start", "center", "end"];
    return Array.from({ length: count }, (_, i) => ({ item: items[i] ?? null, column: columns[i % columns.length] }));
  }

  /**
   * Places of an item type a figure has once, e.g. its calling (#48): one place, empty to add one, more if the figure
   * has more, each marked then.
   * @param {string} type
   * @returns {{item: object|null, column: string}[]}
   */
  #prepareSingleSlots(type) {
    const { items } = prepareItemList(this.actor, type, {
      warning: item => item.system.conflictsOn?.(this.actor).join(" ") || null
    });
    return (items.length ? items : [null]).map(item => ({ item, column: "" }));
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
      if ( protection ) tiles.push(this.#protectionTile(protection));
      return { key: domain, label, tiles };
    });

    return this.#withSharedGroup(groups, derived, derivedTile);
  }

  /**
   * Tile of armor or ward (#49): the highest value of the equipped pieces of its domain, plus the modifier.
   * The tooltip names the pieces; with none equipped it says so.
   * @param {string} key  "armor" or "ward".
   * @returns {object}
   */
  #protectionTile(key) {
    const { escapeHTML } = foundry.utils;
    const system = this.actor.system;
    const { total, mod, value: former, pieces } = system[key];
    const field = system.schema.fields[key];
    const values = [
      ...pieces.map(item => ({ label: item.name, value: item.system.value })),
      ...(former ? [{ label: game.i18n.localize("KRISTALLPUNK.Sheet.Breakdown.FormerValue"), value: former }] : [])
    ];
    const base = Math.max(0, ...values.map(({ value }) => value));
    const term = ({ label, value }) => game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Term", { label: escapeHTML(label), value });
    const terms = values.length > 1
      ? [game.i18n.format("KRISTALLPUNK.Sheet.Breakdown.Highest", { terms: values.map(term).join(", ") })]
      : values;
    const parts = modifierParts(this.actor, `${key}.mod`);
    const text = (values.length || parts.length || mod)
      ? breakdown({ terms, base, mod, parts, limits: { min: 0, max: Infinity } }).text
      : game.i18n.localize(`KRISTALLPUNK.Sheet.Breakdown.NoProtection.${key}`);
    return {
      key,
      label: field.label,
      hint: field.hint,
      value: total,
      formula: game.i18n.localize("KRISTALLPUNK.Sheet.Formula.Highest"),
      breakdown: text,
      mod: modInput(`system.${key}.mod`, this.actor._source.system[key].mod)
    };
  }

  /**
   * Add the group of derived values that belong to no single domain.
   * @param {object[]} groups
   * @param {object} derived       CONFIG.KRISTALLPUNK.derived
   * @param {Function} derivedTile
   * @returns {object[]}
   */
  #withSharedGroup(groups, derived, derivedTile) {
    groups.push({
      key: "shared",
      label: "KRISTALLPUNK.Sheet.Derived",
      tiles: Object.entries(derived).filter(([, config]) => !config.domain).map(([key]) => derivedTile(key))
    });
    return groups;
  }

  /**
   * Skills grouped by domain (the domain of their linked attribute), as on the official sheet. Like attributes, they
   * have no entered value (#48): play mode shows the total, edit mode also the manual points.
   * The input shows the stored modifier, see #prepareAttributeGroups.
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
            modDisplay: modInput(`system.skills.${key}.mod`, stored.mod).display,
            total: data.total,
            breakdown: this.#skillBreakdown(key, data, limits)
          };
        })
    }));
  }

  /**
   * Tooltip of a skill (#48): first its own points, one part per line and capped, then the attribute added.
   * Without own points just the attribute ("Kraft 6").
   * @param {string} key
   * @param {object} data                  The prepared skill data.
   * @param {{min: number, max: number}} limits  Limits of the own part.
   * @returns {string}
   */
  #skillBreakdown(key, data, limits) {
    const { attributes, skills } = CONFIG.KRISTALLPUNK;
    const attributeKey = skills[key].attribute;
    const attribute = { label: game.i18n.localize(attributes[attributeKey].label), value: this.actor.system.attributes[attributeKey].total };
    const own = breakdown({ terms: [], base: 0, mod: data.mod, parts: modifierParts(this.actor, `skills.${key}.mod`), limits });
    if ( !own.detailed ) return breakdown({ terms: [attribute], base: attribute.value }).text;
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
