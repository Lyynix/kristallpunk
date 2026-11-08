import { SYSTEM_ID } from "../settings.mjs";
import { panToToken, prepareTokenHotbar, TEMPLATE as TOKEN_HOTBAR } from "./token-hotbar.mjs";
import { activateStatusTracker, TEMPLATE as STATUS_TRACKER } from "./status-tracker.mjs";
import { rollCheck } from "../api/check.mjs";

/** How long the pointer rests on the folded checks before they fold out, in ms. */
const FOLD_OUT_DELAY = 150;


/** Template of the macro slots, used by the bar and by the character mode. */
const MACROS = "systems/kristallpunk/templates/ui/hotbar-macros.hbs";

/**
 * The system's own bar at the bottom of the screen (#31). It replaces Foundry's macro bar and shows the
 * character mode (#32) of the selected figure; its macros fold out beside the status tracker by a button (#35).
 * Without a figure it shows a hint and the macros.
 *
 * Subclasses Foundry's Hotbar, so executing macros (also by the keys 1 to 0, folded in or not), drag and drop,
 * paging, locking, clearing and the context menu keep working; only the template is our own.
 * The template must keep Foundry's hooks: `.slot` elements with `data-slot`, the actions execute, page,
 * lock, clear, mute and menu, and the mute and lock buttons must always be present (Hotbar#_updateToggles).
 * The macros are always rendered; folding them only changes the class "macros-open" on the element.
 * Registered as CONFIG.ui.hotbar during init, unless the "coreHotbar" setting asks for Foundry's bar.
 */
export default class KristallpunkHotbar extends foundry.applications.ui.Hotbar {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk"],
    actions: {
      toggleMacros: KristallpunkHotbar.#onToggleMacros
    }
  };

  /** @override */
  static PARTS = {
    hotbar: {
      root: true,
      template: "systems/kristallpunk/templates/ui/hotbar.hbs",
      // Partials, loaded before the first render
      templates: [TOKEN_HOTBAR, STATUS_TRACKER, MACROS]
    }
  };

  /**
   * Register the keybinding that folds the macros out and in, like the button. It has no default key;
   * players can assign one. Called during init.
   */
  static registerKeybindings() {
    game.keybindings.register(SYSTEM_ID, "toggleHotbarMacros", {
      name: "KRISTALLPUNK.Hotbar.Keybinding.Name",
      hint: "KRISTALLPUNK.Hotbar.Keybinding.Hint",
      editable: [],
      onDown: () => {
        ui.hotbar?.toggleMacros?.();
        return true;
      }
    });
  }

  /**
   * Whether the macros are folded out beside the status tracker, remembered per client.
   * Without a figure the macros are always shown, whatever this says.
   * @type {boolean}
   */
  get macrosOpen() {
    return game.settings.get(SYSTEM_ID, "hotbarMacros");
  }

  /**
   * Fold the macros out or in and remember it for this client.
   * @param {boolean} open
   * @returns {Promise<void>}
   */
  async setMacrosOpen(open) {
    await game.settings.set(SYSTEM_ID, "hotbarMacros", !!open);
    this.#applyMacros();
  }

  /**
   * Fold the macros the other way.
   * @returns {Promise<void>}
   */
  async toggleMacros() {
    return this.setMacrosOpen(!this.macrosOpen);
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.figure = prepareTokenHotbar();
    return context;
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Tooltips of the whole bar point up, where there is room for them; set on the element, because a root
    // template part only provides the children of the element, not its attributes
    this.element.dataset.tooltipDirection = "UP";
    this.#applyMacros();
    this.#activateFigure(context.figure);
  }

  /**
   * Wire up the character mode (#32).
   * @param {object|null} figure  From prepareTokenHotbar().
   */
  #activateFigure(figure) {
    const view = this.element.querySelector(".token-hotbar");
    if ( !figure || !view ) return;
    this.#activatePortrait(view, figure);
    this.#activateTracker(view, figure);
    this.#activateChecks(view, figure);
  }

  /**
   * Portrait: a click pans to the figure's token, a double click opens its sheet.
   * The first click of a double click pans as well, which does no harm.
   * @param {HTMLElement} view
   * @param {object} figure
   */
  #activatePortrait(view, figure) {
    const portrait = view.querySelector(".figure-portrait");
    portrait.addEventListener("click", event => {
      if ( (event.detail <= 1) && figure.tokenId ) panToToken(figure.tokenId);
    });
    portrait.addEventListener("dblclick", () => figure.actor.sheet.render({ force: true }));
  }

  /**
   * Status tracker: the bar is no form, so each choice is saved to the actor right away;
   * the update re-renders the bar. Without ownership the tracker can only be looked at.
   * @param {HTMLElement} view
   * @param {object} figure
   */
  #activateTracker(view, figure) {
    const tracker = view.querySelector(".status-tracker");
    if ( !figure.editable ) {
      for ( const input of tracker.querySelectorAll("input") ) input.disabled = true;
    } else {
      tracker.addEventListener("change", event => {
        const input = event.target;
        if ( (input.type === "radio") && input.name ) figure.actor.update({ [input.name]: Number(input.value) });
      });
    }
    activateStatusTracker(this.element, figure.actor);
  }

  /**
   * Checks: a click opens the check dialog, a shift-click rolls right away.
   * On a narrow bar (see the container query in the styles) the checks are folded in. Resting on them, or
   * focusing them, folds them out (class "checks-open") with all cards grown at once; the status tracker
   * then shows its short form, and folded-out macros give way for the time being.
   * Resting on the status tracker or leaving the bar folds them in again. The state survives re-renders,
   * e.g. after a roll changed the actor.
   * @param {HTMLElement} view
   * @param {object} figure
   */
  #activateChecks(view, figure) {
    const checks = view.querySelector(".figure-checks");
    const status = view.querySelector(".figure-status");
    for ( const button of checks.querySelectorAll("[data-check]") ) {
      button.addEventListener("click", event => rollCheck(figure.actor, button.dataset.check, { dialog: !event.shiftKey }));
    }

    let timer = null;
    const setOpen = open => {
      clearTimeout(timer);
      this.#checksOpen = open;
      view.classList.toggle("checks-open", open);
    };
    view.classList.toggle("checks-open", this.#checksOpen);
    checks.addEventListener("pointerenter", () => {
      clearTimeout(timer);
      timer = setTimeout(() => setOpen(true), FOLD_OUT_DELAY);
    });
    checks.addEventListener("pointerleave", () => clearTimeout(timer));
    checks.addEventListener("focusin", () => setOpen(true));
    status.addEventListener("pointerenter", () => setOpen(false));
    view.addEventListener("pointerleave", () => setOpen(false));
    view.addEventListener("focusout", event => {
      if ( !view.contains(event.relatedTarget) ) setOpen(false);
    });
  }

  /** Whether the checks are folded out on a narrow bar. */
  #checksOpen = false;

  /**
   * Show the macros folded out or in, and label the button accordingly. Without a figure the macros are
   * always shown, so the button has nothing to do there.
   */
  #applyMacros() {
    if ( !this.element ) return;
    const open = this.macrosOpen;
    this.element.classList.toggle("macros-open", open);
    const button = this.element.querySelector("[data-action=toggleMacros]");
    const label = game.i18n.localize(`KRISTALLPUNK.Hotbar.Macros.${open ? "Close" : "Open"}`);
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(open));
    button.disabled = !this.element.querySelector(".token-hotbar");
  }

  /**
   * @this {KristallpunkHotbar}
   */
  static async #onToggleMacros() {
    await this.toggleMacros();
  }
}
