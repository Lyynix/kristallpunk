import { TIE_ORDER } from "../rules/combat.mjs";

const { NumberField } = foundry.data.fields;

/**
 * Data model of combatants. This is used to break ties between combatants with the same initiative value.
 * (Kurzregeln 1.0, p. 14, #61)
 */
export default class KristallpunkCombatantData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Combatant"];

  static defineSchema() {
    const randomTieOrderUpper = TIE_ORDER.center + (TIE_ORDER.max - TIE_ORDER.min) * 0.25;
    const randomTieOrderLower = TIE_ORDER.center - (TIE_ORDER.max - TIE_ORDER.min) * 0.25;
    const randomTieOrderFunction = () => Math.random() * (randomTieOrderUpper - randomTieOrderLower) + randomTieOrderLower;

    return {
      tieOrder: new NumberField({
        required: true,
        nullable: false,
        initial: randomTieOrderFunction,
        min: TIE_ORDER.min,
        max: TIE_ORDER.max
      })
    };
  }
}
