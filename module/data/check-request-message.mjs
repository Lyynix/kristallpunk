/**
 * Data of a check request chat message (type "checkRequest", #33): the GM asks one or more figures for a check.
 * One card per request, with a row per figure. The checks themselves are ordinary check messages that point
 * back to the request (CheckMessageData#request); the request only prefills them.
 */

import { rollCheck } from "../api/check.mjs";

const { DocumentUUIDField, StringField, NumberField, ArrayField, SchemaField } = foundry.data.fields;

/** Handlebars template of the card; preloaded during init so the card can be rendered synchronously. */
export const TEMPLATE = "systems/kristallpunk/templates/chat/check-request-card.hbs";

export default class CheckRequestMessageData extends foundry.abstract.TypeDataModel {
  /** @override */
  static defineSchema() {
    return {
      check: new StringField({ required: true, blank: false }),
      grade: new StringField({ required: true, choices: () => CONFIG.KRISTALLPUNK.checkGrades, initial: "daring" }),
      modifiers: new ArrayField(new SchemaField({
        value: new NumberField({ required: true, integer: true, nullable: false, initial: 0 }),
        label: new StringField({ required: true, blank: true })
      })),
      figures: new ArrayField(new DocumentUUIDField({ type: "Actor" }))
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
   * Roll the requested check for one of the figures, prefilled with the request. Anyone who owns the figure
   * may roll, the GM on behalf of the player. The check dialog lets them change grade and modifiers.
   * @param {string} uuid  One of the requested figures.
   * @param {object} [options]
   * @param {boolean} [options.dialog=true]  Show the check dialog.
   * @returns {Promise<object|null>}  See api.rollCheck.
   */
  async roll(uuid, { dialog = true } = {}) {
    if ( !this.figures.includes(uuid) ) return null;
    const actor = await fromUuid(uuid);
    if ( !actor ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.ActorMissing", { localize: true });
      return null;
    }
    return rollCheck(actor, this.check, {
      grade: this.grade, modifiers: this.modifiers.map(modifier => ({ ...modifier })), dialog, request: this.parent.id
    });
  }

  /* -------------------------------------------- */

  /**
   * HTML of the card. Synchronous, so it can replace the message content inside the render hook.
   * @returns {string}
   */
  renderCard() {
    const players = game.users.filter(user => !user.isGM);
    return Handlebars.partials[TEMPLATE]({
      label: this.label,
      grade: CONFIG.KRISTALLPUNK.checkGrades[this.grade].label,
      modifiers: this.modifiers.map(modifier => modifier.label
        ? `${modifier.value.signedString()} ${modifier.label}`
        : modifier.value.signedString()),
      figures: this.figures.map(uuid => {
        const actor = fromUuidSync(uuid);
        if ( !actor ) return { uuid, missing: true };
        return {
          uuid,
          name: actor.name,
          img: actor.img,
          players: players.filter(user => user.character === actor).map(user => user.name).join(", "),
          // The GM rolls on behalf of the player; players only for their own figures
          roll: actor.isOwner ? (game.user.isGM ? "behalf" : "own") : null
        };
      })
    }, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
  }

  /**
   * Replace the content of a request message with its card. Registered for the renderChatMessageHTML hook.
   * A click on a roll button opens the prefilled check dialog, a shift-click rolls right away.
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
  }
}
