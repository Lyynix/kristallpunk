/**
 * Token hotbar, GM mode (#33): what the GM's bar shows while no figure is selected. On the left the GM
 * actions, which the system and modules contribute by a hook; beside them the macros and the same checks
 * as in the character mode, without values, to request a check.
 * Prepares the render context of the partial; the bar itself (module/apps/hotbar.mjs) renders it.
 */

import { prepareChecks } from "./token-hotbar.mjs";

/** Template path; the bar loads it as a partial under this name before its first render. */
export const TEMPLATE = "systems/kristallpunk/templates/ui/gm-hotbar.hbs";

/** Name of the hook that collects the GM actions. */
export const ACTIONS_HOOK = "kristallpunk.getGmHotbarActions";

/**
 * An action of the GM mode, shown as a tile on the left of the bar.
 * @typedef {object} GmHotbarAction
 * @property {string} name                  Unique name.
 * @property {string} label                 Shown below the icon; may be a localization key.
 * @property {string} icon                  Font Awesome classes, e.g. "fa-solid fa-dragon".
 * @property {number} [order]               Tiles are sorted by it, ascending; without one they come last.
 * @property {(event: PointerEvent) => any} onClick  Called when the tile is clicked.
 */

/**
 * Render context of the GM mode partial. The actions are collected anew on every render by the hook
 * `kristallpunk.getGmHotbarActions`, whose callbacks add their actions to the array they receive.
 * @returns {{actions: GmHotbarAction[], checks: object}|null}  null unless the user is a GM.
 */
export function prepareGmHotbar() {
  if ( !game.user.isGM ) return null;
  /** @type {GmHotbarAction[]} */
  const actions = [];
  Hooks.callAll(ACTIONS_HOOK, actions);
  const valid = actions.filter(action => action?.name && (typeof action.onClick === "function"));
  valid.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  return {
    actions: valid.map(action => ({ ...action, label: game.i18n.localize(action.label ?? action.name) })),
    checks: prepareChecks(null)
  };
}
