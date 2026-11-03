const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Data model of the "protagonist" actor type (Protagonist*in).
 * Stores only input values; everything computable is derived in prepareDerivedData.
 */
export default class ProtagonistData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["KRISTALLPUNK.Protagonist"];

  static defineSchema() {
    const { attribute: limits } = CONFIG.KRISTALLPUNK.limits;

    const attributes = {};
    for ( const key of Object.keys(CONFIG.KRISTALLPUNK.attributes) ) {
      attributes[key] = new SchemaField({
        value: new NumberField({
          required: true, nullable: false, integer: true,
          min: limits.min, max: limits.exceptionMax, initial: 1
        }),
        exception: new BooleanField()
      });
    }

    // Plain text fields default to "" instead of being absent
    const text = () => new StringField({ required: true, blank: true });

    return {
      // Profile (Steckbrief)
      age: new NumberField({ nullable: true, integer: true, min: 0, initial: null }),
      origin: text(),
      profession: text(),
      background: new HTMLField(),
      relationships: new HTMLField(),
      equipment: new HTMLField(),

      // Free text until the matching item types exist
      innateTraits: new ArrayField(text(), { initial: ["", "", ""] }),
      competences: text(),
      resonanceMagic: text(),
      resonanceCompetences: text(),

      attributes: new SchemaField(attributes)
    };
  }

  /**
   * Attributes above the regular maximum require the creation exception.
   * @override
   */
  static validateJoint(data) {
    const { max } = CONFIG.KRISTALLPUNK.limits.attribute;
    for ( const [key, attribute] of Object.entries(data.attributes ?? {}) ) {
      if ( (attribute.value > max) && !attribute.exception ) {
        throw new Error(game.i18n.format("KRISTALLPUNK.Validation.AttributeAboveMax", {
          attribute: game.i18n.localize(CONFIG.KRISTALLPUNK.attributes[key].label),
          max
        }));
      }
    }
  }
}
