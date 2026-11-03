/**
 * Entry point of the Kristallpunk system.
 * Registers data models, document classes and sheets during Foundry's init hook.
 */

import { KRISTALLPUNK } from "./module/config.mjs";
import ProtagonistData from "./module/data/protagonist.mjs";

Hooks.once("init", () => {
  console.log("Kristallpunk | Initializing system");

  CONFIG.KRISTALLPUNK = KRISTALLPUNK;
  CONFIG.Actor.dataModels.protagonist = ProtagonistData;
});
