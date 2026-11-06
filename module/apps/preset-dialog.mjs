const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Faces the GM can preset; only their number matters for a check (Kurzregeln 1.0, p. 13). */
const FACES = { sixes: { face: 6, icon: "six", highlight: "success" }, ones: { face: 1, icon: "one", highlight: "failure" } };

/**
 * GM window to preset how many sixes and ones a check shows (#25). The dice row looks like the one
 * on the chat card: sixes fill up from the left, ones from the right, free dice in between.
 * Free dice later show 2 to 5, see api.rollCheck.
 * Use PresetDialog.wait(); it resolves with `{sixes, ones}`, or null if the window was closed.
 */
export default class PresetDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} config
   * @param {string} config.label    Name of the skill or derived value.
   * @param {number} config.dice     Dice in the pool.
   * @param {Function} config.resolve  Receives the result.
   */
  constructor({ label, dice, resolve, ...options }) {
    super(options);
    this.#label = label;
    this.#dice = dice;
    this.#resolve = resolve;
  }

  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk", "preset-dialog"],
    tag: "form",
    position: { width: 320 },
    form: { handler: PresetDialog.#onSubmit, closeOnSubmit: true },
    actions: { change: PresetDialog.#onChange }
  };

  static PARTS = {
    form: { template: "systems/kristallpunk/templates/apps/preset-dialog.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /**
   * Open the window and wait for the preset.
   * @param {object} config  See the constructor, without `resolve`.
   * @returns {Promise<{sixes: number, ones: number}|null>}
   */
  static wait(config) {
    return new Promise(resolve => new PresetDialog({ ...config, resolve }).render({ force: true }));
  }

  #label;
  #dice;
  #counts = { sixes: 0, ones: 0 };
  #resolve;

  /** @override */
  get title() {
    return game.i18n.format("KRISTALLPUNK.PresetDialog.Title", { label: this.#label });
  }

  /** Dice not preset yet. */
  get #free() {
    return this.#dice - this.#counts.sixes - this.#counts.ones;
  }

  /** @override */
  async _prepareContext(options) {
    const { sixes, ones } = this.#counts;
    const die = (key, highlight = null) => ({
      highlight,
      icon: key ? `fa-solid fa-dice-${FACES[key].icon}` : "fa-regular fa-dice-d6"
    });
    return {
      dice: [
        ...Array.from({ length: sixes }, () => die("sixes", "success")),
        ...Array.from({ length: this.#free }, () => die(null)),
        ...Array.from({ length: ones }, () => die("ones", "failure"))
      ],
      counters: Object.entries(FACES).map(([key, { icon, highlight }]) => ({
        key, highlight,
        icon: `fa-solid fa-dice-${icon}`,
        label: `KRISTALLPUNK.PresetDialog.${key.capitalize()}`,
        count: this.#counts[key],
        canDecrease: this.#counts[key] > 0,
        canIncrease: this.#free > 0
      })),
      buttons: [{ type: "submit", icon: "fa-solid fa-dice-d6", label: "KRISTALLPUNK.CheckDialog.Roll" }]
    };
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
   * @this {PresetDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target  Carries `data-key` (sixes or ones) and `data-delta` (+1 or -1).
   */
  static #onChange(event, target) {
    const { key, delta } = target.dataset;
    const count = this.#counts[key] + Number(delta);
    if ( (count < 0) || (Number(delta) > this.#free) ) return;
    this.#counts[key] = count;
    this.render({ parts: ["form"] });
  }

  /**
   * @this {PresetDialog}
   */
  static async #onSubmit() {
    this.#resolve?.({ ...this.#counts });
    this.#resolve = null;
  }
}
