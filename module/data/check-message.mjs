/**
 * Data of a check chat message (type "check").
 * Stores only what was chosen when rolling; pool and result are computed from it and the attached rolls.
 * Rerolls and corrections by the GM (#24) are further steps with their own roll, so nothing gets lost.
 */

import * as checkRules from "../rules/check.mjs";
import * as convictionRules from "../rules/conviction.mjs";
import { payStamina, refundStamina, rollWithFaces, shiftConviction } from "../api/check.mjs";
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
      rerolls: new ArrayField(new StringField({ required: true, blank: false, choices: checkRules.REROLL_MODES })),
      // Name of the competence each reroll of ones rested on (#46), in the order of those rerolls
      competencesUsed: new ArrayField(new StringField({ required: true, blank: true })),
      // `requestId` of the check request this check answers (#33), if it was rolled from the request
      request: new StringField({ required: true, blank: false, nullable: true, initial: null })
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
    let ones = 0;
    this.rerolls.forEach((mode, index) => {
      const roll = this.parent.rolls[index + 1];
      if ( !roll ) return;
      const { keep } = checkRules.reroll({ faces, mode });
      faces = [...keep, ...facesOf(roll)];
      // The competence a reroll of ones rested on, if known (#46)
      const competence = mode === "ones" ? (this.competencesUsed[ones++] || null) : null;
      steps.push({ mode, faces, kept: keep.length, competence });
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
   * Whether the current user could reroll the ones with a competence (Kurzregeln 1.0, p. 6):
   * only on skill checks, as rules.check.canReroll allows, only with ones to reroll,
   * only for the one who rolled and the GM, and only if the figure has a competence of the check's skill
   * that allows it (#46). Whether that competence covers what the figure does is up to the table.
   * @type {boolean}
   */
  get canRerollWithCompetence() {
    if ( !(this.check in CONFIG.KRISTALLPUNK.skills) || this.rerolling ) return false;
    if ( !(game.user.isGM || this.parent.isAuthor) ) return false;
    if ( !checkRules.canReroll({ rerolls: this.rerolls, mode: "ones" }) ) return false;
    if ( checkRules.reroll({ faces: this.faces, mode: "ones" }).count === 0 ) return false;
    return this.matchingCompetences.length > 0;
  }

  /**
   * Names of the figure's competences that belong to the skill of this check and allow rerolling ones (#46),
   * e.g. "Waffenmeister (Säbel)".
   * @type {string[]}
   */
  get matchingCompetences() {
    const actor = fromUuidSync(this.actor);
    return (actor?.itemTypes.competence ?? [])
      .filter(item => (item.system.skill === this.check) && item.system.rerollOnes)
      .map(item => item.system.fullName);
  }

  /**
   * Reroll all ones with a competence of the figure, which the card records (#46). The result may change a
   * critical result, so with automatic consequences, conviction is updated right away.
   * @param {string} competence  Name of the competence, one of matchingCompetences.
   * @returns {Promise<boolean>}  Whether this call rerolled.
   */
  async rerollWithCompetence(competence) {
    if ( !this.canRerollWithCompetence || !this.matchingCompetences.includes(competence) ) return false;
    if ( !await this.#reroll("ones", { "system.competencesUsed": [...this.competencesUsed, competence] }) ) return false;
    if ( game.settings.get(SYSTEM_ID, "autoApply") ) await this.parent.system.applyConviction();
    return true;
  }

  /**
   * Reroll the current faces in a mode. The card records the reroll before rolling, so a second click,
   * here or on another client, finds it recorded and does nothing. The new dice are attached as a further roll.
   * @param {string} mode
   * @param {object} [record]  Further changes recorded with the reroll, undone with it if rolling fails.
   * @returns {Promise<boolean>}  Whether this call rerolled.
   */
  async #reroll(mode, record = {}) {
    const actor = await fromUuid(this.actor);
    if ( !actor?.isOwner ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.CannotApply", { localize: true });
      return false;
    }
    const message = this.parent;
    const rerolls = [...this.rerolls];
    const before = Object.fromEntries(Object.keys(record).map(key => [key, foundry.utils.deepClone(foundry.utils.getProperty(message, key))]));
    const { count } = checkRules.reroll({ faces: this.faces, mode });
    await message.update({ "system.rerolls": [...rerolls, mode], ...record });
    let roll;
    try {
      roll = await new Roll(`${count}d6`).evaluate();
    } catch (err) {
      await message.update({ "system.rerolls": rerolls, ...before });
      throw err;
    }
    // Dice So Nice animates rolls added to a message by itself; an edit may have switched that off (#24)
    await message.update({ rolls: [...message.rolls, roll], "flags.dice-so-nice.skip": false });
    return true;
  }

  /**
   * Whether the current user may edit the faces of this check: the GM, unless a reroll is under way.
   * @type {boolean}
   */
  get canEdit() {
    return game.user.isGM && !this.rerolling;
  }

  /**
   * Replace the current faces with corrected ones (#24). The edit is stored as a further step with its own
   * roll, which is not animated. The conviction change the edit causes is applied right away if the card's
   * change was applied before, or if there was none yet and consequences are applied automatically.
   * A change that was still open stays open with its new value.
   * @param {number[]} faces  One face (1 to 6) per current die, in any order.
   * @returns {Promise<boolean>}  Whether the faces were changed by this call.
   */
  async editFaces(faces) {
    if ( !this.canEdit ) return false;
    const current = this.faces;
    if ( !Array.isArray(faces) || (faces.length !== current.length) ) {
      throw new Error(`Expected ${current.length} faces, got ${faces?.length}`);
    }
    for ( const face of faces ) {
      if ( !Number.isInteger(face) || (face < 1) || (face > 6) ) throw new RangeError(`Invalid face ${face}`);
    }
    // The order of the dice does not matter for a check
    const sorted = list => [...list].sort((a, b) => a - b).join();
    if ( sorted(faces) === sorted(current) ) return false;

    const message = this.parent;
    const openBefore = this.convictionOpen;
    const appliedBefore = this.conviction.change !== 0;
    const roll = await rollWithFaces(faces);
    // Dice So Nice would animate the added roll; the skip flag stops it, the next reroll switches it off again
    await message.update({
      "system.rerolls": [...this.rerolls, "edit"], rolls: [...message.rolls, roll], "flags.dice-so-nice.skip": true
    });

    // An open change stays open; an applied one follows the edit; without any change so far,
    // the setting decides as for a new check
    const difference = message.system.convictionOpen;
    if ( (openBefore !== 0) || !difference ) return true;
    if ( !appliedBefore && !game.settings.get(SYSTEM_ID, "autoApply") ) return true;
    const actor = await fromUuid(this.actor);
    if ( !actor ) {
      ui.notifications.warn("KRISTALLPUNK.Check.Warning.ActorMissing", { localize: true });
      return true;
    }
    const { change } = message.system.conviction;
    await message.update({ "system.conviction.change": change + difference });
    try {
      const actual = await shiftConviction(actor, difference);
      if ( actual !== difference ) await message.update({ "system.conviction.change": change + actual });
    } catch (err) {
      await message.update({ "system.conviction.change": change });
      throw err;
    }
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
      edit: this.canEdit,
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
      // A reroll of ones names its competence, once the card knows it (#46)
      label: game.i18n.format(`KRISTALLPUNK.Check.Reroll.Step.${step.competence ? "onesWith" : (step.mode ?? "first")}`, {
        count: step.faces.length - step.kept, competence: step.competence
      }),
      dice: step.faces.map((face, index) => ({
        face, kept: index < step.kept, icon: `fa-regular fa-dice-${FACE_ICONS[face - 1]}`
      }))
    })) : null;
    return {
      option: mode ? { mode, hint: `KRISTALLPUNK.Check.Reroll.Mode.${mode}` } : null,
      // One button per competence, so it is clear which one the reroll rests on (#46)
      competences: this.canRerollWithCompetence ? this.matchingCompetences : [],
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
      label: "KRISTALLPUNK.Check.Context.Edit",
      icon: "fa-solid fa-pen",
      visible: li => {
        const entry = message(li);
        return (entry?.type === "check") && entry.isContentVisible && entry.system.canEdit && !editing.has(entry.id);
      },
      onClick: (event, li) => startEdit(message(li))
    });
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
    // One button per matching competence; a click disables them all, since only one may be used (#46)
    const competenceButtons = content.querySelectorAll("[data-action=rerollWithCompetence]");
    for ( const button of competenceButtons ) {
      button.addEventListener("click", () => {
        for ( const other of competenceButtons ) other.disabled = true;
        message.system.rerollWithCompetence(button.dataset.competence);
      });
    }
    const card = content.querySelector(".check-card");
    if ( card?.querySelector(".check-edit") ) bindEdit(card, message);
  }
}

