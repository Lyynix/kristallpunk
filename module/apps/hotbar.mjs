import { SYSTEM_ID } from "../settings.mjs";

/** Views of the bar: Foundry's macros, or the token hotbar (character mode #32, GM mode #33). */
export const VIEWS = ["macros", "token"];

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
      template: "systems/kristallpunk/templates/ui/hotbar.hbs"
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
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#applyView();
  }

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
