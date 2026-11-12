/**
 * Entry point of the Kristallpunk system.
 * Registers data models, document classes and sheets during Foundry's init hook.
 */

import { KRISTALLPUNK } from "./module/config.mjs";
import ProtagonistData from "./module/data/protagonist.mjs";
import CheckMessageData, { TEMPLATE as CHECK_CARD } from "./module/data/check-message.mjs";
import CheckRequestMessageData, {
  registerCheckRequestHooks, TEMPLATE as REQUEST_CARD
} from "./module/data/check-request-message.mjs";
import * as rules from "./module/rules/_module.mjs";
import * as api from "./module/api/_module.mjs";
import { registerSettings, SYSTEM_ID } from "./module/settings.mjs";
import ProtagonistSheet from "./module/sheets/protagonist-sheet.mjs";
import KristallpunkItemSheet from "./module/sheets/item-sheet.mjs";
import EquipmentData from "./module/data/item/equipment.mjs";
import CompetenceData from "./module/data/item/competence.mjs";
import InnateTraitData from "./module/data/item/innate-trait.mjs";
import CallingData from "./module/data/item/calling.mjs";
import * as statusTracker from "./module/apps/status-tracker.mjs";
import * as effectList from "./module/sheets/effect-list.mjs";
import * as itemList from "./module/sheets/item-list.mjs";
import KristallpunkHotbar from "./module/apps/hotbar.mjs";
import { registerTokenHotbarHooks } from "./module/apps/token-hotbar.mjs";
import { registerHotbarTooltips } from "./module/apps/hotbar-tooltips.mjs";
import { registerEffectTargetHooks } from "./module/data/effect-targets.mjs";
import { registerFileCleanupHooks } from "./module/apps/file-cleanup.mjs";
import { registerEffectChoiceHooks } from "./module/apps/effect-choice.mjs";

Hooks.once("init", () => {
  console.log("Kristallpunk | Initializing system");

  game.kristallpunk = { rules, api };

  CONFIG.KRISTALLPUNK = KRISTALLPUNK;
  registerSettings();
  CONFIG.Actor.dataModels.protagonist = ProtagonistData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.competence = CompetenceData;
  CONFIG.Item.dataModels.innateTrait = InnateTraitData;
  CONFIG.Item.dataModels.calling = CallingData;
  CONFIG.ChatMessage.dataModels.check = CheckMessageData;
  CONFIG.ChatMessage.dataModels.checkRequest = CheckRequestMessageData;
  registerCheckRequestHooks();
  registerEffectTargetHooks();
  registerFileCleanupHooks();
  registerEffectChoiceHooks();

  // The system's bar replaces Foundry's macro bar, unless the client asks for Foundry's (#31)
  if ( !game.settings.get(SYSTEM_ID, "coreHotbar") ) {
    CONFIG.ui.hotbar = KristallpunkHotbar;
    KristallpunkHotbar.registerKeybindings();
    registerTokenHotbarHooks();
    registerHotbarTooltips();
  }

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
  foundry.documents.collections.Items.registerSheet("kristallpunk", KristallpunkItemSheet, {
    makeDefault: true,
    label: "KRISTALLPUNK.Item.Sheet"
  });

  // Partials shared between applications; the chat cards are preloaded so they render synchronously
  foundry.applications.handlebars.loadTemplates({
    [statusTracker.PARTIAL]: statusTracker.TEMPLATE, [effectList.PARTIAL]: effectList.TEMPLATE,
    [itemList.PARTIAL]: itemList.TEMPLATE, [itemList.TAG_PARTIAL]: itemList.TAG_TEMPLATE,
    [CHECK_CARD]: CHECK_CARD, [REQUEST_CARD]: REQUEST_CARD
  });
});

Hooks.on("renderChatMessageHTML", CheckMessageData.onRenderChatMessageHTML);
Hooks.on("renderChatMessageHTML", CheckRequestMessageData.onRenderChatMessageHTML);
Hooks.on("getChatMessageContextOptions", CheckMessageData.onGetChatMessageContextOptions);
