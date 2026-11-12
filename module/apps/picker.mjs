/**
 * A dropdown to pick one of many entries, with a search field and pinned entries that stay visible while
 * searching (e.g. "create a new one"). Opens at the element that was clicked. Knows nothing about items: it gets
 * entries and returns the choice, so it can be used anywhere (see item-picker.mjs for items).
 *
 * Entries can be hidden: they only show when the search text matches them, with a warning saying why they are
 * hidden (e.g. "the figure has it already"). They can still be picked; the system suggests, it does not enforce.
 *
 * Keys: arrows move, Enter picks, Escape or a click elsewhere closes.
 */

/**
 * @typedef {object} PickerEntry
 * @property {string} id
 * @property {string} label
 * @property {string} [hint]     Shown small on the right, and searched as well.
 * @property {string} [warning]  Why the entry is hidden unless searched for.
 */

/**
 * @typedef {object} PickerPinned
 * @property {string} id
 * @property {string} label
 * @property {string} [icon]     Font Awesome classes, e.g. "fa-solid fa-plus".
 */

/** The open picker, if any; only one is open at a time. */
let current = null;

/**
 * Text for searching: lower case, without diacritics, so "arzt" finds "Ärztin" and "14ieme" finds "14ième".
 * @param {string} text
 * @returns {string}
 */
function normalize(text = "") {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Open a picker at an element.
 * @param {object} data
 * @param {HTMLElement} data.anchor        The element the picker opens at.
 * @param {PickerEntry[]} data.entries
 * @param {PickerPinned[]} [data.pinned]   Always visible, above the entries.
 * @param {string} [data.placeholder]      Localization key of the search field's placeholder.
 * @returns {Promise<{pinned: string}|{entry: string}|null>}  The id of the pinned entry or entry picked, or null.
 */
export function openPicker({ anchor, entries, pinned = [], placeholder = "KRISTALLPUNK.Picker.Search" }) {
  current?.close(null);
  return new Promise(resolve => { current = new Picker({ anchor, entries, pinned, placeholder, resolve }); });
}

class Picker {
  constructor({ anchor, entries, pinned, placeholder, resolve }) {
    this.anchor = anchor;
    this.entries = entries.map(entry => ({ ...entry, search: normalize(`${entry.label} ${entry.hint ?? ""}`) }));
    this.pinned = pinned;
    this.resolve = resolve;
    this.active = 0;
    this.#build(placeholder);
    this.#render("");
    this.#position();
    this.input.focus();
  }

  /** Create the element and listen for keys and clicks. */
  #build(placeholder) {
    const element = this.element = document.createElement("div");
    element.className = "kristallpunk kristallpunk-picker";
    // Take over the theme of the window the picker opens from
    const app = this.anchor.closest(".application");
    for ( const cls of app?.classList ?? [] ) if ( (cls === "themed") || cls.startsWith("theme-") ) element.classList.add(cls);

    const input = this.input = document.createElement("input");
    input.type = "search";
    input.placeholder = game.i18n.localize(placeholder);
    input.setAttribute("aria-label", input.placeholder);
    input.addEventListener("input", () => { this.active = 0; this.#render(input.value); });
    input.addEventListener("keydown", event => this.#onKey(event));

    this.list = document.createElement("ul");
    this.list.setAttribute("role", "listbox");
    this.list.addEventListener("pointerdown", event => event.preventDefault()); // keep the focus in the search field
    this.list.addEventListener("click", event => {
      const option = event.target.closest("[data-kind]");
      if ( option ) this.close({ [option.dataset.kind]: option.dataset.id });
    });

    element.append(input, this.list);
    document.body.append(element);

    this.onPointerDown = event => { if ( !element.contains(event.target) ) this.close(null); };
    document.addEventListener("pointerdown", this.onPointerDown, { capture: true });
  }

  /**
   * Show the pinned entries and the entries matching the search text.
   * @param {string} text
   */
  #render(text) {
    const search = normalize(text.trim());
    const visible = this.entries.filter(entry => search ? entry.search.includes(search) : !entry.warning);
    this.options = [
      ...this.pinned.map(entry => ({ ...entry, kind: "pinned" })),
      ...visible.map(entry => ({ ...entry, kind: "entry" }))
    ];
    this.active = Math.min(this.active, this.options.length - 1);

    const { escapeHTML } = foundry.utils;
    this.list.innerHTML = this.options.map((option, index) => `
      <li role="option" class="${option.kind}${index === this.pinned.length - 1 ? " last-pinned" : ""}${index === this.active ? " active" : ""}"
          data-kind="${option.kind}" data-id="${escapeHTML(option.id)}" aria-selected="${index === this.active}">
        ${option.icon ? `<i class="${escapeHTML(option.icon)}" inert></i>` : ""}
        <span class="label">${escapeHTML(option.label)}</span>
        ${option.warning ? `<i class="warning fa-solid fa-triangle-exclamation" data-tooltip="${escapeHTML(option.warning)}"
          aria-label="${escapeHTML(option.warning)}" role="img"></i>` : ""}
        ${option.hint ? `<span class="hint">${escapeHTML(option.hint)}</span>` : ""}
      </li>`).join("")
      + ((visible.length || !search) ? "" : `<li class="none">${escapeHTML(game.i18n.localize("KRISTALLPUNK.Picker.None"))}</li>`);
  }

  /**
   * Keys in the search field.
   * @param {KeyboardEvent} event
   */
  #onKey(event) {
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if ( move ) {
      event.preventDefault();
      const count = this.options.length;
      if ( !count ) return;
      this.active = (this.active + move + count) % count;
      for ( const [index, li] of this.list.querySelectorAll("[data-kind]").entries() ) {
        li.classList.toggle("active", index === this.active);
        li.setAttribute("aria-selected", index === this.active);
        if ( index === this.active ) li.scrollIntoView({ block: "nearest" });
      }
    }
    else if ( event.key === "Enter" ) {
      event.preventDefault();
      const option = this.options[this.active];
      if ( option ) this.close({ [option.kind]: option.id });
    }
    else if ( event.key === "Escape" ) {
      event.preventDefault();
      event.stopPropagation();
      this.close(null);
    }
  }

  /** Place the picker below the anchor, or above it if there is no room below. */
  #position() {
    const rect = this.anchor.getBoundingClientRect();
    const style = this.element.style;
    const app = this.anchor.closest(".application");
    style.zIndex = String((Number(getComputedStyle(app ?? document.body).zIndex) || 100) + 1);
    style.minWidth = `${Math.max(rect.width, 240)}px`;
    style.left = `${Math.min(rect.left, window.innerWidth - this.element.offsetWidth - 8)}px`;
    const below = window.innerHeight - rect.bottom;
    if ( (below < this.element.offsetHeight + 8) && (rect.top > below) ) style.bottom = `${window.innerHeight - rect.top + 2}px`;
    else style.top = `${rect.bottom + 2}px`;
  }

  /**
   * Close the picker and hand over the choice.
   * @param {{pinned: string}|{entry: string}|null} result
   */
  close(result) {
    document.removeEventListener("pointerdown", this.onPointerDown, { capture: true });
    this.element.remove();
    if ( current === this ) current = null;
    this.resolve(result);
  }
}
