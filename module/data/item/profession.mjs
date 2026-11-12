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

  /** @override */
  static DEFAULT_IMAGE = "icons/sundries/documents/document-sealed-brown-red.webp";

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

  /* -------------------------------------------- */
  /*  On a figure: bring calling and competences  */
  /* -------------------------------------------- */

  /**
   * Adding a profession to a figure that has one asks whether to replace it; declining adds nothing.
   * @override
   */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const actor = this.parent.parent;
    if ( !(actor instanceof foundry.documents.Actor) || (user.id !== game.user.id) ) return;
    const current = actor.itemTypes.profession;
    if ( !current.length || options.kristallpunk?.replace ) return;
    const replace = await foundry.applications.api.DialogV2.confirm({
      window: { title: "KRISTALLPUNK.Item.Profession.ReplaceTitle", icon: "fa-solid fa-right-left" },
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format("KRISTALLPUNK.Item.Profession.ReplaceHint", {
        old: current.map(item => item.name).join(", "), name: this.parent.name
      }))}</p>`,
      rejectClose: false
    });
    if ( !replace ) return false;
  }

  /**
   * On the client that added it to a figure: remove the former profession with what it brought, then bring calling,
   * competences and resonance text (#48). Bringing them along is no automation and has no setting.
   * @override
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    const actor = this.parent.parent;
    if ( (userId !== game.user.id) || !(actor instanceof foundry.documents.Actor) ) return;
    // The file cleanup brings calling and competences along itself
    if ( options.kristallpunk?.bringAlong === false ) return;
    this.#bringAlong(actor, options.kristallpunk ?? {}).catch(error => {
      console.error("Kristallpunk | Bringing along what a profession brings failed", error);
    });
  }

  /**
   * Removing a profession from a figure removes what it brought along, on the client that removed it.
   * @override
   */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    const actor = this.parent.parent;
    if ( (userId !== game.user.id) || !(actor instanceof foundry.documents.Actor) ) return;
    if ( options.kristallpunk?.broughtAlong ) return;
    const brought = broughtBy(actor, [this.parent.id]);
    if ( brought.length ) actor.deleteEmbeddedDocuments("Item", brought.map(item => item.id));
  }

  /**
   * Remove former professions, then add calling, competences and resonance text.
   * @param {Actor} actor
   * @param {object} preset  `competences`: chosen option ids by slot index, e.g. from the file cleanup.
   * @returns {Promise<void>}
   */
  async #bringAlong(actor, { competences: preset = {} } = {}) {
    const profession = this.parent;
    // Copies of a figure keep the ids of its items: what they brought is there already
    if ( broughtBy(actor, [profession.id]).length ) return;

    // Former professions and what they brought, in one go, so the calling check below sees the figure without them
    const former = actor.itemTypes.profession.filter(item => item !== profession);
    if ( former.length ) {
      const ids = [...former, ...broughtBy(actor, former.map(item => item.id))].map(item => item.id);
      await actor.deleteEmbeddedDocuments("Item", ids, { kristallpunk: { broughtAlong: true } });
    }

    const grant = data => foundry.utils.mergeObject(data, { "flags.kristallpunk.grantedBy": profession.id });
    const missing = [];
    const toCreate = [];

    // The calling, unless the figure has one of that name already
    if ( this.calling ) {
      const calling = await fromUuid(this.calling);
      if ( !calling ) missing.push(this.calling);
      else if ( !actor.itemTypes.calling.some(item => item.name === calling.name) ) toCreate.push(grant(fromTemplate(calling)));
    }

    // The competences, asking where a place offers alternatives
    const slots = await this.#resolveSlots(missing);
    const open = slots.map((options, index) => ({ options, index }))
      .filter(({ options, index }) => (options.length > 1) && !options.some(option => option.id === preset[index]));
    let chosen = { ...preset };
    if ( open.length ) {
      const { askChoice } = await import("../../apps/effect-choice.mjs");
      const answer = await askChoice({
        item: profession,
        hint: "KRISTALLPUNK.Item.Profession.ChoiceHint",
        groups: open.map(({ options, index }) => ({
          label: game.i18n.format("KRISTALLPUNK.Item.Profession.Slot", { number: index + 1 }), options
        }))
      });
      // Cancelled: the profession stays, its places with alternatives stay empty
      if ( answer ) open.forEach(({ index }, i) => { chosen[index] = answer[i]; });
    }
    for ( const [index, options] of slots.entries() ) {
      const option = options.length === 1 ? options[0] : options.find(o => o.id === chosen[index]);
      if ( !option ) continue;
      const item = fromTemplate(option.document);
      if ( option.specification ) item.system.specification = option.specification;
      toCreate.push(grant(item));
    }

    if ( toCreate.length ) await actor.createEmbeddedDocuments("Item", toCreate);

    // Resonance as text into the figure's fields, if they are empty (until 0.7.0)
    const update = {};
    if ( this.resonanceKind && !actor.system.resonanceMagic?.trim() ) update["system.resonanceMagic"] = this.resonanceKind;
    if ( this.resonanceCompetence && !actor.system.resonanceCompetences?.trim() ) {
      update["system.resonanceCompetences"] = this.resonanceCompetence;
    }
    if ( !foundry.utils.isEmpty(update) ) await actor.update(update);

    if ( missing.length ) ui.notifications.warn(game.i18n.format("KRISTALLPUNK.Item.Profession.Missing", {
      name: profession.name, count: missing.length
    }));
  }

  /**
   * The options of each competence place: every competence with every specification, or without one.
   * Competences that no longer exist are left out and noted as missing.
   * @param {string[]} missing  Collects UUIDs that could not be found.
   * @returns {Promise<{id: string, label: string, document: Item, specification: string}[][]>}
   */
  async #resolveSlots(missing) {
    const slots = [];
    for ( const slot of this.competenceSlots ) {
      const options = [];
      const specifications = slot.specifications.size ? [...slot.specifications] : [""];
      for ( const uuid of slot.options ) {
        const document = await fromUuid(uuid);
        if ( !document ) { missing.push(uuid); continue; }
        for ( const specification of specifications ) {
          options.push({
            id: `${uuid}|${specification}`,
            label: specification ? `${document.name} (${specification})` : document.name,
            document, specification
          });
        }
      }
      slots.push(options);
    }
    return slots;
  }
}

/**
 * The items of a figure that the given professions brought along.
 * @param {Actor} actor
 * @param {string[]} ids  Item ids of the professions.
 * @returns {Item[]}
 */
function broughtBy(actor, ids) {
  return actor.items.filter(item => ids.includes(item.getFlag("kristallpunk", "grantedBy")));
}

/**
 * Data for a new item on a figure, made from a template in a compendium or the world.
 * @param {Item} template
 * @returns {object}
 */
function fromTemplate(template) {
  return game.items.fromCompendium(template, { clearFolder: true, keepId: false });
}
