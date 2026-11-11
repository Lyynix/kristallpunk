import ItemDataModel from "./base.mjs";

const { BooleanField, StringField } = foundry.data.fields;

/**
 * Data model of the "competence" item type (Kompetenz, #46): a specialty within one skill. If it covers what a
 * figure does in a check, all ones of that check may be rerolled once (Kurzregeln 1.0, p. 6); many competences
 * do more than that (Erschaffung 1.0, p. 21 ff.), which their automation note tells.
 * Competences of a resonance kind follow in 0.7.0.
 */
export default class CompetenceData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.Competence"];

  /** @override */
  static DEFAULT_IMAGE = "icons/commodities/treasure/medal-ribbon-star-gold-red.webp";

  static defineSchema() {
    return {
      ...super.defineSchema(),
      // The skill the competence belongs to. Empty only for competences taken over from the former free text
      // whose skill could not be told (#46).
      skill: new StringField({
        required: true, nullable: true, blank: false, initial: null,
        choices: () => Object.fromEntries(Object.entries(CONFIG.KRISTALLPUNK.skills).map(([key, { label }]) => [key, label]))
      }),
      // What a competence that can be learned more than once applies to, e.g. the weapon of Waffenmeister
      specification: new StringField({ required: true, blank: true }),
      // Whether the competence allows rerolling the ones of a check (Kurzregeln 1.0, p. 6). Most do; a few only
      // do something else (e.g. Ladedrill), and are not suggested for the reroll then.
      rerollOnes: new BooleanField({ initial: true })
    };
  }

  /**
   * Name with its specification, e.g. "Waffenmeister (Säbel)".
   * @type {string}
   */
  get fullName() {
    const name = this.parent?.name ?? "";
    return this.specification ? `${name} (${this.specification})` : name;
  }

  /**
   * Localized name of the competence's skill, or null if it has none.
   * @type {string|null}
   */
  get skillLabel() {
    const skill = CONFIG.KRISTALLPUNK.skills[this.skill];
    return skill ? game.i18n.localize(skill.label) : null;
  }
}
