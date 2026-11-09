/**
 * Data of a check request chat message (type "checkRequest", #33): the GM asks one or more figures for a check.
 * One card per request, with a row per figure. The checks themselves are ordinary check messages; the request
 * collects their results. It only prefills them, so players may still change grade and modifiers.
 *
 * Results are linked by the client of the active GM (see registerCheckRequestHooks): players may not change
 * the GM's message. After each new result the card is posted anew at the bottom of the chat; its `requestId`
 * stays the same, so checks pointing to the request still find it.
 */

import { rollCheck } from "../api/check.mjs";
import { orderDice } from "./check-message.mjs";
import { SYSTEM_ID } from "../settings.mjs";

const { DocumentUUIDField, StringField, NumberField, BooleanField, ArrayField, SchemaField } = foundry.data.fields;

/** Handlebars template of the card; preloaded during init so the card can be rendered synchronously. */
export const TEMPLATE = "systems/kristallpunk/templates/chat/check-request-card.hbs";

export default class CheckRequestMessageData extends foundry.abstract.TypeDataModel {
  /** @override */
  static defineSchema() {
    return {
      // Stays the same when the card is posted anew; checks rolled from the card point to it
      requestId: new StringField({ required: true, blank: false, initial: () => foundry.utils.randomID() }),
      // When the request was made, kept when the card is posted anew; null until then, see `since`
      requestedAt: new NumberField({ required: true, integer: true, min: 0, nullable: true, initial: null }),
      check: new StringField({ required: true, blank: false }),
      grade: new StringField({ required: true, choices: () => CONFIG.KRISTALLPUNK.checkGrades, initial: "daring" }),
      modifiers: new ArrayField(new SchemaField({
        value: new NumberField({ required: true, integer: true, nullable: false, initial: 0 }),
        label: new StringField({ required: true, blank: true })
      })),
      figures: new ArrayField(new DocumentUUIDField({ type: "Actor" })),
      // Which check message answers the request for which figure
      results: new ArrayField(new SchemaField({
        actor: new DocumentUUIDField({ type: "Actor" }),
        message: new StringField({ required: true, blank: false })
      })),
      // Figures the GM took out of the request before they rolled
      removed: new ArrayField(new DocumentUUIDField({ type: "Actor" })),
      // Closed by the GM: no figure can answer it any more
      closed: new BooleanField()
    };
  }

  /* -------------------------------------------- */

  /** Label of what is requested, e.g. "Athletik". */
  get label() {
    const { skills, derived } = CONFIG.KRISTALLPUNK;
    const entry = skills[this.check] ?? derived[this.check];
    return entry ? game.i18n.localize(entry.label) : this.check;
  }

  /**
   * When the request was made, by the server's clock like the timestamps of the checks: the timestamp of the
   * first card. A check rolled before does not count for the request.
   * @type {number}
   */
  get since() {
    return this.requestedAt ?? this.parent.timestamp;
  }

  /**
   * The check message that answers the request for a figure, if it still exists.
   * @param {string} uuid
   * @returns {ChatMessage|null}
   */
  resultFor(uuid) {
    const entry = this.results.find(result => (result.actor === uuid) && game.messages.has(result.message));
    return entry ? game.messages.get(entry.message) : null;
  }

  /**
   * Figures that still have to roll: neither rolled nor taken out, and none once the request is closed.
   * A figure whose check was deleted counts as open again.
   * @type {string[]}
   */
  get openFigures() {
    if ( this.closed ) return [];
    return this.figures.filter(uuid => !this.removed.includes(uuid) && !this.resultFor(uuid));
  }

  /**
   * Whether a check of a figure would answer this request.
   * @param {string} uuid  The figure's world actor.
   * @param {string} check
   * @returns {boolean}
   */
  isOpenFor(uuid, check) {
    return (check === this.check) && this.openFigures.includes(uuid);
  }

  /**
   * Close the request: figures that have not rolled cannot answer it any more. GM only.
   * @returns {Promise<boolean>}  Whether this call closed it.
   */
  async close() {
    if ( !game.user.isGM || this.closed ) return false;
    await this.parent.update({ "system.closed": true });
    return true;
  }

  /**
   * Take a figure that has not rolled out of the request. GM only.
   * @param {string} uuid
   * @returns {Promise<boolean>}  Whether this call took it out.
   */
  async removeFigure(uuid) {
    if ( !game.user.isGM || !this.openFigures.includes(uuid) ) return false;
    await this.parent.update({ "system.removed": [...this.removed, uuid] });
    return true;
  }

  /**
   * Roll the requested check for one of the figures, prefilled with the request. Anyone who owns the figure
   * may roll, the GM on behalf of the player. The check dialog lets them change grade and modifiers.
   * @param {string} uuid  One of the requested figures.
   * @param {object} [options]
   * @param {boolean} [options.dialog=true]  Show the check dialog.
   * @returns {Promise<object|null>}  See api.rollCheck.
   */
  async roll(uuid, { dialog = true } = {}) {
    if ( !this.figures.includes(uuid) ) return null;
    if ( !this.openFigures.includes(uuid) ) {
      ui.notifications.warn("KRISTALLPUNK.Request.Warning.NotOpen", { localize: true });
      return null;
    }
    const actor = await fromUuid(uuid);
    if ( !actor ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.ActorMissing", { localize: true });
      return null;
    }
    return rollCheck(actor, this.check, {
      grade: this.grade, modifiers: this.modifiers.map(modifier => ({ ...modifier })), dialog, request: this.requestId
    });
  }