/* -------------------------------------------- */
/*  Editing the faces (#24)                     */
/* -------------------------------------------- */

/**
 * Checks being edited on this client, by message id. Kept outside the card, so the edit survives
 * a re-render of the message. `faces` are the edited faces in display order, `original` the faces the edit
 * started from; `saving` is set once the GM accepted.
 * @type {Map<string, {faces: number[], original: string, saving: boolean}>}
 */
const editing = new Map();

/**
 * The current faces of a check in display order, as a comparable string.
 * @param {ChatMessage} message
 * @returns {string}
 */
function displayedFaces(message) {
  const { faces, result } = message.system;
  return orderDice(faces, result.criticalFailure).map(die => die.face).join();
}

/**
 * All rendered cards of a message (chat log, popouts, notifications).
 * @param {ChatMessage} message
 * @returns {HTMLElement[]}
 */
function cardsOf(message) {
  return [...document.querySelectorAll(`[data-message-id="${message.id}"] .kristallpunk.check-card`)];
}

/**
 * Start editing the faces of a check: the dice turn into inputs, accept and cancel slide in.
 * @param {ChatMessage} message
 */
function startEdit(message) {
  if ( !message?.system.canEdit || editing.has(message.id) ) return;
  const original = displayedFaces(message);
  editing.set(message.id, { faces: original.split(",").map(Number), original, saving: false });
  const cards = cardsOf(message);
  for ( const card of cards ) showEdit(card, message);
  const input = cards.find(card => card.offsetParent)?.querySelector(".check-dice.current input");
  input?.focus();
}

