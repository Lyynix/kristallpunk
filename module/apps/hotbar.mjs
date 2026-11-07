/**
 * The system's own bar at the bottom of the screen (#31). It replaces Foundry's macro bar and will hold
 * the token hotbar (character and GM mode) next to the macros.
 *
 * Subclasses Foundry's Hotbar, so executing macros (also by the keys 1 to 0), drag and drop, paging,
 * locking, clearing and the context menu keep working; only the template is our own.
 * The template must keep Foundry's hooks: `.slot` elements with `data-slot`, the actions execute, page,
 * lock, clear, mute and menu, and the mute and lock buttons must always be present (Hotbar#_updateToggles).
 * Registered as CONFIG.ui.hotbar during init, unless the "coreHotbar" setting asks for Foundry's bar.
 */
export default class KristallpunkHotbar extends foundry.applications.ui.Hotbar {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["kristallpunk"]
  };

  /** @override */
  static PARTS = {
    hotbar: {
      root: true,
      template: "systems/kristallpunk/templates/ui/hotbar.hbs"
    }
  };
}
