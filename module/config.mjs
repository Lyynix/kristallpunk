/**
 * System constants, exposed as CONFIG.KRISTALLPUNK.
 * Other modules may adjust these during their own init hook.
 */
export const KRISTALLPUNK = {
  /** Attribute groups: body and mind. */
  groups: {
    body: { label: "KRISTALLPUNK.Group.Body" },
    mind: { label: "KRISTALLPUNK.Group.Mind" }
  },

  /** The six attributes, each belonging to a group. */
  attributes: {
    strength: { group: "body", label: "KRISTALLPUNK.Attribute.Strength", abbreviation: "KRISTALLPUNK.Attribute.StrengthAbbr" },
    dexterity: { group: "body", label: "KRISTALLPUNK.Attribute.Dexterity", abbreviation: "KRISTALLPUNK.Attribute.DexterityAbbr" },
    senses: { group: "body", label: "KRISTALLPUNK.Attribute.Senses", abbreviation: "KRISTALLPUNK.Attribute.SensesAbbr" },
    will: { group: "mind", label: "KRISTALLPUNK.Attribute.Will", abbreviation: "KRISTALLPUNK.Attribute.WillAbbr" },
    intelligence: { group: "mind", label: "KRISTALLPUNK.Attribute.Intelligence", abbreviation: "KRISTALLPUNK.Attribute.IntelligenceAbbr" },
    empathy: { group: "mind", label: "KRISTALLPUNK.Attribute.Empathy", abbreviation: "KRISTALLPUNK.Attribute.EmpathyAbbr" }
  },

  /**
   * The sixteen skills, each linked to the attribute that is added to its value.
   * The group (body or mind) follows from the attribute.
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

  /**
   * Value limits.
   * Attributes are capped at `max`; with the creation exception set they may reach `exceptionMax`
   * (Kurzregeln 1.0, p. 23). Which cases qualify for the exception is still open (issue #17).
   * Skills are capped at 9 (Erschaffung 1.0, p. 12).
   */
  limits: {
    attribute: { min: 0, max: 6, exceptionMax: 7 },
    skill: { min: 0, max: 9 }
  }
};
