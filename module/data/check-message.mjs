/**
 * Data of a check chat message (type "check").
 * Stores only what was chosen when rolling; pool and result are computed from it and the attached roll,
 * so a later correction (#24) only has to change the inputs.
 */

import * as checkRules from "../rules/check.mjs";
import { payStamina } from "../api/check.mjs";

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
      applied: new BooleanField()
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
   * Faces of the attached roll in the order they were rolled.
   * @type {number[]}
   */
  get faces() {
    const die = this.parent.rolls[0]?.dice[0];
    return die ? die.results.filter(result => result.active).map(result => result.result) : [];
  }

  /** The result, from rules.check.evaluate. */
  get result() {
    return checkRules.evaluate({ faces: this.faces, grade: this.grade });
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
      outcome: result.success ? "success" : "failure",
      cost: this.cost.length ? {
        payments: this.cost.map(({ domain, amount }) => game.i18n.format("KRISTALLPUNK.Check.Cost.Payment", {
          stamina: game.i18n.localize(`KRISTALLPUNK.Stamina.${domain.capitalize()}`), amount
        })).join(", "),
        applied: this.applied,
        canApply: this.canApplyCost
      } : null,
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
 * A number with its sign, e.g. "+2" or "−1".
 * @param {number} value
 * @returns {string}
 */
function signed(value) {
  return value.signedString();
}
