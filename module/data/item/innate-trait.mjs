import ItemDataModel from "./base.mjs";

const { SetField, StringField } = foundry.data.fields;

/**
 * Data model of the "innateTrait" item type (angeborene Eigenschaft, #47). A figure has three of them; each gives
 * points for the attributes and a skill or something special (Erschaffung 1.0, p. 8–11), as active effects.
 * Many exclude another trait, e.g. nobody can be lazy and ambitious at once.
 */
export default class InnateTraitData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.InnateTrait"];

  /** @override */
  static DEFAULT_IMAGE = "icons/environment/people/commoner.webp";

  /** How many innate traits a figure has (Erschaffung 1.0, p. 8). */
  static PER_FIGURE = 3;

  static defineSchema() {
    return {
      ...super.defineSchema(),
      // Names of the traits this one excludes; the exclusion holds both ways
      excludes: new SetField(new StringField({ required: true, blank: false }))
    };
  }

  /**
   * Whether this trait and another exclude each other, by name, in either direction.
   * @param {Item} other  Another innate trait.
   * @returns {boolean}
   */
  excludesTrait(other) {
    const name = value => value.trim().toLowerCase();
    const names = set => new Set([...set].map(name));
    return names(this.excludes).has(name(other.name)) || names(other.system.excludes).has(name(this.parent.name));
  }

  /**
   * Problems with this trait on its figure: traits it excludes, and more traits than a figure has.
   * Suggestions only; nothing is blocked (#47).
   * @param {Actor} actor
   * @param {Item[]} [traits]  The figure's traits, defaults to its current ones.
   * @returns {string[]}  Localized warnings.
   */
  conflictsOn(actor, traits = actor.itemTypes.innateTrait) {
    const others = traits.filter(trait => trait !== this.parent);
    const warnings = others.filter(other => this.excludesTrait(other)).map(other => game.i18n.format(
      "KRISTALLPUNK.Item.InnateTrait.Excluded", { name: this.parent.name, other: other.name }
    ));
    if ( traits.length > this.constructor.PER_FIGURE ) warnings.push(game.i18n.format(
      "KRISTALLPUNK.Item.InnateTrait.TooMany", { count: traits.length, max: this.constructor.PER_FIGURE }
    ));
    return warnings;
  }

  /**
   * Adding a trait to a figure warns about traits it excludes and about more traits than a figure has.
   * @override
   */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const actor = this.parent.parent;
    if ( !(actor instanceof foundry.documents.Actor) || (user.id !== game.user.id) ) return;
    for ( const warning of this.conflictsOn(actor, [...actor.itemTypes.innateTrait, this.parent]) ) {
      ui.notifications.warn(warning);
    }
  }
}
