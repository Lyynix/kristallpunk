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

  game.settings.register(SYSTEM_ID, "autoApplyCost", {
    name: "KRISTALLPUNK.Settings.AutoApplyCost.Name",
    hint: "KRISTALLPUNK.Settings.AutoApplyCost.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}
