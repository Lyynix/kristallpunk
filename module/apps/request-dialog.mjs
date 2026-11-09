import { MODIFIER_TYPES, prepareModifierRows, readModifierRows, TEMPLATE as MODIFIERS } from "./modifiers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE = "systems/kristallpunk/templates/apps/request-dialog.hbs";

/** Actor types whose checks can be requested. */
const TYPES = ["protagonist"];

/**
 * The two lists of figures to request a check from (#33):
 * `assigned`: the characters assigned to players; `owned`: all figures at least one player owns.
 * The lists may differ either way round, e.g. for companions or figures of absent players.
 */
export const FIGURE_LISTS = ["assigned", "owned"];

/** Who sees a request: everybody, or only the GMs and the players of the requested figures. */
export const VISIBILITIES = ["public", "involved"];

/**
 * Figures of a list, sorted by name, each with the players it is assigned to.
 * @param {"assigned"|"owned"} list
 * @returns {{actor: Actor, players: string[]}[]}
 */
export function requestFigures(list) {
  const players = game.users.filter(user => !user.isGM);
  const assignedTo = actor => players.filter(user => user.character === actor).map(user => user.name);
  let actors;
  if ( list === "assigned" ) {
    actors = new Set(players.map(user => user.character).filter(actor => TYPES.includes(actor?.type)));
  } else {
    actors = game.actors.filter(actor => TYPES.includes(actor.type)
      && players.some(user => actor.testUserPermission(user, "OWNER")));
  }
  return [...actors]
    .map(actor => ({ actor, players: assignedTo(actor) }))
    .sort((a, b) => a.actor.name.localeCompare(b.actor.name, game.i18n.lang));
}

/**
 * Which figures a request starts with: the figures the GM targets, if there are any; otherwise the
 * characters of the players who are online. The list is the assigned one, unless a targeted figure is
 * only in the list of owned figures.
 * @returns {{list: "assigned"|"owned", uuids: string[]}}
 */
export function defaultRequestSelection() {
  const owned = new Set(requestFigures("owned").map(({ actor }) => actor.uuid));
  const assigned = new Set(requestFigures("assigned").map(({ actor }) => actor.uuid));
  // Targeted tokens stand for their actor; unlinked tokens for the actor they were made from
  const targets = [...game.user.targets]
    .map(token => game.actors.get(token.document.actorId)?.uuid)
    .filter(uuid => owned.has(uuid));
  if ( targets.length ) {
    return { list: targets.every(uuid => assigned.has(uuid)) ? "assigned" : "owned", uuids: [...new Set(targets)] };
  }
  const online = game.users.filter(user => !user.isGM && user.active && TYPES.includes(user.character?.type));
  return { list: "assigned", uuids: [...new Set(online.map(user => user.character.uuid))] };
}

/**
 * Dialog of the GM to request a check (#33): the figures, chosen from one of two lists, the grade,
 * bonuses and penalties with their reasons, and who sees the request.
 * Players can still change grade and modifiers when they roll; the request only prefills them.
 * Use RequestDialog.wait(); it resolves with the choices, or null if the dialog was closed.
 */
