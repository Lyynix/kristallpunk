import ItemDataModel from "./base.mjs";

const { BooleanField, NumberField, StringField } = foundry.data.fields;

/**
 * Data model of the "weapon" item type (Waffe, #50), lean for now: the skill it is used with and the values the
 * rules name for weapons (Kurzregeln 1.0, p. 16–19):
 * - base damage, the least damage a hit does; every 6 of the check adds 1 (p. 19). Unarmed is 1.
 * - the domain it damages: the body, the mind only for special weapons or ammunition (p. 14 and 17);
 * - an attack bonus for the attacker (p. 17), and for melee weapons a defense value for parrying (p. 16).
 * The values are not used by the system until 0.5.0 (Konflikt-Ereignisse); range, reloading and the kind of weapon
 * follow with a compendium or then.
 */
export default class WeaponData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.Weapon"];

  /** The skills a weapon is used with. */
  static SKILLS = ["meleeCombat", "rangedCombat"];

  /** Images of new weapons by skill, instead of Foundry's default bag. */
  static SKILL_IMAGES = {
    meleeCombat: "icons/weapons/swords/scimitar-guard-brown.webp",
    rangedCombat: "icons/weapons/guns/gun-pistol-flintlock.webp"
  };

  /** @override */
  static DEFAULT_IMAGE = WeaponData.SKILL_IMAGES.meleeCombat;

  static defineSchema() {
    const number = (initial, min) => new NumberField({ required: true, nullable: false, integer: true, min, initial });
    return {
      ...super.defineSchema(),
      skill: new StringField({
        required: true, blank: false, initial: "meleeCombat",
        choices: () => Object.fromEntries(WeaponData.SKILLS.map(key => [key, CONFIG.KRISTALLPUNK.skills[key].label]))
      }),
      damage: number(1, 0),
      damageDomain: new StringField({
        required: true, blank: false, initial: "body",
        choices: () => Object.fromEntries(Object.entries(CONFIG.KRISTALLPUNK.domains).map(([key, { label }]) => [key, label]))
      }),
      // Bonus dice when attacking with it; a weapon may also hinder
      attackBonus: number(0),
      // Only melee weapons parry
      defense: number(0, 0),
      // Several weapons can be at hand, so nothing excludes another
      equipped: new BooleanField({ initial: true })
    };
  }

  /**
   * Whether the weapon is used in melee, so its defense value counts.
   * @type {boolean}
   */
  get isMelee() {
    return this.skill === "meleeCombat";
  }

  /**
   * New weapons without an image of their own get the image of their skill.
   * @override
   */
  async _preCreate(data, options, user) {
    const Item = foundry.documents.Item;
    const ownImage = data.img && (data.img !== Item.DEFAULT_ICON);
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    if ( !ownImage ) this.parent.updateSource({ img: this.constructor.SKILL_IMAGES[this.skill] ?? this.constructor.DEFAULT_IMAGE });
  }
}
