/**
 * Data of a check chat message (type "check").
 * Stores only what was chosen when rolling; pool and result are computed from it and the attached roll,
 * so a later correction (#24) only has to change the inputs.
 */

import * as checkRules from "../rules/check.mjs";
import * as convictionRules from "../rules/conviction.mjs";
import { payStamina, refundStamina, shiftConviction } from "../api/check.mjs";
import { SYSTEM_ID } from "../settings.mjs";

const { DocumentUUIDField, StringField, NumberField, BooleanField, ArrayField, SchemaField } = foundry.data.fields;

/** Handlebars template of the card; preloaded during init so the card can be rendered synchronously. */
export const TEMPLATE = "systems/kristallpunk/templates/chat/check-card.hbs";

export default class CheckMessageData extends foundry.abstract.TypeDataModel {
  /** @override */
  static defineSchema() {
    return {
      actor: new DocumentUUIDField({ type: "Actor" }),
      check: new StringField({ required: true, blank: false }),
      grade: new StringField({ required: true, choices: () => CONFIG.KRISTALLPUNK.checkGrades, initial: "daring" }),
      base: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      modifiers: new ArrayField(new SchemaField({
        value: new NumberField({ required: true, integer: true, nullable: false, initial: 0 }),
        label: new StringField({ required: true, blank: true })
      })),
      helpers: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Stamina payments of this check; once applied, the amounts actually paid
      cost: new ArrayField(new SchemaField({
        domain: new StringField({ required: true, choices: () => CONFIG.KRISTALLPUNK.domains }),
        amount: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      })),
      applied: new BooleanField(),
      // Conviction before this check changed it, and what the card has changed on the actor so far
      conviction: new SchemaField({
        before: new NumberField({ required: true, integer: true, nullable: true, initial: null }),
        change: new NumberField({ required: true, integer: true, nullable: false, initial: 0 })
      }),
      // Reroll by spending conviction (#15): how it was rerolled; the new dice are the second roll
      reroll: new SchemaField({
        mode: new StringField({ required: true, nullable: true, initial: null, choices: checkRules.CONVICTION_REROLLS })
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * All bonuses and penalties one by one, helpers as +1 each.
   * @type {{value: number, label: string}[]}
   */
  get allModifiers() {
    const helper = game.i18n.localize("KRISTALLPUNK.Check.Helper");
    return [
      ...this.modifiers,
      ...Array.from({ length: this.helpers }, () => ({ value: 1, label: helper }))
    ];
  }

  /** The dice pool, from rules.check.pool. */
  get pool() {
    return checkRules.pool({ base: this.base, modifiers: this.allModifiers.map(modifier => modifier.value) });
  }

  /**
   * Faces of the first roll in the order they were rolled.
   * @type {number[]}
   */
  get firstFaces() {
    return facesOf(this.parent.rolls[0]);
  }

  /**
   * Whether the check was rerolled by spending conviction and the new dice are attached.
   * @type {boolean}
   */
  get rerolled() {
    return (this.reroll.mode !== null) && (this.parent.rolls.length > 1);
  }

  /**
   * Dice kept from the first roll on a reroll (the sixes from +3 to +1), from rules.check.reroll.
   * @type {number[]}
   */
  get kept() {
    if ( this.reroll.mode === null ) return [];
    return checkRules.reroll({ faces: this.firstFaces, mode: this.reroll.mode }).keep;
  }

  /**
   * Faces that count: the first roll, or after a reroll the kept dice followed by the new ones.
   * @type {number[]}
   */
  get faces() {
    if ( !this.rerolled ) return this.firstFaces;
    return [...this.kept, ...facesOf(this.parent.rolls[1])];
  }

  /** The result, from rules.check.evaluate. */
  get result() {
    return checkRules.evaluate({ faces: this.faces, grade: this.grade });
  }

  /** The result of the first roll, which a reroll replaces. */
  get firstResult() {
    return checkRules.evaluate({ faces: this.firstFaces, grade: this.grade });
  }

  /**
   * How the current user could reroll by spending conviction, or null if not possible:
   * once per check, depending on conviction before this check (provisional, see issue #17),
   * only with dice left to reroll, and only for the one who rolled and the GM.
   * @type {"keepSixes"|"all"|null}
   */
  get rerollOption() {
    const { before } = this.conviction;
    if ( (this.reroll.mode !== null) || (before === null) ) return null;
    if ( !(game.user.isGM || this.parent.isAuthor) ) return null;
    const mode = convictionRules.rerollMode(before);
    if ( !mode ) return null;
    return checkRules.reroll({ faces: this.firstFaces, mode }).count ? mode : null;
  }

  /**
   * Reroll by spending conviction. The card records the reroll before rolling, so a second click,
   * here or on another client, finds it rerolled and does nothing. The new dice are attached
   * as a second roll; with automatic consequences, conviction is updated right away.
   * @returns {Promise<boolean>}  Whether this call rerolled.
   */
  async rerollWithConviction() {
    const mode = this.rerollOption;
    if ( !mode ) return false;
    const actor = await fromUuid(this.actor);
    if ( !actor?.isOwner ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.CannotApply", { localize: true });
      return false;
    }
    const message = this.parent;
    const { count } = checkRules.reroll({ faces: this.firstFaces, mode });
    await message.update({ "system.reroll.mode": mode });
    let roll;
    try {
      roll = await new Roll(`${count}d6`).evaluate();
    } catch (err) {
      await message.update({ "system.reroll.mode": null });
      throw err;
    }
    await game.dice3d?.showForRoll(roll, game.user, true, message.whisper.length ? message.whisper : null,
      message.blind, message.id, message.speaker);
    await message.update({ rolls: [message.rolls[0], roll] });
    if ( game.settings.get(SYSTEM_ID, "autoApply") ) await message.system.applyConviction();
    return true;
  }

  /**
   * Whether the current user may pay the open cost: only the one who rolled and the GM.
   * @type {boolean}
   */
  get canApplyCost() {
    return !this.applied && (this.cost.length > 0) && (game.user.isGM || this.parent.isAuthor);
  }

  /**
   * Pay the open stamina cost once. The card is marked as applied before paying, so a second click,
   * here or on another client, finds it applied and does nothing.
   * @returns {Promise<boolean>}  Whether the cost was paid by this call.
   */
  async applyCost() {
    if ( !this.canApplyCost ) return false;
    const actor = await fromUuid(this.actor);
    if ( !actor?.isOwner ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.CannotApply", { localize: true });
      return false;
    }
    const message = this.parent;
    await message.update({ "system.applied": true });
    try {
      const paid = await payStamina(actor, this.cost);
      await message.update({ "system.cost": paid });
    } catch (err) {
      await message.update({ "system.applied": false });
      throw err;
    }
    return true;
  }

  /**
   * Undo the consequences of this check: give back the stamina it paid, take back its conviction change
   * and mark both as open again, so they can be applied anew. GM only, without time limit (#14, #15).
   * @returns {Promise<boolean>}  Whether anything was undone.
   */
  async undoConsequences() {
    if ( !game.user.isGM || !this.hasConsequences ) return false;
    const actor = await fromUuid(this.actor);
    if ( !actor ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.ActorMissing", { localize: true });
      return false;
    }
    const { applied, cost } = this;
    const { change } = this.conviction;
    await this.parent.update({ "system.applied": false, "system.conviction.change": 0 });
    if ( applied ) await refundStamina(actor, cost);
    if ( change ) await shiftConviction(actor, -change);
    return true;
  }

  /**
   * How this check should change conviction, from rules.conviction.consequences.
   * null for messages without a recorded conviction.
   * @type {{value: number, delta: number, clamped: boolean, parts: object[]}|null}
   */
  get convictionTarget() {
    const { before } = this.conviction;
    if ( before === null ) return null;
    return convictionRules.consequences({ before, rerolled: this.reroll.mode !== null, critical: this.result.critical });
  }

  /**
   * Conviction change still to apply: what the rules ask for minus what the card has already changed.
   * @type {number}
   */
  get convictionOpen() {
    return (this.convictionTarget?.delta ?? 0) - this.conviction.change;
  }

  /**
   * Whether the current user may apply the open conviction change: only the one who rolled and the GM.
   * @type {boolean}
   */
  get canApplyConviction() {
    return (this.convictionOpen !== 0) && (game.user.isGM || this.parent.isAuthor);
  }

  /**
   * Apply the open conviction change once. As with the cost, the card records the change before
   * the actor is updated, so a second click finds nothing open.
   * @returns {Promise<boolean>}  Whether conviction was changed by this call.
   */
  async applyConviction() {
    if ( !this.canApplyConviction ) return false;
    const actor = await fromUuid(this.actor);
    if ( !actor?.isOwner ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.CannotApply", { localize: true });
      return false;
    }
    const message = this.parent;
    const { change } = this.conviction;
    const open = this.convictionOpen;
    await message.update({ "system.conviction.change": change + open });
    try {
      const actual = await shiftConviction(actor, open);
      if ( actual !== open ) await message.update({ "system.conviction.change": change + actual });
    } catch (err) {
      await message.update({ "system.conviction.change": change });
      throw err;
    }
    return true;
  }

  /**
   * Whether this card has changed anything on the actor that could be undone.
   * @type {boolean}
   */
  get hasConsequences() {
    return this.applied || (this.conviction.change !== 0);
  }

  /** Label of what was checked, e.g. "Athletik". */
  get label() {
    const { skills, derived } = CONFIG.KRISTALLPUNK;
    const entry = skills[this.check] ?? derived[this.check];
    return entry ? game.i18n.localize(entry.label) : this.check;
  }

  /* -------------------------------------------- */

  /**
   * HTML of the card. Synchronous, so it can replace the message content inside the render hook.
   * @returns {string}
   */
  renderCard() {
    const pool = this.pool;
    const result = this.result;
    return Handlebars.partials[TEMPLATE]({
      label: this.label,
      grade: CONFIG.KRISTALLPUNK.checkGrades[this.grade].label,
      dice: orderDice(this.faces, result.criticalFailure, this.rerolled ? this.kept.length : 0),
      result,
      reroll: this.#prepareReroll(),
      outcome: result.success ? "success" : "failure",
      cost: this.cost.length ? {
        payments: this.cost.map(({ domain, amount }) => game.i18n.format("KRISTALLPUNK.Check.Cost.Payment", {
          stamina: game.i18n.localize(`KRISTALLPUNK.Stamina.${domain.capitalize()}`), amount
        })).join(", "),
        applied: this.applied,
        canApply: this.canApplyCost
      } : null,
      conviction: this.#prepareConviction(),
      pool: {
        dice: pool.dice,
        lines: [
          game.i18n.format("KRISTALLPUNK.CheckDialog.Preview.Base", { value: this.base }),
          ...this.allModifiers.map(modifier => modifier.label
            ? `${signed(modifier.value)} ${modifier.label}`
            : signed(modifier.value)),
          ...(pool.capped ? [game.i18n.format("KRISTALLPUNK.CheckDialog.Preview.Capped", {
            raw: signed(pool.rawModifier), value: signed(pool.modifier)
          })] : []),
          ...(pool.minimum ? [game.i18n.localize("KRISTALLPUNK.CheckDialog.Preview.Minimum")] : [])
        ]
      }
    }, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
  }

  /**
   * Conviction line of the card: from and to, whether a limit was reached, and the apply state.
   * Hidden if the check does not touch conviction.
   * @returns {object|null}
   */
  #prepareConviction() {
    const target = this.convictionTarget;
    if ( !target || (!target.parts.length && !this.conviction.change) ) return null;
    const format = value => (value === 0 ? "0" : signed(value));
    const parts = target.parts.map(({ key, value }) => game.i18n.format(`KRISTALLPUNK.Check.Conviction.Part.${key}`, {
      value: format(value)
    }));
    if ( this.rerolled && this.firstResult.critical ) parts.push(game.i18n.localize("KRISTALLPUNK.Check.Conviction.Cancelled"));
    return {
      change: game.i18n.format("KRISTALLPUNK.Check.Conviction.Change", {
        from: format(this.conviction.before), to: format(target.value)
      }),
      parts: parts.join(", "),
      limit: target.clamped,
      applied: this.convictionOpen === 0,
      canApply: this.canApplyConviction
    };
  }

  /**
   * Reroll section of the card: the button while a reroll is possible, the first roll once rerolled.
   * @returns {{option: object|null, first: object|null}}
   */
  #prepareReroll() {
    const mode = this.rerollOption;
    const first = this.rerolled ? this.firstResult : null;
    return {
      option: mode ? { hint: `KRISTALLPUNK.Check.Reroll.Mode.${mode}` } : null,
      first: first ? { dice: orderDice(this.firstFaces, first.criticalFailure) } : null
    };
  }

  /**
   * Entries for the context menu of chat messages. Registered for the getChatMessageContextOptions hook.
   * @param {ChatLog} application
   * @param {object[]} options
   */
  static onGetChatMessageContextOptions(application, options) {
    const message = li => game.messages.get(li.dataset.messageId);
    options.push({
      label: "KRISTALLPUNK.Check.Context.UndoConsequences",
      icon: "fa-solid fa-rotate-left",
      visible: li => game.user.isGM && (message(li)?.type === "check") && message(li).system.hasConsequences,
      onClick: (event, li) => message(li)?.system.undoConsequences()
    });
  }

  /**
   * Replace the content of a check message with its card, unless the content is hidden from this user
   * (blind or private rolls keep Foundry's own "rolled privately" display).
   * Registered for the renderChatMessageHTML hook.
   * @param {ChatMessage} message
   * @param {HTMLElement} html
   */
  static onRenderChatMessageHTML(message, html) {
    if ( (message.type !== "check") || !message.isContentVisible ) return;
    const content = html.querySelector(".message-content");
    if ( !content ) return;
    content.innerHTML = message.system.renderCard();
    content.querySelector("[data-action=applyCost]")?.addEventListener("click", event => {
      event.currentTarget.disabled = true;
      message.system.applyCost();
    });
    content.querySelector("[data-action=applyConviction]")?.addEventListener("click", event => {
      event.currentTarget.disabled = true;
      message.system.applyConviction();
    });
    content.querySelector("[data-action=rerollWithConviction]")?.addEventListener("click", event => {
      event.currentTarget.disabled = true;
      message.system.rerollWithConviction();
    });
  }
}

/* -------------------------------------------- */

/** Names of the Font Awesome die faces, index = face - 1. */
const FACE_ICONS = ["one", "two", "three", "four", "five", "six"];

/**
 * Display order of the dice (#14): on a critical failure the ones first (highlighted as failure),
 * then the sixes (highlighted as success), then the rest in rolled order.
 * Without a critical failure, ones are not highlighted and stay in rolled order.
 * Highlighted dice are drawn solid, all others as outlines. After a reroll, the sixes kept from the
 * first roll come first among the sixes and are marked as kept.
 * @param {number[]} faces
 * @param {boolean} criticalFailure
 * @param {number} [kept=0]  How many sixes were kept from the first roll.
 * @returns {{face: number, icon: string, highlight: "success"|"failure"|null, kept: boolean}[]}
 */
function orderDice(faces, criticalFailure, kept = 0) {
  const die = (face, highlight = null, isKept = false) => ({
    face, highlight, kept: isKept,
    icon: `${highlight ? "fa-solid" : "fa-regular"} fa-dice-${FACE_ICONS[face - 1]}`
  });
  const ones = criticalFailure ? faces.filter(face => face === 1).map(face => die(face, "failure")) : [];
  const sixes = faces.filter(face => face === 6).map((face, index) => die(face, "success", index < kept));
  const rest = faces.filter(face => (face !== 6) && !(criticalFailure && (face === 1))).map(face => die(face));
  return [...ones, ...sixes, ...rest];
}

/**
 * Active faces of a roll in the order they were rolled.
 * @param {Roll} [roll]
 * @returns {number[]}
 */
function facesOf(roll) {
  const die = roll?.dice[0];
  return die ? die.results.filter(result => result.active).map(result => result.result) : [];
}

/**
 * A number with its sign, e.g. "+2" or "−1".
 * @param {number} value
 * @returns {string}
 */
function signed(value) {
  return value.signedString();
}
