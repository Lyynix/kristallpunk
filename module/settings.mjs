/**
 * System settings. Every automation has one here; all are on by default.
 * Rule automations are world settings (decided by the GM), conveniences for players are client settings.
 */

/** Namespace of all system settings. */
export const SYSTEM_ID = "kristallpunk";

/**
 * Register all settings. Called during the init hook.
 */
export function registerSettings() {
  game.settings.register(SYSTEM_ID, "autoCost", {
    name: "KRISTALLPUNK.Settings.AutoCost.Name",
    hint: "KRISTALLPUNK.Settings.AutoCost.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Consequences of a check: stamina cost and conviction shift (#14, #15)
  game.settings.register(SYSTEM_ID, "autoApply", {
    name: "KRISTALLPUNK.Settings.AutoApply.Name",
    hint: "KRISTALLPUNK.Settings.AutoApply.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}
