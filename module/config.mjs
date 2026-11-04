/**
 * System constants, exposed as CONFIG.KRISTALLPUNK.
 * Other modules may adjust these during their own init hook.
 *
 * Top level: game vocabulary that applies to every figure and the whole system.
 * Per actor type (e.g. `protagonist`): rules that only apply to that type.
 */
export const KRISTALLPUNK = {
  /* -------------------------------------------- */
  /*  Game vocabulary                             */
  /* -------------------------------------------- */

  /**
   * The two domains, body and mind. They split attributes, skills, stamina and wounds alike.
   */
  domains: {
    body: { label: "KRISTALLPUNK.Domain.Body" },
    mind: { label: "KRISTALLPUNK.Domain.Mind" }
  },

  /** The six attributes, each belonging to a domain. */
  attributes: {
    strength: { domain: "body", label: "KRISTALLPUNK.Attribute.Strength", abbreviation: "KRISTALLPUNK.Attribute.StrengthAbbr" },
    dexterity: { domain: "body", label: "KRISTALLPUNK.Attribute.Dexterity", abbreviation: "KRISTALLPUNK.Attribute.DexterityAbbr" },
    senses: { domain: "body", label: "KRISTALLPUNK.Attribute.Senses", abbreviation: "KRISTALLPUNK.Attribute.SensesAbbr" },
    will: { domain: "mind", label: "KRISTALLPUNK.Attribute.Will", abbreviation: "KRISTALLPUNK.Attribute.WillAbbr" },
    intelligence: { domain: "mind", label: "KRISTALLPUNK.Attribute.Intelligence", abbreviation: "KRISTALLPUNK.Attribute.IntelligenceAbbr" },
    empathy: { domain: "mind", label: "KRISTALLPUNK.Attribute.Empathy", abbreviation: "KRISTALLPUNK.Attribute.EmpathyAbbr" }
  },

  /**
   * The sixteen skills, each linked to the attribute that is added to its value.
   * The domain (body or mind) follows from the attribute.
   */
  skills: {
    athletics: { attribute: "strength", label: "KRISTALLPUNK.Skill.Athletics" },
    awareness: { attribute: "senses", label: "KRISTALLPUNK.Skill.Awareness" },
    dodge: { attribute: "senses", label: "KRISTALLPUNK.Skill.Dodge" },
    rangedCombat: { attribute: "dexterity", label: "KRISTALLPUNK.Skill.RangedCombat" },
    craft: { attribute: "dexterity", label: "KRISTALLPUNK.Skill.Craft" },
    stealth: { attribute: "dexterity", label: "KRISTALLPUNK.Skill.Stealth" },
    meleeCombat: { attribute: "strength", label: "KRISTALLPUNK.Skill.MeleeCombat" },
    orientation: { attribute: "senses", label: "KRISTALLPUNK.Skill.Orientation" },
    authority: { attribute: "will", label: "KRISTALLPUNK.Skill.Authority" },
    education: { attribute: "intelligence", label: "KRISTALLPUNK.Skill.Education" },
    inspiration: { attribute: "empathy", label: "KRISTALLPUNK.Skill.Inspiration" },
    medicine: { attribute: "intelligence", label: "KRISTALLPUNK.Skill.Medicine" },
    prismResonance: { attribute: "will", label: "KRISTALLPUNK.Skill.PrismResonance" },
    rhetoric: { attribute: "empathy", label: "KRISTALLPUNK.Skill.Rhetoric" },
    acting: { attribute: "empathy", label: "KRISTALLPUNK.Skill.Acting" },
    science: { attribute: "intelligence", label: "KRISTALLPUNK.Skill.Science" }
  },

  /** Derived values; checks on them cost no stamina (Kurzregeln 1.0, p. 6–7). */
  derived: {
    courage: { label: "KRISTALLPUNK.Derived.Courage" },
    crystalEcho: { label: "KRISTALLPUNK.Derived.CrystalEcho" },
    insight: { label: "KRISTALLPUNK.Derived.Insight" },
    toughness: { label: "KRISTALLPUNK.Derived.Toughness" },
    resilience: { label: "KRISTALLPUNK.Derived.Resilience" }
  },

  /* -------------------------------------------- */
  /*  Rules per actor type                        */
  /* -------------------------------------------- */

  protagonist: {
    /**
     * Value limits for human figures.
     * Attributes are capped at `max`; with the creation exception set they may reach `exceptionMax`
     * (Kurzregeln 1.0, p. 23). Which cases qualify for the exception is still open (issue #17).
     * Skills are capped at 9 (Erschaffung 1.0, p. 12).
     * Up to three wounds per domain (Kurzregeln 1.0, p. 20); conviction ranges from -3 to +3 (p. 9).
     */
    limits: {
      attribute: { min: 0, max: 6, exceptionMax: 7 },
      skill: { min: 0, max: 9 },
      wounds: { min: 0, max: 3 },
      conviction: { min: -3, max: 3 }
    }
  }
};
