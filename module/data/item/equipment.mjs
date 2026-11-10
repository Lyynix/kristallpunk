import ItemDataModel from "./base.mjs";

const { NumberField } = foundry.data.fields;

/**
 * Data model of the "equipment" item type (Ausrüstung, #45): anything a figure carries, without rules
 * of its own. Armor, amulets and weapons get their own types (#49, #50).
 */
export default class EquipmentData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.Equipment"];

  /** @override */
  static hasRules = false;

  static defineSchema() {
    return {
      ...super.defineSchema(),
      quantity: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 })
    };
  }
}