  /* -------------------------------------------- */

  /**
   * HTML of the card. Synchronous, so it can replace the message content inside the render hook.
   * Each figure shows its result once it has rolled; to whom the check is hidden, only that it has rolled.
   * Figures that did not roll show why: taken out, or the request was closed. The GM can close the request
   * and take out figures that have not rolled.
   * @returns {string}
   */
  renderCard() {
    const players = game.users.filter(user => !user.isGM);
    const open = this.openFigures;
    const figures = this.figures.map(uuid => {
      const actor = fromUuidSync(uuid);
      if ( !actor ) return { uuid, missing: true };
      const check = this.resultFor(uuid);
      const isOpen = open.includes(uuid);
      let state = null;
      if ( !check && !isOpen ) state = this.removed.includes(uuid) ? "Removed" : "NotRolled";
      return {
        uuid,
        name: actor.name,
        img: actor.img,
        players: players.filter(user => user.character === actor).map(user => user.name).join(", "),
        result: check ? prepareResult(check) : null,
        state: state ? `KRISTALLPUNK.Request.Card.${state}` : null,
        // The GM rolls on behalf of the player; players only for their own figures
        roll: (isOpen && actor.isOwner) ? (game.user.isGM ? "behalf" : "own") : null,
        remove: isOpen && game.user.isGM
      };
    });
    let status = null;
    if ( this.closed ) status = "KRISTALLPUNK.Request.Card.Closed";
    else if ( !open.length ) status = "KRISTALLPUNK.Request.Card.Done";
    return Handlebars.partials[TEMPLATE]({
      label: this.label,
      grade: CONFIG.KRISTALLPUNK.checkGrades[this.grade].label,
      modifiers: this.modifiers.map(modifier => modifier.label
        ? `${modifier.value.signedString()} ${modifier.label}`
        : modifier.value.signedString()),
      figures,
      status,
      canClose: game.user.isGM && (open.length > 0)
    }, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
  }

  /**
   * Replace the content of a request message with its card. Registered for the renderChatMessageHTML hook.
   * A click on a roll button opens the prefilled check dialog, a shift-click rolls right away.
   * A click on a result shows its check in the chat. The GM's buttons close the request or take a figure out.
   * @param {ChatMessage} message
   * @param {HTMLElement} html
   */
  static onRenderChatMessageHTML(message, html) {
    if ( (message.type !== "checkRequest") || !message.isContentVisible ) return;
    const content = html.querySelector(".message-content");
    if ( !content ) return;
    content.innerHTML = message.system.renderCard();
    for ( const button of content.querySelectorAll("[data-action=rollRequested]") ) {
      button.addEventListener("click", event => message.system.roll(button.dataset.uuid, { dialog: !event.shiftKey }));
    }
    for ( const button of content.querySelectorAll("[data-action=removeFigure]") ) {
      button.addEventListener("click", () => {
        button.disabled = true;
        message.system.removeFigure(button.dataset.uuid);
      });
    }
    content.querySelector("[data-action=closeRequest]")?.addEventListener("click", event => {
      event.currentTarget.disabled = true;
      message.system.close();
    });
    for ( const result of content.querySelectorAll("[data-action=showCheck]") ) {
      result.addEventListener("click", () => showCheck(result.dataset.messageId));
    }
  }
}

/* -------------------------------------------- */
/*  Results                                     */
/* -------------------------------------------- */

/**
 * Short form of a check for the request card: dice, successes and outcome, as on the check card.
 * @param {ChatMessage} check
 * @returns {{messageId: string, hidden: boolean, dice?: object[], successes?: number, success?: boolean,
 *   criticalSuccess?: boolean, criticalFailure?: boolean}}
 */
function prepareResult(check) {
  if ( !check.isContentVisible ) return { messageId: check.id, hidden: true };
  const { faces, result } = check.system;
  return {
    messageId: check.id,
    hidden: false,
    dice: orderDice(faces, result.criticalFailure),
    successes: result.successes,
    success: result.success,
    criticalSuccess: result.criticalSuccess,
    criticalFailure: result.criticalFailure
  };
}

/**
 * Scroll the chat log to a check and highlight it briefly. Older messages the log has not loaded yet
 * cannot be shown.
 * @param {string} messageId
 */
function showCheck(messageId) {
  const entry = document.querySelector(`#chat .chat-log [data-message-id="${messageId}"]`);
  if ( !entry ) return;
  entry.scrollIntoView({ behavior: "smooth", block: "center" });
  // Restart the highlight if it is still running
  entry.classList.remove("kp-highlight");
  void entry.offsetWidth;
  entry.classList.add("kp-highlight");
  clearTimeout(highlightTimers.get(entry));
  highlightTimers.set(entry, setTimeout(() => entry.classList.remove("kp-highlight"), 1500));
}

/** Timers that end the highlight of a check, by chat log entry. */
const highlightTimers = new WeakMap();

/* -------------------------------------------- */
/*  Linking checks to requests                  */
/* -------------------------------------------- */

/**
 * All request messages.
 * @returns {ChatMessage[]}
 */
function requests() {
  return game.messages.filter(message => message.type === "checkRequest");
}

/**
 * The request message with a requestId.
 * @param {string} requestId
 * @returns {ChatMessage|null}
 */
export function findRequest(requestId) {
  return requests().find(message => message.system.requestId === requestId) ?? null;
}

/**
 * The world actor a check was rolled for: unlinked tokens stand for the actor they were made from.
 * @param {string} uuid  As stored on the check.
 * @returns {string|null}
 */
function figureOf(uuid) {
  const actor = uuid ? fromUuidSync(uuid) : null;
  if ( !actor ) return null;
  return (actor.isToken ? game.actors.get(actor.id) : actor)?.uuid ?? null;
}

/**
 * Link a check to the request it answers and post the request anew at the bottom of the chat.
 * A check rolled from a request card answers that request. Any other check answers the oldest open
 * request of the same check and figure made before it, if the "assignChecksToRequests" setting is on.
 * Only the active GM calls this.
 * @param {ChatMessage} check
 * @returns {Promise<boolean>}  Whether the check was linked.
 */
async function linkCheck(check) {
  if ( check.type !== "check" ) return false;
  const uuid = figureOf(check.system.actor);
  if ( !uuid ) return false;
  if ( requests().some(request => request.system.results.some(result => result.message === check.id)) ) return false;

  let request = null;
  if ( check.system.request ) {
    const own = findRequest(check.system.request);
    if ( own?.system.isOpenFor(uuid, check.system.check) ) request = own;
  }
  if ( !request && game.settings.get(SYSTEM_ID, "assignChecksToRequests") ) {
    request = requests()
      .filter(message => (message.system.since <= check.timestamp) && message.system.isOpenFor(uuid, check.system.check))
      .sort((a, b) => a.system.since - b.system.since)[0] ?? null;
  }
  if ( !request ) return false;

  // A result whose check was deleted is replaced
  const results = request.system.results.filter(result => result.actor !== uuid);
  results.push({ actor: uuid, message: check.id });
  await repost(request, { "system.results": results, "system.requestedAt": request.system.since });
  return true;
}

/**
 * Post a request anew at the bottom of the chat with some changes, and delete the old message.
 * Speaker, recipients, requestId and the time of the request stay the same; it makes no sound.
 * @param {ChatMessage} request
 * @param {object} changes  Flat changes to the message data, e.g. {"system.results": [...]}.
 * @returns {Promise<ChatMessage>}
 */
async function repost(request, changes) {
  const data = foundry.utils.mergeObject(request.toObject(), changes);
  delete data._id;
  delete data.timestamp;
  data.sound = null;
  const created = await ChatMessage.implementation.create(data);
  await request.delete();
  return created;
}

/** Links run one after the other, so each one sees the request as the one before left it. */
let queue = Promise.resolve();

/**
 * Queue a check to be linked.
 * @param {ChatMessage} check
 * @returns {Promise<boolean>}
 */
function queueLink(check) {
  const next = queue.then(() => linkCheck(check));
  queue = next.catch(err => console.error("Kristallpunk | Linking a check to its request failed", err));
  return next;
}

/**
 * Whether this client links checks to requests: only the active GM, so it happens exactly once.
 * @returns {boolean}
 */
function isLinker() {
  return !!game.users.activeGM?.isSelf;
}

/**
 * Show the request cards again that show a check, e.g. after a reroll changed it or it was deleted.
 * @param {ChatMessage} check
 */
function refreshRequestsOf(check) {
  for ( const request of requests() ) {
    if ( request.system.results.some(result => result.message === check.id) ) ui.chat?.updateMessage(request);
  }
}

/**
 * Link checks rolled while no GM was online: every unlinked check since the oldest open request.
 * Called by the active GM when the game is ready.
 * @returns {Promise<void>}
 */
async function catchUp() {
  const open = requests().filter(request => request.system.openFigures.length);
  if ( !open.length ) return;
  const since = Math.min(...open.map(request => request.system.since));
  const checks = game.messages
    .filter(message => (message.type === "check") && (message.timestamp >= since))
    .sort((a, b) => a.timestamp - b.timestamp);
  for ( const check of checks ) await queueLink(check);
}

/**
 * Hooks that link checks to requests and keep the request cards up to date. Called during init.
 */
export function registerCheckRequestHooks() {
  Hooks.on("createChatMessage", message => {
    if ( (message.type === "check") && isLinker() ) queueLink(message);
  });
  Hooks.on("updateChatMessage", message => {
    if ( message.type === "check" ) refreshRequestsOf(message);
  });
  Hooks.on("deleteChatMessage", message => {
    if ( message.type === "check" ) refreshRequestsOf(message);
  });
  Hooks.once("ready", () => {
    if ( isLinker() ) catchUp();
  });
}
