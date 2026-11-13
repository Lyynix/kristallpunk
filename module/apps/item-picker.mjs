import { gatherTemplates } from "../migrations/templates.mjs";
import { openPicker } from "./picker.mjs";

/**
 * Picking an item for a figure from the compendiums and the world, in the picker (picker.mjs): the system's
 * compendium of the type first, then the world's items, then other compendiums. A pinned entry creates a new item.
 * The chosen item is added as if it had been dropped, so its own dialogs and what it brings along apply.
 *
 * Items that do not fit the figure only show when searched for, with the reason:
 * - an item of that name the figure has already (competences: of that name and skill),
 * - an innate trait that excludes one of the figure's traits, or is excluded by one,
 * - a profession of another calling than the figure's.
 * Protection (#49) is picked for one domain: armor or ward; pieces of the other domain are not offered.
 */

/** The system's compendium of each item type that can be picked. */
export const PICKER_PACKS = {
  calling: "kristallpunk.callings",
  profession: "kristallpunk.professions",
  innateTrait: "kristallpunk.innateTraits",
  competence: "kristallpunk.competences",
  protection: "kristallpunk.protection"
};

/** Index fields each type needs for hints and checks. */
const FIELDS = {
  profession: ["system.calling"],
  innateTrait: ["system.excludes"],
  competence: ["system.skill"],
  protection: ["system.domain", "system.rating"]
};

const lower = text => (text ?? "").trim().toLowerCase();

/**
 * Let the user pick an item of a type for a figure, at the element clicked, and add it.
 * @param {Actor} actor
 * @param {string} type        Item type, one of PICKER_PACKS.
 * @param {HTMLElement} anchor
 * @param {object} [options]
 * @param {string} [options.domain]  Only items of this domain (protection, #49).
 * @returns {Promise<"created"|"added"|null>}  "created" if the user chose to create a new item (the caller does
 *                                             that), "added" if an item was added, null if nothing was picked.
 */
export async function pickItem(actor, type, anchor, { domain } = {}) {
  const { getProperty } = foundry.utils;
  const templates = await gatherTemplates({
    type, pack: PICKER_PACKS[type], fields: FIELDS[type] ?? [],
    // Competences of the same name for different skills are different competences
    variant: type === "competence" ? entry => getProperty(entry, "system.skill") ?? null : undefined
  });
  const found = [...templates.values()].flat()
    .filter(({ entry }) => !domain || (getProperty(entry, "system.domain") === domain));
  const check = await checkerFor(actor, type, found.map(({ entry }) => entry));

  const entries = found.map(({ uuid, source, inSystemPack, entry }) => ({
    id: uuid,
    label: entry.name,
    hint: [check.hint(entry), inSystemPack ? null : source].filter(Boolean).join(" · "),
    warning: check.warning(entry) ?? undefined
  })).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

  const typeLabel = game.i18n.localize(CONFIG.Item.typeLabels[type]);
  const result = await openPicker({
    anchor, entries,
    pinned: [{ id: "create", label: game.i18n.format("KRISTALLPUNK.Picker.Create", { type: typeLabel }), icon: "fa-solid fa-plus" }]
  });
  if ( !result ) return null;
  if ( result.pinned === "create" ) return "created";

  const template = await fromUuid(result.entry);
  if ( !template ) return null;
  await actor.createEmbeddedDocuments("Item", [game.items.fromCompendium(template, { clearFolder: true })]);
  return "added";
}

/**
 * Hint and warning of an entry for a figure, by item type.
 * @param {Actor} actor
 * @param {string} type
 * @param {object[]} candidates  Index entries or items that will be offered.
 * @returns {Promise<{hint: (entry: object) => string|null, warning: (entry: object) => string|null}>}
 */
async function checkerFor(actor, type, candidates) {
  const { getProperty } = foundry.utils;
  const owned = actor.itemTypes[type] ?? [];
  const has = entry => owned.some(item => (lower(item.name) === lower(entry.name))
    && ((type !== "competence") || (item.system.skill === getProperty(entry, "system.skill"))));
  const hasWarning = entry => (has(entry) ? game.i18n.localize("KRISTALLPUNK.Picker.Owned") : null);

  switch ( type ) {
    case "competence": return {
      hint: entry => {
        const skill = CONFIG.KRISTALLPUNK.skills[getProperty(entry, "system.skill")];
        return skill ? game.i18n.localize(skill.label) : null;
      },
      warning: hasWarning
    };

    case "innateTrait": return {
      hint: () => null,
      warning: entry => {
        if ( has(entry) ) return hasWarning(entry);
        const excludes = new Set([...(getProperty(entry, "system.excludes") ?? [])].map(lower));
        const other = owned.find(item => excludes.has(lower(item.name))
          || [...item.system.excludes].map(lower).includes(lower(entry.name)));
        return other ? game.i18n.format("KRISTALLPUNK.Picker.Excludes", { other: other.name }) : null;
      }
    };

    case "profession": {
      // Names of the callings the professions belong to, resolved once per calling
      const callingNames = new Map();
      const uuids = new Set(candidates.map(entry => getProperty(entry, "system.calling")).filter(Boolean));
      for ( const uuid of uuids ) callingNames.set(uuid, (await fromUuid(uuid))?.name ?? null);
      const callingOf = entry => callingNames.get(getProperty(entry, "system.calling")) ?? null;
      const ownCalling = actor.itemTypes.calling[0]?.name;
      return {
        hint: callingOf,
        warning: entry => {
          if ( has(entry) ) return hasWarning(entry);
          const calling = callingOf(entry);
          return (ownCalling && calling && (lower(calling) !== lower(ownCalling)))
            ? game.i18n.format("KRISTALLPUNK.Picker.OtherCalling", { calling }) : null;
        }
      };
    }

    case "protection": return {
      hint: entry => game.i18n.format("KRISTALLPUNK.Picker.Rating", { value: getProperty(entry, "system.rating") ?? 0 }),
      warning: hasWarning
    };

    default: return { hint: () => null, warning: hasWarning };
  }
}
