import { SYSTEM_ID } from "../settings.mjs";
import { actorsToClean, cleanActor, NEWEST, prepareCleanup, previewCleanup } from "../migrations/_module.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * "Aktenbereinigung" (#46): lists the figures whose data an update of the system changed, with what cleaning
 * would do to each, and cleans single figures or all of them. GM only.
 * Opens on start once for migrations the GM has not seen yet; afterwards from the actors tab of the sidebar.
 */
export default class FileCleanup extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "kristallpunk-file-cleanup",
    classes: ["kristallpunk", "file-cleanup"],
    window: { title: "KRISTALLPUNK.Cleanup.Title", icon: "fa-solid fa-broom", resizable: true },
    position: { width: 520, height: "auto" },
    actions: {
      cleanActor: FileCleanup.#onCleanActor,
      cleanAll: FileCleanup.#onCleanAll
    }
  };

  static PARTS = {
    main: { template: "systems/kristallpunk/templates/apps/file-cleanup.hbs", scrollable: [".cleanup-list"] }
  };

  /**
   * Open the window, or bring it to the front.
   * @returns {Promise<FileCleanup>}
   */
  static async open() {
    const app = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id) ?? new this();
    return app.render({ force: true });
  }

  /**
   * On start: open for the GM if there are migrations newer than the GM has seen, and figures that need them.
   * Called once on ready.
   */
  static async openIfNew() {
    if ( !game.users.activeGM?.isSelf ) return;
    if ( game.settings.get(SYSTEM_ID, "cleanupSeen") >= NEWEST ) return;
    if ( !actorsToClean().length ) {
      await game.settings.set(SYSTEM_ID, "cleanupSeen", NEWEST);
      return;
    }
    await this.open();
  }

  /** Whether a cleaning is running, so buttons are not used twice. */
  #busy = false;

  /** @override */
  async _prepareContext(options) {
    const contexts = await prepareCleanup();
    const actors = actorsToClean().map(actor => ({
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      scene: actor.isToken ? actor.token.parent?.name ?? null : null,
      changes: previewCleanup(actor, contexts)
    }));
    return { actors, busy: this.#busy };
  }

  /**
   * Closing marks the current migrations as seen, so the window does not open on its own again.
   * @override
   */
  async _onClose(options) {
    await super._onClose(options);
    if ( game.user.isGM ) await game.settings.set(SYSTEM_ID, "cleanupSeen", NEWEST);
    ui.actors?.render();
  }

  /**
   * Clean the figures, one after the other, and show the list again.
   * @param {Actor[]} actors
   */
  async #clean(actors) {
    if ( this.#busy ) return;
    this.#busy = true;
    await this.render();
    try {
      const contexts = await prepareCleanup();
      for ( const actor of actors ) await cleanActor(actor, contexts);
    } catch(error) {
      console.error("Kristallpunk | Cleaning failed", error);
      ui.notifications.error("KRISTALLPUNK.Cleanup.Failed", { localize: true });
    } finally {
      this.#busy = false;
      await this.render();
      ui.actors?.render();
    }
  }

  /**
   * @this {FileCleanup}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCleanActor(event, target) {
    const actor = foundry.utils.fromUuidSync(target.closest("[data-actor]")?.dataset.actor);
    if ( actor ) await this.#clean([actor]);
  }

  /**
   * @this {FileCleanup}
   */
  static async #onCleanAll() {
    await this.#clean(actorsToClean());
  }
}

/**
 * The button in the actors tab of the sidebar that opens the window, for GMs, with the number of figures to clean.
 * Called during init.
 */
export function registerFileCleanupHooks() {
  Hooks.once("ready", () => FileCleanup.openIfNew());
  Hooks.on("renderActorDirectory", (app, element) => {
    if ( !game.user.isGM ) return;
    const actions = element.querySelector(".header-actions");
    if ( !actions || actions.querySelector(".kristallpunk-cleanup") ) return;
    const count = actorsToClean().length;
    const label = game.i18n.localize("KRISTALLPUNK.Cleanup.Open");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kristallpunk-cleanup";
    button.innerHTML = `<i class="fa-solid fa-broom" inert></i><span>${label}</span>`
      + (count ? ` <span class="count">${count}</span>` : "");
    button.addEventListener("click", () => FileCleanup.open());
    actions.append(button);
  });
}
