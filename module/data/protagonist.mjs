import * as rules from "../rules/derived.mjs";
import { ageGroup } from "../rules/age.mjs";

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
        // Former entered value and creation exception (#47). Kept only so the file cleanup can turn the value into
        // the modifier; empty for figures that are clean, and not shown anywhere else.
        value: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        exception: new BooleanField(),
        // Manual points and target for active effects (#43); the total is derived and capped
        mod: mod()
      });
    }

    const skills = {};
    for ( const key of Object.keys(CONFIG.KRISTALLPUNK.skills) ) {
      skills[key] = new SchemaField({
        // Former entered value (#48). Kept only so the file cleanup can turn it into manual points; empty for
        // figures that are clean, and not shown anywhere else.
        value: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        // Manual points (e.g. from the age at creation) and target for active effects (#43, #48)
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

    // Armor and ward (#49): the former entered value, kept only for the file cleanup like those of attributes, and
    // the modifier; the total is derived from the equipped protection items
    const protection = () => new SchemaField({
      value: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
      mod: mod()
    });

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
      // Former free text of calling and profession, now items (#48). Kept only so the file cleanup can still read
      // it; it is emptied there and not shown anywhere else. Its label names the tags of calling and profession.
      profession: text(),
      background: new HTMLField(),
      relationships: new HTMLField(),
      equipment: new HTMLField(),

      // Former free text of innate traits, now items (#47). Kept only so the file cleanup can still read it;
      // it is emptied there and not shown anywhere else.
      innateTraits: new ArrayField(text(), { initial: ["", "", ""] }),
      // Former free text of competences, now items (#46). Kept only so the file cleanup can still read it;
      // it is emptied there and not shown anywhere else.
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
      derived: new SchemaField(derived),

      // Armor and ward come from equipped protection items (#49), plus the modifier (e.g. cover)
      armor: protection(),
      ward: protection()
    };
  }

  /**
   * Armor and ward used to be a number entered by hand (#49); it is kept as former value, so the file cleanup can
   * turn it into a protection item. A former 0 is no value, so figures without armor need no cleanup.
   * @override
   */
  static migrateData(source) {
    for ( const key of ["armor", "ward"] ) {
      if ( typeof source[key] === "number" ) source[key] = { value: source[key] || null, mod: 0 };
    }
    return super.migrateData(source);
  }

  /**
   * Compute derived values (total skill values, maximum stamina, Mut … Seelenhalt)
   * from the stored input values.
   * @override
   */
  prepareDerivedData() {
    // Totals of the attributes first: everything else is based on them (#43). They come from the modifier, that is
    // from active effects and manual points (#47), capped hard at 7 (Kurzregeln 1.0, p. 23; #17). A former entered
    // value still counts until the file cleanup has moved it into the modifier, so totals are right before and after.
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits;
    for ( const attribute of Object.values(this.attributes) ) {
      attribute.total = rules.attributeTotal({ value: attribute.value ?? 0, mod: attribute.mod, limits: limits.attribute });
    }

    for ( const [key, skill] of Object.entries(this.skills) ) {
      const { attribute } = CONFIG.KRISTALLPUNK.skills[key];
      // The skill's own points come from the modifier: active effects and manual points (#48); a former entered
      // value still counts until the file cleanup has moved it
      skill.total = rules.skillTotal({
        value: skill.value ?? 0,
        attribute: this.attributes[attribute].total,
        mod: skill.mod,
        limits: limits.skill
      });
    }

    for ( const [domain, stamina] of Object.entries(this.stamina) ) {
      stamina.max = this.#staminaMax(domain);
    }

    // Needs the stamina maxima from above
    const a = Object.fromEntries(Object.entries(this.attributes).map(([key, { total }]) => [key, total]));
    const d = this.derived;
    d.courage.value = rules.courage({ strength: a.strength, will: a.will, mod: d.courage.mod });
    d.crystalEcho.value = rules.crystalEcho({ senses: a.senses, empathy: a.empathy, mod: d.crystalEcho.mod });
    d.insight.value = rules.insight({ dexterity: a.dexterity, intelligence: a.intelligence, mod: d.insight.mod });
    d.toughness.value = rules.toughness({ staminaMax: this.stamina.body.max, mod: d.toughness.mod });
    d.resilience.value = rules.resilience({ staminaMax: this.stamina.mind.max, mod: d.resilience.mod });

    // Armor and ward: the highest of the equipped pieces of the domain (#49). A former entered value still counts
    // as a piece until the file cleanup has turned it into one.
    for ( const [domain, { protection }] of Object.entries(CONFIG.KRISTALLPUNK.domains) ) {
      const value = this[protection];
      const pieces = this.parent.itemTypes.protection
        .filter(item => item.system.equipped && (item.system.domain === domain));
      value.pieces = pieces;
      value.total = rules.protection({
        values: [...pieces.map(item => item.system.value), ...(value.value ? [value.value] : [])],
        mod: value.mod
      });
    }

    this.ageGroup = ageGroup(this.age);
  }

  /**
   * New protagonists start with full stamina and a player-character token,
   * unless values were given explicitly.
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

    // Linked to the actor, friendly, bars visible to the owners
    const tokenDefaults = {
      actorLink: true,
      disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER
    };
    for ( const [key, value] of Object.entries(tokenDefaults) ) {
      if ( data.prototypeToken?.[key] === undefined ) changes[`prototypeToken.${key}`] = value;
    }

    this.parent.updateSource(changes);
  }

  /**
   * Maximum stamina of a domain, based on the totals of its attributes and the modifier.
   * Computes the totals itself, since _preCreate needs it before prepareDerivedData has run.
   * @param {string} domain
   * @returns {number}
   */
  #staminaMax(domain) {
    const limits = CONFIG.KRISTALLPUNK.protagonist.limits.attribute;
    const attributes = Object.entries(this.attributes)
      .filter(([key]) => CONFIG.KRISTALLPUNK.attributes[key].domain === domain)
      .map(([, attribute]) => rules.attributeTotal({ value: attribute.value ?? 0, mod: attribute.mod, limits }));
    return rules.staminaMax({ attributes, mod: this.stamina[domain].maxMod });
  }
}
