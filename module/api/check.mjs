/**
 * Rolling checks (Proben). Foundry layer: rolls Foundry dice, evaluates them with the rules
 * and posts the result to the chat.
 * Available as game.kristallpunk.api.rollCheck.
 */

import * as costRules from "../rules/cost.mjs";
import CheckDialog from "../apps/check-dialog.mjs";
import CheckMessageData from "../data/check-message.mjs";
import { SYSTEM_ID } from "../settings.mjs";

/**
 * @typedef {object} CheckModifier
 * @property {number} value   Bonus (positive) or penalty (negative) in dice.
 * @property {string} [label] Why the modifier applies, e.g. "Dunkelheit".
 */

/**
 * Roll a check for a skill or a derived value.
 * Bonuses and penalties are passed on one by one; only rules.check.pool nets them and applies the rule of 3.
 * The stamina cost is computed (unless the "autoCost" setting is off) and can be overridden,
 * but is not yet applied (see #14).
 * @param {Actor} actor
 * @param {string} key                            A skill key (e.g. "athletics") or derived value key (e.g. "courage").
 * @param {object} [options]
 * @param {string} [options.grade="daring"]       carefree, daring or fateful.
 * @param {CheckModifier[]} [options.modifiers]   Individual bonuses and penalties.
 * @param {number} [options.helpers=0]            Number of helpers, 0 to 3; each adds +1.
 * @param {string} [options.messageMode]          Chat visibility; defaults to the core setting.
 * @param {{domain: string, amount: number}[]} [options.cost]  Stamina payments overriding the computed cost.
 * @param {boolean} [options.dialog=true]         Show the check dialog, prefilled with these options.
 *                                                Pass false to roll directly, e.g. from a macro.
 * @returns {Promise<{roll: Roll, pool: object, result: object, cost: object, message: ChatMessage}|null>}
 *   null if the check could not be rolled or the dialog was closed.
 */
export async function rollCheck(actor, key, options = {}) {
  let {
    grade = "daring", modifiers = [], helpers = 0,
    messageMode = game.settings.get("core", "messageMode"), dialog = true
  } = options;
  if ( !actor?.isOwner ) {
    ui.notifications.warn("KRISTALLPUNK.Check.Warning.NotOwner", { localize: true });
    return null;
  }
  const target = resolveTarget(actor, key);
  if ( !target ) throw new Error(`Unknown check ${key}`);

  const system = actor.system;
  const cost = costRules.stamina({
    domain: target.domain,
    stamina: { body: system.stamina.body.value, mind: system.stamina.mind.value },
    wounds: { ...system.wounds },
    ageGroup: system.ageGroup
  });
  if ( !cost.possible ) {
    ui.notifications.warn("KRISTALLPUNK.Check.Warning.Unconscious", { localize: true });
    return null;
  }

  // Payments to make: given, computed, or none if the cost is not calculated automatically
  const autoCost = game.settings.get(SYSTEM_ID, "autoCost");
  let payments = options.cost ?? (autoCost ? cost.payments : []);

  if ( dialog ) {
    const choice = await CheckDialog.wait({
      label: target.label, base: target.base, grade, modifiers, helpers, messageMode,
      cost: costForDialog(actor, target, cost, payments, autoCost)
    });
    if ( !choice ) return null;
    ({ grade, modifiers, helpers, messageMode } = choice);
    payments = choice.cost;
  }

  // The message data keeps bonuses, penalties and helpers apart; it nets them via rules.check.pool
  const messageData = {
    actor: actor.uuid, check: key, grade, base: target.base,
    modifiers: modifiers.map(({ value, label = "" }) => ({ value, label })), helpers
  };
  const data = new CheckMessageData(messageData);
  const pool = data.pool;
  const roll = await new Roll(`${pool.dice}d6`).evaluate();

  const message = await ChatMessage.implementation.create({
    type: "check",
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    system: messageData
  }, { messageMode });
  if ( !message ) return null;

  return { roll, pool, result: message.system.result, cost: { ...cost, payments, auto: autoCost }, message };
}

/**
 * Cost section of the check dialog: one field per paying stamina, with the breakdown and warnings.
 * Without automatic calculation, both stamina get an empty field to fill in.
 * Derived values cost nothing and get no fields.
 * @param {Actor} actor
 * @param {{domain: string|null}} target
 * @param {object} cost             From rules.cost.stamina.
 * @param {{domain: string, amount: number}[]} payments  Prefilled payments.
 * @param {boolean} autoCost
 * @returns {{fields: {domain: string, label: string, amount: number}[], parts: object[],
 *   strained: boolean, unconsciousAfter: boolean}}
 */
function costForDialog(actor, target, cost, payments, autoCost) {
  if ( target.domain === null ) return { fields: [], parts: [], strained: false, unconsciousAfter: false };
  const label = domain => actor.system.schema.fields.stamina.fields[domain].fields.value.label;
  const domains = autoCost ? payments.map(payment => payment.domain) : Object.keys(CONFIG.KRISTALLPUNK.domains);
  return {
    fields: domains.map(domain => ({
      domain,
      label: label(domain),
      amount: payments.find(payment => payment.domain === domain)?.amount ?? 0
    })),
    parts: autoCost ? cost.parts : [],
    strained: autoCost && cost.strained,
    unconsciousAfter: autoCost && cost.unconsciousAfter
  };
}

/**
 * What is being checked: base value, paying domain (null for derived values) and label.
 * @param {Actor} actor
 * @param {string} key
 * @returns {{base: number, domain: string|null, label: string}|null}
 */
function resolveTarget(actor, key) {
  const { skills, attributes, derived } = CONFIG.KRISTALLPUNK;
  if ( key in skills ) {
    return {
      base: actor.system.skills[key].total,
      domain: attributes[skills[key].attribute].domain,
      label: game.i18n.localize(skills[key].label)
    };
  }
  if ( key in derived ) {
    return { base: actor.system.derived[key].value, domain: null, label: game.i18n.localize(derived[key].label) };
  }
  return null;
}
