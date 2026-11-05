import * as checkRules from "../rules/check.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATES = "systems/kristallpunk/templates/apps/check-dialog";

/** Chat visibility modes offered for a check; "ic" (in character) makes no sense for a roll. */
const MESSAGE_MODES = ["public", "gm", "blind", "self"];

/** Largest number of helpers on a check (Kurzregeln 1.0, p. 11). */
const MAX_HELPERS = 3;

/**
 * Dialog to set up a check before rolling: grade, individual bonuses and penalties, helpers
 * and chat visibility, with a live preview of the dice.
 * Bonuses and penalties stay separate here; only rules.check.pool nets them.
 * Use CheckDialog.wait(); it resolves with the choices, or null if the dialog was closed.
 */
export default class CheckDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} config
   * @param {string} config.label       Name of the skill or derived value.
   * @param {number} config.base        Its total value.
   * @param {string} config.grade       Preselected grade.
   * @param {{value: number, label?: string}[]} config.modifiers  Preselected bonuses and penalties.
   * @param {number} config.helpers     Preselected number of helpers.
   * @param {string} config.messageMode Preselected chat visibility.
   * @param {Function} config.resolve   Receives the result.
   */
  constructor({ label, base, grade, modifiers, helpers, messageMode, resolve, ...options }) {
    super(options);
    this.#label = label;
    this.#base = base;
    this.#state = { grade, modifiers: modifiers.map(modifier => ({ ...modifier })), helpers, messageMode };
    this.#resolve = resolve;
  }

  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk", "check-dialog"],
    tag: "form",
    position: { width: 440 },
    form: { handler: CheckDialog.#onSubmit, closeOnSubmit: true },
    actions: {
      addBonus: CheckDialog.#onAddBonus,
      addPenalty: CheckDialog.#onAddPenalty,
      removeModifier: CheckDialog.#onRemoveModifier
    }
  };

  static PARTS = {
    form: { template: `${TEMPLATES}/form.hbs` },
    preview: { template: `${TEMPLATES}/preview.hbs` },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /**
   * Open the dialog and wait for the choices.
   * @param {object} config  See the constructor, without `resolve`.
   * @returns {Promise<{grade: string, modifiers: {value: number, label: string}[], helpers: number,
   *   messageMode: string}|null>}
   */
  static wait(config) {
    return new Promise(resolve => new CheckDialog({ ...config, resolve }).render({ force: true }));
  }

  #label;
  #base;
  #state;
  #resolve;

  /** @override */
  get title() {
    return game.i18n.format("KRISTALLPUNK.CheckDialog.Title", { label: this.#label });
  }

  /** @override */
  async _prepareContext(options) {
    const { grade, modifiers, helpers, messageMode } = this.#state;
    return {
      rootId: this.id,
      grades: Object.entries(CONFIG.KRISTALLPUNK.checkGrades).map(([key, { label }]) => ({
        key, label, checked: key === grade
      })),
      modifiers: modifiers.map((modifier, index) => ({
        index,
        type: modifier.value < 0 ? "penalty" : "bonus",
        amount: Math.abs(modifier.value),
        label: modifier.label ?? ""
      })),
      modifierTypes: { bonus: "KRISTALLPUNK.CheckDialog.Bonus", penalty: "KRISTALLPUNK.CheckDialog.Penalty" },
      helpers,
      helperOptions: Object.fromEntries(Array.from({ length: MAX_HELPERS + 1 }, (_, n) => [n, String(n)])),
      messageMode,
      messageModes: Object.fromEntries(MESSAGE_MODES.map(mode => [mode, CONFIG.ChatMessage.modes[mode].label])),
      preview: this.#preview(),
      buttons: [{ type: "submit", icon: "fa-solid fa-dice-d6", label: "KRISTALLPUNK.CheckDialog.Roll" }]
    };
  }

  /**
   * Dice of the check with the current choices, and which rules applied.
   * @returns {{dice: number, lines: string[]}}
   */
  #preview() {
    const values = this.#modifierValues();
    const pool = checkRules.pool({ base: this.#base, modifiers: values });
    const lines = [game.i18n.format("KRISTALLPUNK.CheckDialog.Preview.Base", { value: this.#base })];
    if ( values.length ) {
      lines.push(game.i18n.format("KRISTALLPUNK.CheckDialog.Preview.Modifier", { value: signed(pool.modifier) }));
    }
    if ( pool.capped ) {
      lines.push(game.i18n.format("KRISTALLPUNK.CheckDialog.Preview.Capped", {
        raw: signed(pool.rawModifier), value: signed(pool.modifier)
      }));
    }
    if ( pool.minimum ) lines.push(game.i18n.localize("KRISTALLPUNK.CheckDialog.Preview.Minimum"));
    return { dice: pool.dice, lines };
  }

  /**
   * Values of all bonuses and penalties, helpers included as +1 each.
   * @returns {number[]}
   */
  #modifierValues() {
    const values = this.#state.modifiers.map(modifier => modifier.value).filter(value => value !== 0);
    for ( let i = 0; i < this.#state.helpers; i++ ) values.push(1);
    return values;
  }

  /**
   * Take over the current form values into the dialog state.
   */
  #readForm() {
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
    const rows = Object.values(data.modifiers ?? {});
    this.#state = {
      grade: data.grade ?? this.#state.grade,
      modifiers: rows.map(row => {
        const amount = Math.max(0, Math.trunc(Number(row.amount) || 0));
        return { value: row.type === "penalty" ? -amount : amount, label: row.label?.trim() ?? "" };
      }),
      helpers: Number(data.helpers ?? this.#state.helpers),
      messageMode: data.messageMode ?? this.#state.messageMode
    };
  }

  /**
   * Update the preview whenever a choice changes.
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    this.#readForm();
    this.render({ parts: ["preview"] });
  }

  /**
   * Closing without rolling resolves with null.
   * @override
   */
  _onClose(options) {
    super._onClose(options);
    this.#resolve?.(null);
    this.#resolve = null;
  }

  /**
   * @this {CheckDialog}
   */
  static #onAddBonus() {
    this.#addModifier(1);
  }

  /**
   * @this {CheckDialog}
   */
  static #onAddPenalty() {
    this.#addModifier(-1);
  }

  /**
   * @param {number} value
   */
  #addModifier(value) {
    this.#readForm();
    this.#state.modifiers.push({ value, label: "" });
    this.render({ parts: ["form", "preview"] });
  }

  /**
   * @this {CheckDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target  Carries `data-index` of the modifier row.
   */
  static #onRemoveModifier(event, target) {
    this.#readForm();
    this.#state.modifiers.splice(Number(target.dataset.index), 1);
    this.render({ parts: ["form", "preview"] });
  }

  /**
   * @this {CheckDialog}
   */
  static async #onSubmit() {
    this.#readForm();
    const { grade, modifiers, helpers, messageMode } = this.#state;
    this.#resolve?.({ grade, modifiers: modifiers.filter(modifier => modifier.value !== 0), helpers, messageMode });
    this.#resolve = null;
  }
}

/**
 * @param {number} value
 * @returns {string}  e.g. +2, 0, -1
 */
function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}
