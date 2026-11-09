/**
 * Requesting checks (#33). Foundry layer: the GM asks one or more figures for a check by a chat card;
 * the players roll from there. Available as game.kristallpunk.api.requestCheck.
 */

import RequestDialog, { defaultRequestSelection, requestFigures, VISIBILITIES } from "../apps/request-dialog.mjs";

/**
 * Request a check from one or more figures. Posts one request card with a row per figure; whoever owns
 * a figure rolls from there, prefilled with the request, and may still change grade and modifiers.
 * GM only.
 * @param {string} key                                A skill key (e.g. "athletics") or derived value key (e.g. "courage").
 * @param {object} [options]
 * @param {(Actor|string)[]} [options.actors]         Figures or their UUIDs. Defaults to the targeted figures,
 *                                                    otherwise the characters of the players who are online.
 * @param {string} [options.grade="daring"]           carefree, daring or fateful.
 * @param {import("./check.mjs").CheckModifier[]} [options.modifiers]  Individual bonuses and penalties.
 * @param {"public"|"involved"} [options.visibility="public"]  Who sees the request: everybody, or only the GMs
 *                                                    and the owners of the requested figures.
 * @param {boolean} [options.dialog=true]             Show the request dialog, prefilled with these options.
 * @returns {Promise<ChatMessage|null>}  null if nothing was requested.
 */
export async function requestCheck(key, options = {}) {
  if ( !game.user.isGM ) {
    ui.notifications.warn("KRISTALLPUNK.Request.Warning.GMOnly", { localize: true });
    return null;
  }
  const { skills, derived } = CONFIG.KRISTALLPUNK;
  const entry = skills[key] ?? derived[key];
  if ( !entry ) throw new Error(`Unknown check ${key}`);
  let { grade = "daring", modifiers = [], visibility = "public", dialog = true } = options;
  if ( !VISIBILITIES.includes(visibility) ) throw new Error(`Unknown visibility ${visibility}`);

  const preset = defaultRequestSelection();
  let uuids = options.actors ? options.actors.map(actor => (typeof actor === "string" ? actor : actor.uuid)) : preset.uuids;
  if ( dialog ) {
    // Given figures that are only in the list of owned figures switch the dialog to that list
    const assigned = new Set(requestFigures("assigned").map(({ actor }) => actor.uuid));
    const list = options.actors ? (uuids.every(uuid => assigned.has(uuid)) ? "assigned" : "owned") : preset.list;
    const choice = await RequestDialog.wait({ label: game.i18n.localize(entry.label), list, uuids, grade, modifiers, visibility });
    if ( !choice ) return null;
    ({ uuids, grade, modifiers, visibility } = choice);
  }
  uuids = [...new Set(uuids)];
  if ( !uuids.length ) {
    ui.notifications.warn("KRISTALLPUNK.Request.Warning.NoFigures", { localize: true });
    return null;
  }

  const data = {
    type: "checkRequest",
    speaker: ChatMessage.implementation.getSpeaker({ user: game.user }),
    system: {
      check: key, grade, figures: uuids,
      modifiers: modifiers.map(({ value, label = "" }) => ({ value, label }))
    }
  };
  if ( visibility === "involved" ) data.whisper = involvedUsers(uuids);
  return ChatMessage.implementation.create(data);
}

/**
 * The GMs and every player who owns one of the figures.
 * @param {string[]} uuids
 * @returns {string[]}  User IDs.
 */
function involvedUsers(uuids) {
  const actors = uuids.map(uuid => fromUuidSync(uuid)).filter(actor => actor);
  return game.users
    .filter(user => user.isGM || actors.some(actor => actor.testUserPermission(user, "OWNER")))
    .map(user => user.id);
}
