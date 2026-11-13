import ItemDataModel from "./base.mjs";
import { protectionValue } from "../../rules/derived.mjs";

const { BooleanField, NumberField, StringField } = foundry.data.fields;

/**
 * Data model of the "protection" item type (Schutzausrüstung, #49): an armor for the body or an amulet for the mind.
 * Its rating, less its wear, sets the figure's armor or ward while it is equipped (Kurzregeln 1.0, p. 7 and 20).
 * Wear is a wound an armor took or a charge an amulet spent; repairing and recharging take it back.
 * Lessening damage and wearing out are done by hand until 0.5.0.
 */
export default class ProtectionData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.Protection"];

  /** Images of new pieces by domain, instead of Foundry's default bag. */
  static DOMAIN_IMAGES = {
    body: "icons/equipment/chest/breastplate-banded-steel.webp",
    mind: "icons/equipment/neck/amulet-carved-stone-cross.webp"
  };

  /** @override */
  static DEFAULT_IMAGE = ProtectionData.DOMAIN_IMAGES.body;

  static defineSchema() {
    const schema = super.defineSchema();
    // The value is computed; damage and wear are not, yet
    schema.automation.fields.level.initial = "partial";
    const count = initial => new NumberField({ required: true, nullable: false, integer: true, min: 0, initial });
    return {
      ...schema,
      // Body: armor; mind: ward (an amulet or the like)
      domain: new StringField({
        required: true, blank: false, initial: "body",
        choices: () => Object.fromEntries(Object.entries(CONFIG.KRISTALLPUNK.domains)
          .map(([key, { protection }]) => [key, `KRISTALLPUNK.Item.Protection.Domain.${protection}`]))
      }),
      // 1–3, higher only for rare items (Kurzregeln 1.0, p. 20), so not capped
      rating: count(1),
      wear: count(0),
      equipped: new BooleanField({ initial: false })
    };
  }

  /**
   * The value the piece protects with now.
   * @override
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.value = protectionValue({ rating: this.rating, wear: this.wear });
  }

  /**
   * New pieces get the image of their domain. Added to a figure, a piece is equipped if the figure has none of its
   * domain equipped yet, unless told otherwise.
   * @override
   */
  async _preCreate(data, options, user) {
    const Item = foundry.documents.Item;
    const ownImage = data.img && (data.img !== Item.DEFAULT_ICON);
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const changes = {};
    if ( !ownImage ) changes.img = this.constructor.DOMAIN_IMAGES[this.domain] ?? this.constructor.DEFAULT_IMAGE;
    const actor = this.parent.parent;
    if ( (actor instanceof foundry.documents.Actor) && (data.system?.equipped === undefined) ) {
      changes["system.equipped"] = !actor.itemTypes.protection.some(item => item.system.equipped
        && (item.system.domain === this.domain));
    }
    this.parent.updateSource(changes);
  }

  /**
   * Warnings about this piece on its figure: more than one piece equipped for its domain, of which only the
   * highest counts. Suggestions only; nothing is blocked.
   * @param {Actor} actor
   * @returns {string[]}  Localized warnings.
   */
  conflictsOn(actor) {
    if ( !this.equipped ) return [];
    const count = actor.itemTypes.protection.filter(item => item.system.equipped && (item.system.domain === this.domain)).length;
    if ( count < 2 ) return [];
    const { protection } = CONFIG.KRISTALLPUNK.domains[this.domain];
    return [game.i18n.format("KRISTALLPUNK.Item.Protection.SeveralEquipped", {
      count, value: game.i18n.localize(`KRISTALLPUNK.${protection === "armor" ? "Armor" : "Ward"}.Label`)
    })];
  }
}
