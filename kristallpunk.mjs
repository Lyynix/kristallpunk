/**
 * Entry point of the Kristallpunk system.
 * Registers data models, document classes and sheets during Foundry's init hook.
 */

import { KRISTALLPUNK } from "./module/config.mjs";
import ProtagonistData from "./module/data/protagonist.mjs";
import * as rules from "./module/rules/_module.mjs";
import * as api from "./module/api/_module.mjs";
import ProtagonistSheet from "./module/sheets/protagonist-sheet.mjs";
import * as statusTracker from "./module/apps/status-tracker.mjs";

Hooks.once("init", () => {
  console.log("Kristallpunk | Initializing system");

  game.kristallpunk = { rules, api };

  CONFIG.KRISTALLPUNK = KRISTALLPUNK;
  CONFIG.Actor.dataModels.protagonist = ProtagonistData;

  // Token resources. Listed explicitly because the stamina maximum is derived, not stored,
  // so Foundry cannot detect the bars from the schema on its own.
  CONFIG.Actor.trackableAttributes = {
    protagonist: {
      bar: ["stamina.body", "stamina.mind"],
      value: ["wounds.body", "wounds.mind", "conviction", "armor", "ward"]
    }
  };

  foundry.documents.collections.Actors.registerSheet("kristallpunk", ProtagonistSheet, {
    types: ["protagonist"],
    makeDefault: true,
    label: "KRISTALLPUNK.Sheet.Protagonist"
  });

  // Partials shared between applications
  foundry.applications.handlebars.loadTemplates({ [statusTracker.PARTIAL]: statusTracker.TEMPLATE });
});
