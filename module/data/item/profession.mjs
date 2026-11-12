import ItemDataModel from "./base.mjs";

const { ArrayField, DocumentUUIDField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Data model of the "profession" item type (Profession, #48). A figure has one; it belongs to a calling (Metier), gives
 * three skill points as active effects, and brings three competences, some of them to choose from
 * (Erschaffung 1.0, p. 13–21). Calling and competences are linked by UUID to items, usually in the compendiums.
 * Resonance kind and resonance competence stay text until 0.7.0.
 */
export default class ProfessionData extends ItemDataModel {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "KRISTALLPUNK.Item.Profession"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      // The calling the profession belongs to
      calling: new DocumentUUIDField({ type: "Item", nullable: true, initial: null }),
      // Resonance kind (e.g. Ars Goëtia) and its competence (e.g. Evokation), as text until 0.7.0
      resonanceKind: new StringField({ required: true, blank: true }),
      resonanceCompetence: new StringField({ required: true, blank: true }),
      // Places for competences. Several competences in a place are alternatives; several specifications are
      // alternatives for each of them (e.g. Erlerntes Handwerk as Schlosser, Schmied or Uhrmacher); a single
      // specification is simply taken over.
      competenceSlots: new ArrayField(new SchemaField({
        options: new SetField(new DocumentUUIDField({ type: "Item" })),
        specifications: new SetField(new StringField({ required: true, blank: false }))
      }))
    };
  }

  /**
   * Warnings about this profession on its figure: a figure has one profession. Suggestions only.
   * @param {Actor} actor
   * @param {Item[]} [professions]  The figure's professions, defaults to its current ones.
   * @returns {string[]}  Localized warnings.
   */
  conflictsOn(actor, professions = actor.itemTypes.profession) {
    if ( professions.length < 2 ) return [];
    return [game.i18n.format("KRISTALLPUNK.Item.Profession.TooMany", { count: professions.length })];
  }
}
