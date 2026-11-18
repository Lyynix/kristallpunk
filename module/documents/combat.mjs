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

  static _getCombatantValues(combatant) {
    return {
      initiative: combatant.initiative,
      isProtagonist: combatant.actor?.type === "protagonist"
    }
  }
}
