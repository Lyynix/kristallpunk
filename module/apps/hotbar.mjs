import { SYSTEM_ID } from "../settings.mjs";
import { panToToken, prepareTokenHotbar, TEMPLATE as TOKEN_HOTBAR } from "./token-hotbar.mjs";
import { activateStatusTracker, TEMPLATE as STATUS_TRACKER } from "./status-tracker.mjs";
import { rollCheck } from "../api/check.mjs";

/** Views of the bar: Foundry's macros, or the token hotbar (character mode #32, GM mode #33). */
export const VIEWS = ["macros", "token"];

/** How long the pointer rests on the folded checks before they fold out, in ms. */
const FOLD_OUT_DELAY = 150;

/**
 * The system's own bar at the bottom of the screen (#31). It replaces Foundry's macro bar and holds
 * the token hotbar next to the macros; a button switches between both views.
 *
 * Subclasses Foundry's Hotbar, so executing macros (also by the keys 1 to 0, in both views), drag and drop,
 * paging, locking, clearing and the context menu keep working; only the template is our own.
 * The template must keep Foundry's hooks: `.slot` elements with `data-slot`, the actions execute, page,
 * lock, clear, mute and menu, and the mute and lock buttons must always be present (Hotbar#_updateToggles).
 * Both views are always rendered; switching only changes `data-view` on the element, without re-rendering.
 * Registered as CONFIG.ui.hotbar during init, unless the "coreHotbar" setting asks for Foundry's bar.
 */
export default class KristallpunkHotbar extends foundry.applications.ui.Hotbar {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk"],
    actions: {
      switchView: KristallpunkHotbar.#onSwitchView
    }
  };

  /** @override */
  static PARTS = {
    hotbar: {
      root: true,
      template: "systems/kristallpunk/templates/ui/hotbar.hbs",
      // Partials, loaded before the first render
      templates: [TOKEN_HOTBAR, STATUS_TRACKER]
    }
  };

  /**
   * Register the keybinding that switches the view. It has no default key; players can assign one.
   * Called during init.
   */
  static registerKeybindings() {
    game.keybindings.register(SYSTEM_ID, "switchHotbarView", {
      name: "KRISTALLPUNK.Hotbar.Keybinding.Name",
      hint: "KRISTALLPUNK.Hotbar.Keybinding.Hint",
      editable: [],
      onDown: () => {
        ui.hotbar?.switchView?.();
        return true;
      }
    });
  }

  /**
   * The view currently shown, remembered per client.
   * @type {"macros"|"token"}
   */
  get view() {
    const view = game.settings.get(SYSTEM_ID, "hotbarView");
    return VIEWS.includes(view) ? view : VIEWS[0];
  }

  /**
   * Show a view and remember it for this client.
   * @param {"macros"|"token"} view
   * @returns {Promise<void>}
   */
  async setView(view) {
    if ( !VIEWS.includes(view) ) throw new Error(`Unknown hotbar view ${view}`);
    await game.settings.set(SYSTEM_ID, "hotbarView", view);
    this.#applyView();
  }

  /**
   * Switch to the other view.
   * @returns {Promise<void>}
   */
  async switchView() {
    return this.setView(this.view === "macros" ? "token" : "macros");
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
    this.#applyView();
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
   * focusing them, folds them out (class "checks-open"); the status tracker then shows its short form.
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
   * Show the remembered view and label the switch button with the view it leads to.
   */
  #applyView() {
    if ( !this.element ) return;
    const view = this.view;
    this.element.dataset.view = view;
    const button = this.element.querySelector("[data-action=switchView]");
    const label = game.i18n.localize(`KRISTALLPUNK.Hotbar.SwitchTo.${view === "macros" ? "token" : "macros"}`);
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);
  }

  /**
   * @this {KristallpunkHotbar}
   */
  static async #onSwitchView() {
    await this.switchView();
  }
}
