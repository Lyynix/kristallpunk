/**
 * Bonuses and penalties of a check as editable rows, shared by the check dialog and the request dialog (#33).
 * Every bonus and penalty keeps its own row; they are netted only by rules.check.pool.
 */

/** Template of the rows; dialogs load it with their form part and include it by this path. */
export const TEMPLATE = "systems/kristallpunk/templates/apps/parts/modifiers.hbs";

/** Kinds of rows, as offered in the select of each row. */
export const MODIFIER_TYPES = { bonus: "KRISTALLPUNK.CheckDialog.Bonus", penalty: "KRISTALLPUNK.CheckDialog.Penalty" };

/**
 * Render context of the rows.
 * @param {{value: number, label?: string}[]} modifiers
 * @returns {{index: number, type: string, amount: number, label: string}[]}
 */
export function prepareModifierRows(modifiers) {
  return modifiers.map((modifier, index) => ({
    index,
    type: modifier.value < 0 ? "penalty" : "bonus",
    amount: Math.abs(modifier.value),
    label: modifier.label ?? ""
  }));
}

/**
 * Bonuses and penalties from the expanded form data of a dialog.
 * @param {object} data  Expanded form data with `modifiers.<index>.{type, amount, label}`.
 * @returns {{value: number, label: string}[]}
 */
export function readModifierRows(data) {
  return Object.values(data.modifiers ?? {}).map(row => {
    const amount = Math.max(0, Math.trunc(Number(row.amount) || 0));
    return { value: row.type === "penalty" ? -amount : amount, label: row.label?.trim() ?? "" };
  });
}
