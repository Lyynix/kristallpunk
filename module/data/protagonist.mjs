import * as rules from "../rules/derived.mjs";

const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Data model of the "protagonist" actor type (Protagonist*in).
 * Stores only input values; everything computable is derived in prepareDerivedData.
 */
export default class ProtagonistData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["KRISTALLPUNK.Protagonist"];

  static defineSchema() {
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits;

    // Stored modifier that is added to a derived value (manual adjustment, also a target for active effects)
    const mod = () => new NumberField({ required: true, nullable: false, integer: true, initial: 0 });

    const attributes = {};
    for ( const key of Object.keys(CONFIG.KRISTALLPUNK.attributes) ) {
      attributes[key] = new SchemaField({
        value: new NumberField({
          required: true, nullable: false, integer: true,
          min: limits.attribute.min, max: limits.attribute.exceptionMax, initial: 1
        }),
        exception: new BooleanField()
      });
    }

    const skills = {};
    for ( const key of Object.keys(CONFIG.KRISTALLPUNK.skills) ) {
      skills[key] = new SchemaField({
        value: new NumberField({
          required: true, nullable: false, integer: true,
          min: limits.skill.min, max: limits.skill.max, initial: 0
        }),
        mod: mod()
      });
    }

    // Current stamina per domain; the maximum is derived. No upper bound in the schema:
    // if an attribute drops, the current value is kept instead of being cut silently.
    const stamina = {};
    const wounds = {};
    for ( const key of Object.keys(CONFIG.KRISTALLPUNK.domains) ) {
      stamina[key] = new SchemaField({
        value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        maxMod: mod()
      });
      // Leibwunden (body) and Nervenschocks (mind)
      wounds[key] = new NumberField({
        required: true, nullable: false, integer: true,
        min: limits.wounds.min, max: limits.wounds.max, initial: 0
      });
    }

    const derived = {};
    for ( const key of Object.keys(CONFIG.KRISTALLPUNK.derived) ) {
      derived[key] = new SchemaField({ mod: mod() });
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

      attributes: new SchemaField(attributes),
      skills: new SchemaField(skills),
      stamina: new SchemaField(stamina),
      wounds: new SchemaField(wounds),
      // Innenleben: negative values are doubt, positive values confidence
      conviction: new NumberField({
        required: true, nullable: false, integer: true,
        min: limits.conviction.min, max: limits.conviction.max, initial: 0
      }),
      derived: new SchemaField(derived)
    };
  }

  /**
   * Compute derived values (total skill values, maximum stamina, Mut … Seelenhalt)
   * from the stored input values.
   * @override
   */
  prepareDerivedData() {
    for ( const [key, skill] of Object.entries(this.skills) ) {
      const { attribute } = CONFIG.KRISTALLPUNK.skills[key];
      skill.total = rules.skillTotal({
        value: skill.value,
        attribute: this.attributes[attribute].value,
        mod: skill.mod
      });
    }

    for ( const [domain, stamina] of Object.entries(this.stamina) ) {
      stamina.max = this.#staminaMax(domain);
    }

    // Needs the stamina maxima from above
    const a = Object.fromEntries(Object.entries(this.attributes).map(([key, { value }]) => [key, value]));
    const d = this.derived;
    d.courage.value = rules.courage({ strength: a.strength, will: a.will, mod: d.courage.mod });
    d.crystalEcho.value = rules.crystalEcho({ senses: a.senses, empathy: a.empathy, mod: d.crystalEcho.mod });
    d.insight.value = rules.insight({ dexterity: a.dexterity, intelligence: a.intelligence, mod: d.insight.mod });
    d.toughness.value = rules.toughness({ staminaMax: this.stamina.body.max, mod: d.toughness.mod });
    d.resilience.value = rules.resilience({ staminaMax: this.stamina.mind.max, mod: d.resilience.mod });
  }

  /**
   * New protagonists start with full stamina, unless a value was given explicitly.
   * @override
   */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const changes = {};
    for ( const domain of Object.keys(this.stamina) ) {
      if ( data.system?.stamina?.[domain]?.value === undefined ) {
        changes[`system.stamina.${domain}.value`] = Math.max(0, this.#staminaMax(domain));
      }
    }
    this.parent.updateSource(changes);
  }

  /**
   * Maximum stamina of a domain, based on the current attributes and modifier.
   * @param {string} domain
   * @returns {number}
   */
  #staminaMax(domain) {
    const attributes = Object.entries(this.attributes)
      .filter(([key]) => CONFIG.KRISTALLPUNK.attributes[key].domain === domain)
      .map(([, attribute]) => attribute.value);
    return rules.staminaMax({ attributes, mod: this.stamina[domain].maxMod });
  }

  /**
   * Attributes above the regular maximum require the creation exception.
   * @override
   */
  static validateJoint(data) {
    const { max } = CONFIG.KRISTALLPUNK.protagonist.limits.attribute;
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
