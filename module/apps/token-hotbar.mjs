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
 * The status tracker is the same building block as on the sheet; only owners may change it or roll.
 * @returns {{actor: Actor, editable: boolean, name: string, img: string, tokenId: string|null, hint: string,
 *   statusTracker: object, statusSummary: object, checks: object[]}|null}  null if there is no figure to show.
 */
export function prepareTokenHotbar() {
  const { actor, token } = currentFigure();
  if ( !actor ) return null;
  return {
    actor,
    editable: actor.isOwner,
    statusTracker: prepareStatusTracker(actor),
    statusSummary: prepareStatusSummary(actor),
    checks: prepareChecks(actor),
    name: token?.document.name || actor.name,
    img: token?.document.texture.src || actor.img,
    tokenId: token?.id ?? null,
    hint: token ? "KRISTALLPUNK.Hotbar.Portrait.Token" : "KRISTALLPUNK.Hotbar.Portrait.Sheet"
  };
}

/**
 * Everything the figure can roll from the bar, in three columns: the skills of each domain in the order
 * of CONFIG.KRISTALLPUNK.skills, then the derived values.
 * @param {Actor} actor
 * @returns {{key: string, entries: {key: string, label: string, value: number, tooltip: string}[]}[]}
 */
function prepareChecks(actor) {
  const { skills, attributes, derived, domains } = CONFIG.KRISTALLPUNK;
  const hint = game.i18n.localize("KRISTALLPUNK.Hotbar.CheckHint");
  const entry = (key, label, value) => {
    label = game.i18n.localize(label);
    return { key, label, value, tooltip: `${label} ${value} · ${hint}` };
  };
  const groups = Object.keys(domains).map(domain => ({
    key: domain,
    entries: Object.entries(skills)
      .filter(([, skill]) => attributes[skill.attribute].domain === domain)
      .map(([key, skill]) => entry(key, skill.label, actor.system.skills[key].total))
  }));
  groups.push({
    key: "derived",
    entries: Object.entries(derived).map(([key, value]) => entry(key, value.label, actor.system.derived[key].value))
  });
  return groups;
}

/**
 * Short form of the status tracker, shown while the checks are folded out on a narrow bar (#32):
 * per domain the wounds and the stamina as value and maximum, and the conviction.
 * @param {Actor} actor
 * @returns {{domains: object[], conviction: string, convictionLabel: string}}
 */
function prepareStatusSummary(actor) {
  const system = actor.system;
  const fields = system.schema.fields;
  const domains = Object.keys(CONFIG.KRISTALLPUNK.domains).map(domain => {
    const woundField = fields.wounds.fields[domain];
    const wounds = system.wounds[domain];
    return {
      key: domain,
      label: game.i18n.localize(CONFIG.KRISTALLPUNK.domains[domain].label),
      woundsLabel: woundField.label,
      wounds: Array.from({ length: woundField.max }, (_, i) => ({ on: i < wounds })),
      stamina: `${system.stamina[domain].value}/${system.stamina[domain].max}`
    };
  });
  const conviction = system.conviction;
  return {
    domains,
    conviction: conviction > 0 ? `+${conviction}` : String(conviction),
    convictionLabel: fields.conviction.label
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
