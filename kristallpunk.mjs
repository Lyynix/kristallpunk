/**
 * Entry point of the Kristallpunk system.
 * Registers data models, document classes and sheets during Foundry's init hook.
 */

import { KRISTALLPUNK } from "./module/config.mjs";
import ProtagonistData from "./module/data/protagonist.mjs";
import CheckMessageData, { TEMPLATE as CHECK_CARD } from "./module/data/check-message.mjs";
import * as rules from "./module/rules/_module.mjs";
import * as api from "./module/api/_module.mjs";
import { registerSettings, SYSTEM_ID } from "./module/settings.mjs";
import ProtagonistSheet from "./module/sheets/protagonist-sheet.mjs";
import * as statusTracker from "./module/apps/status-tracker.mjs";
import KristallpunkHotbar from "./module/apps/hotbar.mjs";

Hooks.once("init", () => {
  console.log("Kristallpunk | Initializing system");

  game.kristallpunk = { rules, api };

  CONFIG.KRISTALLPUNK = KRISTALLPUNK;
  registerSettings();
  CONFIG.Actor.dataModels.protagonist = ProtagonistData;
  CONFIG.ChatMessage.dataModels.check = CheckMessageData;

  // The system's bar replaces Foundry's macro bar, unless the client asks for Foundry's (#31)
  if ( !game.settings.get(SYSTEM_ID, "coreHotbar") ) CONFIG.ui.hotbar = KristallpunkHotbar;

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

  // Partials shared between applications; the check card is preloaded so it renders synchronously
  foundry.applications.handlebars.loadTemplates({ [statusTracker.PARTIAL]: statusTracker.TEMPLATE, [CHECK_CARD]: CHECK_CARD });
});

Hooks.on("renderChatMessageHTML", CheckMessageData.onRenderChatMessageHTML);
Hooks.on("getChatMessageContextOptions", CheckMessageData.onGetChatMessageContextOptions);
