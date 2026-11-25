import * as rules from "../rules/combat.mjs";

/**
 * KristallpunkCombat
 * Extends the base Combat document to provide custom sorting of combatants.
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

  async _onStartRound(context) {
    super._onStartRound(context);

    if (context.round === 1) return;

    const holdingCombatants = this.combatants.filter(c => c.system.hold !== null);
    if (!holdingCombatants.length) return;
    await this.updateEmbeddedDocuments(
      "Combatant",
      holdingCombatants.map(c => ({ _id: c.id, "system.hold": null })),
      { combatTurn: 0 } //TODO: skip defeated combatants
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
