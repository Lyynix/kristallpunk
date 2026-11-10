/**
 * Build the compendium packs from their JSON sources, or write edited packs back to their sources (#45).
 * Uses Foundry's own CLI. The packs are listed in system.json; their sources live in packs/_source/<name>/,
 * one file per document. The built LevelDB packs are not part of the repository.
 *
 *   npm run packs:pack [-- <name> …]    JSON sources → packs/<name>   (after pulling, before testing)
 *   npm run packs:unpack [-- <name> …]  packs/<name> → JSON sources   (after editing in Foundry)
 *
 * Foundry must not have the packs open: shut down the world first.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

const SOURCE = join("packs", "_source");

const [command, ...names] = process.argv.slice(2);
const { packs = [] } = JSON.parse(await readFile("system.json", "utf8"));
const selected = names.length ? packs.filter(pack => names.includes(pack.name)) : packs;

if ( !["pack", "unpack"].includes(command) ) {
  console.error("Usage: node tools/packs.mjs pack|unpack [name …]");
  process.exit(1);
}
for ( const name of names ) {
  if ( !packs.some(pack => pack.name === name) ) console.warn(`No pack "${name}" in system.json`);
}

for ( const pack of selected ) {
  const source = join(SOURCE, pack.name);
  if ( command === "pack" ) {
    await mkdir(source, { recursive: true });
    await compilePack(source, pack.path, { log: true });
  } else {
    await extractPack(pack.path, source, {
      log: true,
      // Removed documents disappear from the sources too
      clean: true,
      // Keep the sources stable: modification times alone do not count as a change
      omitVolatile: true,
      transformName: doc => `${slug(doc.name)}_${doc._id}.json`
    });
    // Keeps an empty source folder in the repository; `clean` removed it
    await writeFile(join(source, ".gitkeep"), "");
  }
}

/**
 * A file name from a document name, e.g. "Waffenmeister (Säbel)" → "waffenmeister_saebel".
 * @param {string} name
 * @returns {string}
 */
function slug(name = "") {
  return name.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "document";
}
