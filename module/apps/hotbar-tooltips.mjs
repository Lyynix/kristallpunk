/**
 * Tooltips of the system's bar (#31, #32) open above the whole bar instead of right above the hovered element,
 * where they would cover the neighboring elements of the bar. Horizontally they stay centered on the element.
 *
 * Extends the TooltipManager class configured at the time of the call, so a module that replaced it before
 * keeps its behavior; only tooltips that point up from inside the bar are placed differently.
 * Foundry creates the tooltip manager from CONFIG.ux.TooltipManager right after the init hook.
 */
export function registerHotbarTooltips() {
  const Base = CONFIG.ux.TooltipManager;
  CONFIG.ux.TooltipManager = class HotbarTooltipManager extends Base {
    /** @inheritDoc */
    _setAnchor(direction) {
      const bar = this.element?.closest("#hotbar.kristallpunk");
      if ( !bar || (direction !== this.constructor.TOOLTIP_DIRECTIONS.UP) ) return super._setAnchor(direction);
      const pad = this.constructor.TOOLTIP_MARGIN_PX;
      const element = this.element.getBoundingClientRect();
      const { innerHeight } = this.tooltip.ownerDocument.defaultView;
      return this._setStyle({
        textAlign: "center",
        left: element.left + (element.width / 2) - (this.tooltip.offsetWidth / 2),
        bottom: innerHeight - bar.getBoundingClientRect().top + pad
      });
    }
  };
}
