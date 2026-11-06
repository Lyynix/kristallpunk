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
      // Rerolls in order (#15, #16), see rules.check.REROLL_MODES; reroll n brings the dice of roll n + 1
      rerolls: new ArrayField(new StringField({ required: true, blank: false, choices: checkRules.REROLL_MODES }))
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
   * The rolls of the check step by step: the first roll, then one step per reroll whose dice are attached.
   * Each reroll keeps part of the faces before it (rules.check.reroll) and adds the new dice after them.
   * @type {{mode: string|null, faces: number[], kept: number, result: object}[]}
   *   `mode` is null for the first roll; `kept` is how many leading faces were kept from the step before.
   */
  get steps() {
    let faces = facesOf(this.parent.rolls[0]);
    const steps = [{ mode: null, faces, kept: 0 }];
    this.rerolls.forEach((mode, index) => {
      const roll = this.parent.rolls[index + 1];
      if ( !roll ) return;
      const { keep } = checkRules.reroll({ faces, mode });
      faces = [...keep, ...facesOf(roll)];
      steps.push({ mode, faces, kept: keep.length });
    });
    for ( const step of steps ) step.result = checkRules.evaluate({ faces: step.faces, grade: this.grade });
    return steps;
  }

  /**
   * Faces that count: those of the last step.
   * @type {number[]}
   */
  get faces() {
    return this.steps.at(-1).faces;
  }

  /** The result, from rules.check.evaluate. */
  get result() {
    return this.steps.at(-1).result;
  }

  /**
   * Whether conviction was spent on a reroll of this check.
   * @type {boolean}
   */
  get convictionRerolled() {
    return this.rerolls.some(mode => checkRules.CONVICTION_REROLLS.includes(mode));
  }

  /**
   * Whether a reroll has been recorded but its dice are not attached yet.
   * @type {boolean}
   */
  get rerolling() {
    return this.rerolls.length >= this.parent.rolls.length;
  }

  /**
   * How the current user could reroll by spending conviction, or null if not possible:
   * as rules.check.canReroll allows, depending on conviction before this check (provisional, see issue #17),
   * only with dice left to reroll, and only for the one who rolled and the GM.
   * @type {"keepSixes"|"all"|null}
   */
  get rerollOption() {
    const { before } = this.conviction;
    if ( (before === null) || this.rerolling ) return null;
    if ( !(game.user.isGM || this.parent.isAuthor) ) return null;
    const mode = convictionRules.rerollMode(before);
    if ( !mode || !checkRules.canReroll({ rerolls: this.rerolls, mode }) ) return null;
    return checkRules.reroll({ faces: this.faces, mode }).count ? mode : null;
  }

  /**
   * Reroll by spending conviction; with automatic consequences, conviction is updated right away.
   * @returns {Promise<boolean>}  Whether this call rerolled.
   */
  async rerollWithConviction() {
    const mode = this.rerollOption;
    if ( !mode ) return false;
    if ( !await this.#reroll(mode) ) return false;
    if ( game.settings.get(SYSTEM_ID, "autoApply") ) await this.parent.system.applyConviction();
    return true;
  }

  /**
   * Reroll the current faces in a mode. The card records the reroll before rolling, so a second click,
   * here or on another client, finds it recorded and does nothing. The new dice are attached as a further roll.
   * @param {string} mode
   * @returns {Promise<boolean>}  Whether this call rerolled.
   */
  async #reroll(mode) {
    const actor = await fromUuid(this.actor);
    if ( !actor?.isOwner ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.CannotApply", { localize: true });
      return false;
    }
    const message = this.parent;
    const rerolls = [...this.rerolls];
    const { count } = checkRules.reroll({ faces: this.faces, mode });
    await message.update({ "system.rerolls": [...rerolls, mode] });
    let roll;
    try {
      roll = await new Roll(`${count}d6`).evaluate();
    } catch (err) {
      await message.update({ "system.rerolls": rerolls });
      throw err;
    }
    await game.dice3d?.showForRoll(roll, game.user, true, message.whisper.length ? message.whisper : null,
      message.blind, message.id, message.speaker);
    await message.update({ rolls: [...message.rolls, roll] });
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
    return convictionRules.consequences({ before, rerolled: this.convictionRerolled, critical: this.result.critical });
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
      dice: orderDice(this.faces, result.criticalFailure),
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
    // The shift of the result before the conviction reroll does not apply
    const steps = this.steps;
    const convictionStep = steps.findIndex(step => checkRules.CONVICTION_REROLLS.includes(step.mode));
    if ( (convictionStep > 0) && steps[convictionStep - 1].result.critical ) {
      parts.push(game.i18n.localize("KRISTALLPUNK.Check.Conviction.Cancelled"));
    }
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
   * Reroll section of the card: the button while a conviction reroll is possible,
   * and the history of all rolls once the check was rerolled. In the history, the dice of each step
   * keep their order; dice kept from the step before are marked.
   * @returns {{option: object|null, history: object[]|null}}
   */
  #prepareReroll() {
    const mode = this.rerollOption;
    const steps = this.steps;
    const history = steps.length > 1 ? steps.map(step => ({
      label: game.i18n.format(`KRISTALLPUNK.Check.Reroll.Step.${step.mode ?? "first"}`, {
        count: step.faces.length - step.kept
      }),
      dice: step.faces.map((face, index) => ({
        face, kept: index < step.kept, icon: `fa-regular fa-dice-${FACE_ICONS[face - 1]}`
      }))
    })) : null;
    return {
      option: mode ? { hint: `KRISTALLPUNK.Check.Reroll.Mode.${mode}` } : null,
      history
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
 * Highlighted dice are drawn solid, all others as outlines.
 * @param {number[]} faces
 * @param {boolean} criticalFailure
 * @returns {{face: number, icon: string, highlight: "success"|"failure"|null}[]}
 */
function orderDice(faces, criticalFailure) {
  const die = (face, highlight = null) => ({
    face, highlight,
    icon: `${highlight ? "fa-solid" : "fa-regular"} fa-dice-${FACE_ICONS[face - 1]}`
  });
  const ones = criticalFailure ? faces.filter(face => face === 1).map(face => die(face, "failure")) : [];
  const sixes = faces.filter(face => face === 6).map(face => die(face, "success"));
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