export default class RequestDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} config
   * @param {string} config.label        Name of the skill or derived value.
   * @param {string} config.list         Preselected list of figures, see FIGURE_LISTS.
   * @param {string[]} config.uuids      Preselected figures.
   * @param {string} config.grade        Preselected grade.
   * @param {{value: number, label?: string}[]} config.modifiers  Preselected bonuses and penalties.
   * @param {string} config.visibility   Preselected visibility, see VISIBILITIES.
   * @param {Function} config.resolve    Receives the result.
   */
  constructor({ label, list, uuids, grade, modifiers, visibility, resolve, ...options }) {
    super(options);
    this.#label = label;
    this.#state = {
      list, selected: new Set(uuids), grade, modifiers: modifiers.map(modifier => ({ ...modifier })), visibility
    };
    this.#resolve = resolve;
  }

  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk", "request-dialog"],
    tag: "form",
    position: { width: 440 },
    // Closed by the handler, so that a request without figures keeps the dialog open
    form: { handler: RequestDialog.#onSubmit, closeOnSubmit: false },
    actions: {
      addBonus: RequestDialog.#onAddBonus,
      addPenalty: RequestDialog.#onAddPenalty,
      removeModifier: RequestDialog.#onRemoveModifier
    }
  };

  static PARTS = {
    form: { template: TEMPLATE, templates: [MODIFIERS] },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /**
   * Open the dialog and wait for the choices.
   * @param {object} config  See the constructor, without `resolve`.
   * @returns {Promise<{uuids: string[], grade: string, modifiers: {value: number, label: string}[],
   *   visibility: string}|null>}
   */
  static wait(config) {
    return new Promise(resolve => new RequestDialog({ ...config, resolve }).render({ force: true }));
  }

  #label;
  #state;
  #resolve;

  /** @override */
  get title() {
    return game.i18n.format("KRISTALLPUNK.Request.Dialog.Title", { label: this.#label });
  }

  /** @override */
  async _prepareContext(options) {
    const { list, selected, grade, modifiers, visibility } = this.#state;
    return {
      rootId: this.id,
      lists: FIGURE_LISTS.map(key => ({ key, label: `KRISTALLPUNK.Request.Dialog.List.${key}`, checked: key === list })),
      figures: requestFigures(list).map(({ actor, players }) => ({
        uuid: actor.uuid, name: actor.name, img: actor.img, players: players.join(", "), checked: selected.has(actor.uuid)
      })),
      grades: Object.entries(CONFIG.KRISTALLPUNK.checkGrades).map(([key, { label }]) => ({
        key, label, checked: key === grade
      })),
      modifiers: prepareModifierRows(modifiers),
      modifierTypes: MODIFIER_TYPES,
      visibility,
      visibilities: Object.fromEntries(VISIBILITIES.map(key => [key, `KRISTALLPUNK.Request.Visibility.${key}`])),
      buttons: [{ type: "submit", icon: "fa-solid fa-dice", label: "KRISTALLPUNK.Request.Dialog.Submit" }]
    };
  }

  /**
   * Figures checked in the shown list.
   * @returns {string[]}
   */
  #checkedFigures() {
    return [...this.element.querySelectorAll("input[name=figure]:checked")].map(input => input.value);
  }

  /**
   * Take over the current form values into the dialog state. Figures checked in the other list stay selected,
   * so switching back and forth loses nothing; only those of the shown list are requested.
   */
  #readForm() {
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
    const shown = new Set(requestFigures(this.#state.list).map(({ actor }) => actor.uuid));
    const selected = new Set([...this.#state.selected].filter(uuid => !shown.has(uuid)));
    for ( const uuid of this.#checkedFigures() ) selected.add(uuid);
    this.#state = {
      list: data.list ?? this.#state.list,
      selected,
      grade: data.grade ?? this.#state.grade,
      modifiers: readModifierRows(data),
      visibility: data.visibility ?? this.#state.visibility
    };
  }

  /**
   * Switching the list shows its figures.
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target?.name !== "list" ) return;
    this.#readForm();
    this.render({ parts: ["form"] });
  }

  /**
   * Closing without requesting resolves with null.
   * @override
   */
  _onClose(options) {
    super._onClose(options);
    this.#resolve?.(null);
    this.#resolve = null;
  }

  /**
   * @this {RequestDialog}
   */
  static #onAddBonus() {
    this.#addModifier(1);
  }

  /**
   * @this {RequestDialog}
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
    this.render({ parts: ["form"] });
  }

  /**
   * @this {RequestDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target  Carries `data-index` of the modifier row.
   */
  static #onRemoveModifier(event, target) {
    this.#readForm();
    this.#state.modifiers.splice(Number(target.dataset.index), 1);
    this.render({ parts: ["form"] });
  }

  /**
   * Without any figure checked there is nothing to request; the dialog stays open.
   * @this {RequestDialog}
   */
  static async #onSubmit() {
    const uuids = this.#checkedFigures();
    if ( !uuids.length ) {
      ui.notifications.warn("KRISTALLPUNK.Request.Warning.NoFigures", { localize: true });
      return;
    }
    this.#readForm();
    const { grade, modifiers, visibility } = this.#state;
    this.#resolve?.({ uuids, grade, modifiers: modifiers.filter(modifier => modifier.value !== 0), visibility });
    this.#resolve = null;
    await this.close();
  }
}
