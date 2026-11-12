/**
 * Templates for the file cleanup (#46, #47): items of a type that a former free text can be turned into, found by
 * name. The system's compendium of that type comes first, then the world's items, then other compendiums of items.
 * The item picker of the sheets (module/apps/item-picker.mjs) offers the same templates.
 */

/**
 * Items of a type that can serve as templates, by their names in lower case.
 * @param {object} data
 * @param {string} data.type                  Item type.
 * @param {string} data.pack                  Collection id of the system's compendium of that type.
 * @param {(item: object) => string|null} [data.variant]  Tells apart items of the same name, e.g. by skill; from
 *                                            an index entry or an item. Of each name and variant, the first wins.
 * @param {string[]} [data.fields]            Further index fields the variant needs, e.g. "system.skill".
 * @returns {Promise<Map<string, {uuid: string, variant: string|null, source: string, inSystemPack: boolean,
 *   entry: object}[]>>}  `entry` is the index entry or world item, with the requested fields.
 */
export async function gatherTemplates({ type, pack, variant = () => null, fields = [] }) {
  const templates = new Map();
  const add = (entry, source, inSystemPack = false) => {
    const key = entry.name.toLowerCase();
    if ( !templates.has(key) ) templates.set(key, []);
    const list = templates.get(key);
    const value = variant(entry) ?? null;
    if ( !list.some(other => other.variant === value) ) list.push({ uuid: entry.uuid, variant: value, source, inSystemPack, entry });
  };

  const systemPack = game.packs.get(pack);
  const otherPacks = game.packs.filter(other => (other.documentName === "Item") && (other !== systemPack));
  const fromPack = async compendium => {
    const index = await compendium.getIndex({ fields: ["type", ...fields] });
    for ( const entry of index ) if ( entry.type === type ) add(entry, compendium.title, compendium === systemPack);
  };

  if ( systemPack ) await fromPack(systemPack);
  const world = game.i18n.localize("KRISTALLPUNK.Cleanup.World");
  for ( const item of game.items ) if ( item.type === type ) add(item, world);
  for ( const compendium of otherPacks ) await fromPack(compendium);
  return templates;
}
