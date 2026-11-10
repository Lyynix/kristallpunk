const { HTMLField, SchemaField, StringField } = foundry.data.fields;

/**
 * Levels of automation an item can declare (#45): whether the system carries out its rules entirely,
 * partly or not at all. Set by hand by whoever maintains the item; the system cannot tell on its own.
 */
export const AUTOMATION_LEVELS = ["full", "partial", "none"];

/**
 * Base of the data models of all item types (#45): a description, and how far the item's rules are automated.
 * Item types without rules of their own (e.g. plain equipment) set `hasRules` to false; their automation
 * level stays empty, and no automation is shown for them.
 */
export default class ItemDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["KRISTALLPUNK.Item"];

  /**
   * Whether items of this type have rules of their own, whose automation is worth showing.
   * @type {boolean}
   */
  static hasRules = true;

  static defineSchema() {
    return {
      description: new HTMLField(),
      automation: new SchemaField({
        // New items with rules count as not automated until someone says otherwise
        level: new StringField({
          required: true, nullable: true, blank: false,
          choices: AUTOMATION_LEVELS, initial: this.hasRules ? "none" : null
        }),
        // What is not automated, as a reminder at the table
        note: new StringField({ required: true, blank: true })
      })
    };
  }

  /**
   * How far this item is automated, for display: level, icon and tooltip text.
   * @returns {{level: string, icon: string, label: string}|null}  Null for items without rules.
   */
  get automationInfo() {
    const { level, note } = this.automation;
    if ( !this.constructor.hasRules || !level ) return null;
    const label = game.i18n.localize(`KRISTALLPUNK.Item.Automation.Level.${level}`);
    return {
      level,
      icon: { full: "fa-gears", partial: "fa-gear", none: "fa-hand" }[level],
      // Tooltips render HTML, and the note is entered by users
      label: note && (level !== "full") ? `${label}: ${foundry.utils.escapeHTML(note)}` : label
    };
  }
}