/**
 * Put a card into edit mode as stored for its message. Adding the classes to a card already on screen
 * animates; a card rendered with them shows the edit at once.
 * @param {HTMLElement} card
 * @param {ChatMessage} message
 */
function showEdit(card, message) {
  const state = editing.get(message.id);
  if ( !state ) return;
  card.querySelectorAll(".check-dice.current input").forEach((input, index) => input.value = state.faces[index]);
  card.querySelectorAll("[data-action=acceptEdit], [data-action=cancelEdit]").forEach(button => {
    button.disabled = state.saving;
  });
  card.classList.add("edit-open");
  card.classList.toggle("editing", !state.saving);
}

/**
 * Leave edit mode: the dice show again and the buttons slide out.
 * @param {ChatMessage} message
 */
function closeEdit(message) {
  editing.delete(message.id);
  for ( const card of cardsOf(message) ) card.classList.remove("editing", "edit-open");
}

/**
 * Accept the edited faces: save them, then close. While saving, the buttons stay open,
 * so the card does not jump when it is rendered anew.
 * @param {ChatMessage} message
 */
async function acceptEdit(message) {
  const state = editing.get(message.id);
  if ( !state || state.saving ) return;
  state.saving = true;
  for ( const card of cardsOf(message) ) showEdit(card, message);
  try {
    await message.system.editFaces(state.faces);
  } finally {
    // Close once the new card is on screen, so it slides shut instead of jumping
    requestAnimationFrame(() => requestAnimationFrame(() => closeEdit(message)));
  }
}

/**
 * Wire up the edit controls of a freshly rendered card and restore an edit in progress.
 * @param {HTMLElement} card
 * @param {ChatMessage} message
 */
function bindEdit(card, message) {
  const inputs = [...card.querySelectorAll(".check-dice.current input")];
  const state = () => editing.get(message.id);
  const valid = value => /^[1-6]$/.test(value);

  inputs.forEach((input, index) => {
    const select = () => input.select();
    input.addEventListener("focus", select);
    input.addEventListener("click", select);
    input.addEventListener("input", () => {
      if ( !state() || !valid(input.value) ) return;
      state().faces[index] = Number(input.value);
      const next = inputs[index + 1];
      if ( next ) next.focus();
    });
    // Invalid input falls back to the last valid face once the GM leaves the field
    input.addEventListener("change", () => {
      if ( state() && !valid(input.value) ) input.value = state().faces[index];
    });
    input.addEventListener("blur", () => {
      if ( state() && !valid(input.value) ) input.value = state().faces[index];
    });
    input.addEventListener("keydown", event => {
      if ( event.key === "Enter" ) {
        event.preventDefault();
        input.dispatchEvent(new Event("change"));
        acceptEdit(message);
      } else if ( event.key === "Escape" ) {
        event.preventDefault();
        event.stopPropagation();
        closeEdit(message);
      }
    });
  });
  card.querySelector("[data-action=acceptEdit]").addEventListener("click", () => acceptEdit(message));
  card.querySelector("[data-action=cancelEdit]").addEventListener("click", () => closeEdit(message));

  // An edit in progress survives re-rendering, unless the dice changed meanwhile, e.g. by a reroll
  const current = state();
  if ( !current ) return;
  if ( !current.saving && (current.original !== displayedFaces(message)) ) editing.delete(message.id);
  else showEdit(card, message);
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
export function orderDice(faces, criticalFailure) {
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
