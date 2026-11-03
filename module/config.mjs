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
   * Value limits.
   * Attributes are capped at `max`; with the creation exception set they may reach `exceptionMax`
   * (Kurzregeln 1.0, p. 23). Which cases qualify for the exception is still open (issue #17).
   */
  limits: {
    attribute: { min: 0, max: 6, exceptionMax: 7 }
  }
};
