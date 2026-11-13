/**
 * Data model of active effects (#49). Keeps Foundry's changes and adds one rule: an effect of an item that a figure
 * carries but has not equipped does not work. It is suppressed, not switched off, so it works again as soon as the
 * item is equipped, and a switch set by hand stays as it is.
 */
export default class KristallpunkEffectData extends foundry.data.ActiveEffectTypeDataModel {
  /**
   * Read by ActiveEffect#isSuppressed. Undefined leaves the decision to Foundry (e.g. an expired duration).
   * @type {true|undefined}
   */
  get isSuppressed() {
    const item = this.parent?.parent;
    if ( !(item instanceof foundry.documents.Item) || !(item.parent instanceof foundry.documents.Actor) ) return undefined;
    return item.system.equipped === false ? true : undefined;
  }
}
