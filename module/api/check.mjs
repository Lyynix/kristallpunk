/**
 * Rolling checks (Proben). Foundry layer: rolls Foundry dice, evaluates them with the rules
 * and posts the result to the chat.
 * Available as game.kristallpunk.api.rollCheck.
 */

import * as costRules from "../rules/cost.mjs";
import * as checkRules from "../rules/check.mjs";
import * as convictionRules from "../rules/conviction.mjs";
import CheckDialog from "../apps/check-dialog.mjs";
import PresetDialog from "../apps/preset-dialog.mjs";
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
 * The stamina cost is computed (unless the "autoCost" setting is off) and can be overridden.
 * Critical results shift conviction (#15).
 * Both are applied right away if the "autoApply" setting is on; otherwise the card keeps them open
 * and offers buttons to apply them (#14, #15).
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
 * @param {{sixes?: number, ones?: number}} [options.preset]  GM only: exactly this many sixes and ones (#25).
 *                                                The other dice show 2 to 5. Ignored with a warning for players.
 *                                                In the check dialog, the GM can also open a window to preset them.
 * @param {string} [options.request]              `requestId` of the check request this check answers (#33).
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
  let preset = options.preset ?? null;
  if ( preset && !game.user.isGM ) {
    ui.notifications.warn("KRISTALLPUNK.Check.Warning.PresetGMOnly", { localize: true });
    preset = null;
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
  // An unconscious figure cannot act at all. A check the stamina cannot pay for is only stopped while the
  // cost is calculated automatically; otherwise the cost is up to the table (#17).
  const autoCost = game.settings.get(SYSTEM_ID, "autoCost");
  if ( !cost.possible && (autoCost || (cost.reason === "unconscious")) ) {
    const warning = cost.reason === "unconscious" ? "Unconscious" : "NotEnoughStamina";
    ui.notifications.warn(`KRISTALLPUNK.Check.Warning.${warning}`, { localize: true });
    return null;
  }

  // Payments to make: given, computed, or none if the cost is not calculated automatically
  let payments = options.cost ?? (autoCost ? cost.payments : []);

  let askPreset = false;
  if ( dialog ) {
    const choice = await CheckDialog.wait({
      label: target.label, base: target.base, grade, modifiers, helpers, messageMode,
      cost: costForDialog(actor, target, cost, payments, autoCost)
    });
    if ( !choice ) return null;
    ({ grade, modifiers, helpers, messageMode } = choice);
    payments = choice.cost;
    askPreset = choice.preset;
  }

  // The message data keeps bonuses, penalties and helpers apart; it nets them via rules.check.pool
  const messageData = {
    actor: actor.uuid, check: key, grade, base: target.base,
    modifiers: modifiers.map(({ value, label = "" }) => ({ value, label })), helpers,
    request: options.request ?? null
  };
  const data = new CheckMessageData(messageData);
  const pool = data.pool;
  // The GM chose to preset the dice; the pool size is only known now
  if ( askPreset ) {
    preset = await PresetDialog.wait({ label: target.label, dice: pool.dice });
    if ( !preset ) return null;
  }
  const roll = preset ? await presetRoll(pool.dice, preset) : await new Roll(`${pool.dice}d6`).evaluate();

  // Consequences: the rolling client applies them at once, or the card keeps them open
  const autoApply = game.settings.get(SYSTEM_ID, "autoApply");
  payments = payments.filter(payment => payment.amount > 0);
  if ( autoApply && payments.length ) payments = await payStamina(actor, payments);
  messageData.cost = payments;
  messageData.applied = autoApply && (payments.length > 0);

  const before = actor.system.conviction;
  const faces = roll.dice[0].results.filter(result => result.active).map(result => result.result);
  const { critical } = checkRules.evaluate({ faces, grade });
  const { delta } = convictionRules.consequences({ before, critical });
  messageData.conviction = { before, change: (autoApply && delta) ? await shiftConviction(actor, delta) : 0 };

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
 * A roll of dice d6 with exactly the given number of sixes and ones (#25). All other dice show 2 to 5,
 * drawn with Foundry's random generator; for a d6 known to be neither 1 nor 6 this is the fair distribution.
 * The faces are shuffled, and the result is a plain evaluated Nd6 roll, so the card and Dice So Nice
 * cannot tell it from a normal one.
 * @param {number} dice
 * @param {{sixes?: number, ones?: number}} preset
 * @returns {Promise<Roll>}
 */
async function presetRoll(dice, { sixes = 0, ones = 0 }) {
  for ( const count of [sixes, ones] ) {
    if ( !Number.isInteger(count) || (count < 0) ) throw new Error(`Invalid preset count ${count}`);
  }
  if ( sixes + ones > dice ) throw new Error(`Preset of ${sixes + ones} dice exceeds the pool of ${dice}`);
  const random = () => CONFIG.Dice.randomUniform();
  const faces = [
    ...Array(sixes).fill(6),
    ...Array(ones).fill(1),
    ...Array.from({ length: dice - sixes - ones }, () => 2 + Math.floor(random() * 4))
  ];
  for ( let i = faces.length - 1; i > 0; i-- ) {
    const j = Math.floor(random() * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }
  return rollWithFaces(faces);
}

/**
 * A plain evaluated Nd6 roll showing the given faces in this order, for presets (#25) and edits by the GM (#24).
 * @param {number[]} faces  1 to 6 each.
 * @returns {Promise<Roll>}
 */
export async function rollWithFaces(faces) {
  // Evaluate without the manual dice prompt, then put the faces in place
  const roll = await new Roll(`${faces.length}d6`).evaluate({ allowInteractive: false });
  roll.dice[0].results.forEach((result, index) => result.result = faces[index]);
  roll._total = roll._evaluateTotal();
  return roll;
}

/**
 * Pay stamina: lower each stamina by its amount, but not below 0.
 * @param {Actor} actor
 * @param {{domain: string, amount: number}[]} payments
 * @returns {Promise<{domain: string, amount: number}[]>}  What was actually paid.
 */
export async function payStamina(actor, payments) {
  const update = {};
  const paid = payments.map(({ domain, amount }) => {
    const current = actor.system.stamina[domain].value;
    const actual = Math.min(amount, current);
    update[`system.stamina.${domain}.value`] = current - actual;
    return { domain, amount: actual };
  });
  await actor.update(update);
  return paid;
}

/**
 * Shift conviction by an amount, but not beyond -3 and +3.
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<number>}  The actual change.
 */
export async function shiftConviction(actor, amount) {
  const { min, max } = convictionRules.LIMITS;
  const current = actor.system.conviction;
  const value = Math.min(max, Math.max(min, current + amount));
  if ( value !== current ) await actor.update({ "system.conviction": value });
  return value - current;
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

/**
 * Give stamina back that a check has paid, but not above the maximum.
 * @param {Actor} actor
 * @param {{domain: string, amount: number}[]} payments
 * @returns {Promise<void>}
 */
export async function refundStamina(actor, payments) {
  const update = {};
  for ( const { domain, amount } of payments ) {
    const { value, max } = actor.system.stamina[domain];
    update[`system.stamina.${domain}.value`] = Math.min(value + amount, Math.max(max, value));
  }
  await actor.update(update);
}
