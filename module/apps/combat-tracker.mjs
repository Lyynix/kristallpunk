import { RESOLVE_TURN_ORDER_TYPE, resolveTurnOrderChange } from "../rules/combat.mjs";

/**
 * Modifies the CombatTracker to enable changing the initiative order through dragging.
 * This can be done by changing the order of combatants within the same initiative value
 * or by holding the turn until later position.
 * (KR p. 14, #61)
 */
export default class KristallpunkCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {
  /**
   * Stores the calculated changes when dragged
   * @type {{combatantId: string, from: number, to: number, order: Array, turn: number|null, results: Array}|null}
   */
  #drag = null;

  /**
   * Stores top distance for combatants before rendering. Used to animate the li elements.
   */
  #last = null;
  /**
   *  Stores if the user wants reduced motion.
   */
  #reducedMotion = false;

  async _preRender(context, options) {
    await super._preRender(context, options);

    if (!this.element) return;
    if (this.#reducedMotion) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) this.#reducedMotion = true;

    this.#last = [];
    const combatantElements = this.element.querySelectorAll("li.combatant[data-combatant-id]");
    combatantElements.forEach(element => {
      this.#last[element.dataset.combatantId] = {
        top: element.getBoundingClientRect().top
      }
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#drag = null;

    const dragDrop = new foundry.applications.ux.DragDrop.implementation({
      dragSelector: `li.combatant[data-combatant-id]`,
      dropSelector: `li.combatant[data-combatant-id]`,
      callbacks: {
        dragstart: this.#onDragStart.bind(this),
        dragover: this.#onDragOver.bind(this),
        dragend: this.#onDragEnd.bind(this),
        drop: this.#onDrop.bind(this)
      }
    });
    dragDrop.bind(this.element);

    const combatantElements = this.element.querySelectorAll("li.combatant[data-combatant-id]");
    combatantElements.forEach(element => {
      element.draggable = this.viewed.combatants.get(element.dataset.combatantId)?.isOwner ?? false;

      if (!this.#last || this.#reducedMotion) return;
      element.animate(
        [{ transform: `translateY(${this.#last[element.dataset.combatantId].top - element.getBoundingClientRect().top}px)` }, { transform: "translateY(0)" }],
        { duration: 200, easing: "ease-out" }
      )
    });
  }

  /**
   * Data for the possible types to generate the visual drop effect.
   */
  static #DROP_TYPES = {
    noChange: { icon: "fa-equals", line: "KRISTALLPUNK.Combat.Drop.NoChange" },
    forbidden: { icon: "fa-ban", line: "KRISTALLPUNK.Combat.Drop.Forbidden" },
    tieOrder: { icon: "fa-arrows-up-down", line: "KRISTALLPUNK.Combat.Drop.TieOrder", zone: "KRISTALLPUNK.Combat.Zone.TieOrder" },
    hold: { icon: "fa-hourglass-half", line: "KRISTALLPUNK.Combat.Drop.Hold", zone: "KRISTALLPUNK.Combat.Zone.Hold" }
  };

  #onDragStart(event) {
    const image = event.currentTarget.querySelector("img.token-image");
    event.dataTransfer.setDragImage(image, image.width / 2, image.height / 2);

    const targetEl = event.currentTarget;
    const combatantId = targetEl.dataset.combatantId;
    const combat = this.viewed;
    const from = combat.turns.findIndex(combatant => combatant.id === combatantId);
    const order = combat.turns.map(combatant => CONFIG.Combat.documentClass._getCombatantValues(combatant));
    const turn = combat.started ? combat.turn : null;

    event.dataTransfer.setData("text/plain", combatantId);

    this.#drag = {
      from, order, turn, combatantId,
      results: Array.from({ length: combat.turns.length + 1 }, (_, i) => {
        return resolveTurnOrderChange({ order, from, to: i, turn, isGM: game.user.isGM });
      })
    };

    const types = this.#drag.results.map(r => r.type);
    const zones = KristallpunkCombatTracker.#turnOrderZones(types);

    const list = this.element.querySelector("ol.combat-tracker");
    list.classList.add("kp-dragging");

    // add zone elements later so that the drag-image is rendered without the frame in the way
    requestAnimationFrame(() => {
      if (!this.#drag) return;

      zones.forEach(zone => {
        const liZone = document.createElement("li");
        liZone.classList.add("kp-drop-zone");
        liZone.dataset.kpType = zone.type;

        const dropType = KristallpunkCombatTracker.#DROP_TYPES[zone.type];
        const spanZone = document.createElement("span");
        spanZone.textContent = game.i18n.localize(dropType.zone);
        liZone.appendChild(spanZone);

        const gridLineFrom = this._gridLine(zone.from);
        const gridLineTo = this._gridLine(zone.to);
        liZone.style.gridRow = `${gridLineFrom} / ${gridLineTo}`;
        if (gridLineFrom === gridLineTo) liZone.classList.add("single");

        list.appendChild(liZone);
      });
    });
  }

  #onDragOver(event) {
    if (!this.#drag) return;
    const combatantId = event.currentTarget.dataset.combatantId;
    const lineIndex = this.viewed.turns.findIndex(combatant => combatant.id === combatantId);
    if (lineIndex === -1) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const below = event.clientY > rect.top + rect.height / 2;
    const to = below ? lineIndex + 1 : lineIndex;

    const dropType = KristallpunkCombatTracker.#DROP_TYPES[this.#drag.results[to].type];

    if (this.#drag.results[to].type === RESOLVE_TURN_ORDER_TYPE.FORBIDDEN)
      event.dataTransfer.dropEffect = "none";
    else
      event.dataTransfer.dropEffect = "move";

    if (this.#drag.to === to) return;

    let lineEl;
    let lineSpan;
    if (this.#drag.to === undefined) {
      lineEl = document.createElement("li");
      lineEl.classList.add("kp-drop-line");

      lineSpan = document.createElement("span");

      lineEl.appendChild(lineSpan);
      this.element.querySelector("ol.combat-tracker").appendChild(lineEl);
    } else {
      lineEl = this.element.querySelector(".kp-drop-line");
      lineSpan = this.element.querySelector(".kp-drop-line span");
    }
    this.#drag.to = to;

    lineEl.style.gridRow = `${this._gridLine(this.#drag.to)}`;
    lineEl.dataset.kpType = this.#drag.results[this.#drag.to].type;

    lineSpan.innerHTML = `<i class="fa-solid ${dropType?.icon}" aria-hidden="true"></i>${game.i18n.localize(dropType?.line)}`;
  }

  #onDragEnd() {
    const list = this.element.querySelector("ol.combat-tracker");
    if (!list) return;

    list.querySelectorAll(".kp-drop-zone").forEach(zoneEl => zoneEl.remove());
    list.querySelectorAll(".kp-drop-line").forEach(zoneEl => zoneEl.remove());
    list.classList.remove("kp-dragging");
    this.#drag = null;
  }

  async #onDrop(event) {
    if (!this.#drag) return;

    const result = this.#drag.results[this.#drag.to];
    const combatant = this.viewed.combatants.get(this.#drag.combatantId);
    if (result?.type === RESOLVE_TURN_ORDER_TYPE.TIE_ORDER)
      await combatant.update(
        { "system.tieOrder": result.value },
        { combatTurn: this.#drag.turn }
      );
  }

  /**
   * Groups an array of RESOLVE_TURN_ORDER_TYPEs by type.
   * ATTENTION: This groups for use in visualizing the changes. noChange will be resolved as a fitting option like tieOrder or hold
   * @param {Array<RESOLVE_TURN_ORDER_TYPE>} types - Array of types to group.
   * @return {Array<Object>} - returns a list of { type, from, to } objects type is RESOLVE_TURN_ORDER_TYPE and from and to are inclusive indices.
   */
  static #turnOrderZones(types) {
    const group = [];
    types.forEach((t, i) => {
      if (t === RESOLVE_TURN_ORDER_TYPE.FORBIDDEN) return;

      const last = group.at(-1);
      const fitsToLast =
        last?.type === t ||
        last?.type === RESOLVE_TURN_ORDER_TYPE.NO_CHANGE ||
        t === RESOLVE_TURN_ORDER_TYPE.NO_CHANGE;
      if (last !== undefined && fitsToLast) {
        last.to = i;
        if (last.type === RESOLVE_TURN_ORDER_TYPE.NO_CHANGE) last.type = t;
      } else {
        group.push({ type: t, from: i, to: i });
      }
    });
    return group.filter(z => z.type !== RESOLVE_TURN_ORDER_TYPE.NO_CHANGE);
  }

  /**
   * Converts a gap index from list index to li-element gap and only counts visible combatants.
   * @param {number} gap - The desired gap.
   * @returns {number} - The calculated gap.
   */
  _gridLine(gap) {
    return this.viewed.turns.slice(0, gap).filter(combatant => combatant.visible).length + 1;
  }
}
