import ItemDataModel from "./base.mjs";

/**
 * Data model of the "calling" item type (Metier, #48). A figure has one; it gives one attribute point and the base of
 * the skills (Erschaffung 1.0, p. 12–13), as active effects. Its professions refine it (see the profession type).
 */
export default class CallingData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.Calling"];

  /** @override */
  static DEFAULT_IMAGE = "icons/environment/people/group.webp";

  /**
   * Warnings about this calling on its figure: a figure has one calling. Suggestions only; nothing is blocked.
   * @param {Actor} actor
   * @param {Item[]} [callings]  The figure's callings, defaults to its current ones.
   * @returns {string[]}  Localized warnings.
   */
  conflictsOn(actor, callings = actor.itemTypes.calling) {
    if ( callings.length < 2 ) return [];
    return [game.i18n.format("KRISTALLPUNK.Item.Calling.TooMany", { count: callings.length })];
  }

  /**
   * Adding a calling to a figure that has one already warns.
   * @override
   */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const actor = this.parent.parent;
    if ( !(actor instanceof foundry.documents.Actor) || (user.id !== game.user.id) ) return;
    for ( const warning of this.conflictsOn(actor, [...actor.itemTypes.calling, this.parent]) ) ui.notifications.warn(warning);
  }
}
