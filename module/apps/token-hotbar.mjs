/**
 * Token hotbar, character mode (#32): the figure shown in the token view of the system's bar.
 * Prepares the render context of the partial; the bar itself (module/apps/hotbar.mjs) renders it
 * and re-renders on the hooks listed in registerTokenHotbarHooks().
 */

import { prepareStatusTracker } from "./status-tracker.mjs";

/** Template path; the bar loads it as a partial under this name before its first render. */
export const TEMPLATE = "systems/kristallpunk/templates/ui/token-hotbar.hbs";

/** Actor types the character mode can show. */
const TYPES = ["protagonist"];

/**
 * The figure the token hotbar shows: the token selected last, otherwise the user's own character
 * (with its token on the current scene, if there is one).
 * @returns {{actor: Actor|null, token: Token|null}}
 */
export function currentFigure() {
  const ready = !!canvas?.ready;
  const selected = ready ? canvas.tokens.controlled.at(-1) : null;
  if ( selected ) {
    const actor = selected.actor;
    return TYPES.includes(actor?.type) ? { actor, token: selected } : { actor: null, token: null };
  }
  const actor = game.user.character;
  if ( !TYPES.includes(actor?.type) ) return { actor: null, token: null };
  const token = ready ? (actor.getActiveTokens(true)[0] ?? null) : null;
  return { actor, token };
}

/**
 * Render context of the token hotbar partial.
 * Image: the token's image, otherwise the actor's portrait. Name: the token's name, so unlinked tokens
 * of the same actor can be told apart, otherwise the actor's name.
 * The status tracker is the same building block as on the sheet; only owners may change it.
 * @returns {{actor: Actor, editable: boolean, name: string, img: string, tokenId: string|null, hint: string,
 *   statusTracker: object}|null}  null if there is no figure to show.
 */
export function prepareTokenHotbar() {
  const { actor, token } = currentFigure();
  if ( !actor ) return null;
  return {
    actor,
    editable: actor.isOwner,
    statusTracker: prepareStatusTracker(actor),
    name: token?.document.name || actor.name,
    img: token?.document.texture.src || actor.img,
    tokenId: token?.id ?? null,
    hint: token ? "KRISTALLPUNK.Hotbar.Portrait.Token" : "KRISTALLPUNK.Hotbar.Portrait.Sheet"
  };
}

/**
 * Re-render the bar whenever the shown figure or its data may have changed.
 * Calls are collected briefly, so selecting many tokens at once renders only once.
 * Called during init.
 */
export function registerTokenHotbarHooks() {
  const refresh = foundry.utils.debounce(() => {
    if ( ui.hotbar?.rendered ) ui.hotbar.render();
  }, 50);
  const shows = document => {
    const { actor, token } = currentFigure();
    if ( !actor || !document ) return false;
    return (document.uuid === actor.uuid) || (!!token && (document.id === token.id));
  };

  Hooks.on("controlToken", refresh);
  Hooks.on("canvasReady", refresh);
  Hooks.on("updateUser", (user, changes) => {
    if ( user.isSelf && ("character" in changes) ) refresh();
  });
  Hooks.on("updateActor", actor => {
    if ( shows(actor) ) refresh();
  });
  // Unlinked tokens change their actor through the token; name and image live on the token too
  Hooks.on("updateToken", token => {
    if ( shows(token) || shows(token.actor) ) refresh();
  });
  Hooks.on("createToken", refresh);
  Hooks.on("deleteToken", refresh);
}

/**
 * Pan the canvas to a token of the current scene.
 * @param {string} tokenId
 * @returns {Promise<void>}
 */
export async function panToToken(tokenId) {
  const token = canvas?.ready ? canvas.tokens.get(tokenId) : null;
  if ( token ) await canvas.animatePan({ x: token.center.x, y: token.center.y });
}
