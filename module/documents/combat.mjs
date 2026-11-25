import * as rules from "../rules/combat.mjs";

/**
 * KristallpunkCombat
 * Extends the base Combat document to provide custom sorting of combatants and handling of new rounds.
 * (Kurzregeln 1.0, p. 14; #61)
 */
export default class KristallpunkCombat extends foundry.documents.Combat {

  /** @override */
  _sortCombatants(a, b) {
    const orderA = rules.sortOrder(KristallpunkCombat._getCombatantValues(a));
    const orderB = rules.sortOrder(KristallpunkCombat._getCombatantValues(b));

    if (orderA === orderB) return super._sortCombatants(a, b);
    return orderB - orderA;
  }

  /**
   * Removes holds after a new round has started. Only executed for the active GM. (KR p. 14, #61)
   * @override
   */
  async _onStartRound(context) {
    await super._onStartRound(context);

    // No hold-reset in the first round to allow holding before the conflict starts 
    if (context.round === 1) return;

    const holdingCombatants = this.combatants.filter(c => c.system.hold !== null);
    if (!holdingCombatants.length) return;
    const updates = holdingCombatants.map(c => ({ _id: c.id, "system.hold": null }));

    let combatTurn = 0;
    if (this.settings.skipDefeated) {
      const combatClone = this.clone();
      combatClone.updateSource({ combatants: updates });
      combatClone.setupTurns();
      combatTurn = Math.max(combatClone.turns.findIndex(t => !t.isDefeated), 0);
    }

    // TODO: Foundry dispatches the start of turn for the first combatant of the old order after this,
    // so it receives a spurious end and start of turn. Matters once effects or conditions hook into turn events.
    await this.updateEmbeddedDocuments(
      "Combatant",
      updates,
      { combatTurn }
    );
  }

  static _getCombatantValues(combatant) {
    return {
      initiative: combatant.initiative,
      isProtagonist: combatant.actor?.type === "protagonist",
      tieOrder: combatant.system.tieOrder,
      hold: combatant.system.hold
    };
  }
}
