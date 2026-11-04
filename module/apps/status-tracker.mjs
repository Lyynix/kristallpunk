/**
 * Status tracker (Status-Anzeiger, Kurzregeln 1.0, p. 8–10): a reusable building block
 * shown in the character sheet and later in the token hotbar.
 *
 * Usage: register the partial once (see TEMPLATE), add `prepareStatusTracker(actor)` to the
 * render context, render `{{> "kristallpunk.status-tracker" statusTracker}}` inside a form
 * that updates the actor on change, and call `activateStatusTracker(element, actor)` after
 * rendering. Every track is a radio group named after its data field.
 */

import { convictionStage } from "../rules/conviction.mjs";

/** Partial name and template path. */
export const PARTIAL = "kristallpunk.status-tracker";
export const TEMPLATE = "systems/kristallpunk/templates/parts/status-tracker.hbs";

/**
 * Prepare the render context of the status tracker for an actor.
 * Layout follows the original: per domain a row of wounds (3–2–1) and stamina (from 0),
 * and a conviction column (+3 to -3) on the right.
 * Only available stamina cells are shown: up to the maximum, or up to the current value
 * if that lies above the maximum (marked as such).
 * @param {Actor} actor
 * @returns {object}
 */
export function prepareStatusTracker(actor) {
  const system = actor.system;
  const fields = system.schema.fields;

  const domains = Object.keys(CONFIG.KRISTALLPUNK.domains).map(domain => {
    const { value, max } = system.stamina[domain];
    const staminaCells = [];
    for ( let n = 0; n <= Math.max(max, value); n++ ) {
      staminaCells.push({ value: n, checked: n === value, overMax: n > max });
    }

    const woundField = fields.wounds.fields[domain];
    const woundCells = [];
    for ( let n = woundField.max; n > woundField.min; n-- ) {
      woundCells.push({ value: n, checked: n === system.wounds[domain] });
    }

    return {
      key: domain,
      stamina: {
        name: `system.stamina.${domain}.value`,
        label: fields.stamina.fields[domain].fields.value.label,
        cells: staminaCells
      },
      wounds: {
        name: `system.wounds.${domain}`,
        label: woundField.label,
        cells: woundCells
      }
    };
  });

  const convictionField = fields.conviction;
  const convictionCells = [];
  for ( let n = convictionField.max; n >= convictionField.min; n-- ) {
    const stage = CONFIG.KRISTALLPUNK.convictionStages[convictionStage(n)];
    convictionCells.push({
      value: n,
      display: n > 0 ? `+${n}` : String(n),
      sign: Math.sign(n),
      checked: n === system.conviction,
      stage: stage ? game.i18n.localize(stage.label) : ""
    });
  }

  return {
    domains,
    conviction: {
      name: "system.conviction",
      label: convictionField.label,
      cells: convictionCells
    }
  };
}

/**
 * Attach the behavior a radio group cannot provide on its own: removing a wound.
 * The wound tracks have no cell for 0 (like the original), so clicking the chosen wound
 * or pressing Delete/Backspace on it removes one wound.
 * Safe to call after every render; inputs are only bound once.
 * @param {HTMLElement} element  An element containing the rendered status tracker.
 * @param {Actor} actor          The actor the tracker belongs to.
 */
export function activateStatusTracker(element, actor) {
  for ( const input of element.querySelectorAll(".status-tracker .track.wounds input") ) {
    if ( input.dataset.trackerBound ) continue;
    input.dataset.trackerBound = "true";

    // A click checks the radio before the click handler runs, so remember the state beforehand
    input.addEventListener("pointerdown", () => input.dataset.wasChecked = String(input.checked));
    input.addEventListener("click", event => {
      const wasChecked = input.dataset.wasChecked === "true";
      delete input.dataset.wasChecked;
      if ( !wasChecked ) return;
      event.preventDefault();
      removeWound(actor, input);
    });
    input.addEventListener("keydown", event => {
      if ( !["Delete", "Backspace"].includes(event.key) || !input.checked ) return;
      event.preventDefault();
      removeWound(actor, input);
    });
  }
}

/**
 * Lower a wound track by one, starting from the chosen cell.
 * @param {Actor} actor
 * @param {HTMLInputElement} input  The chosen wound radio.
 * @returns {Promise<Actor>}
 */
function removeWound(actor, input) {
  return actor.update({ [input.name]: Number(input.value) - 1 });
}
