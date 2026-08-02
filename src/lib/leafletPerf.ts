import L from 'leaflet'

/**
 * Leaflet #6318 — during pinch/wheel zoom, Marker._setPos rewrites
 * style.zIndex every frame. That promotes each icon to its own
 * compositor layer and destroys FPS on Safari/iOS (and Chromium too
 * once you stack overlays / blend modes).
 *
 * Skip the z-index write while a zoom gesture is active; CSS already
 * pins markers to z-index: 0. Position transforms still run every frame.
 */
let patched = false

export function patchLeafletMarkerZoomPerf(): void {
  if (patched) return
  patched = true

  const proto = L.Marker.prototype as L.Marker & {
    _setPos(pos: L.Point): void
    _icon?: HTMLElement
    _shadow?: HTMLElement
    _zIndex: number
    _resetZIndex(): void
    _map?: L.Map & {
      _animatingZoom?: boolean
      touchZoom?: { _zooming?: boolean }
    }
  }

  proto._setPos = function _abeiSetPos(pos: L.Point) {
    if (this._icon) {
      L.DomUtil.setPosition(this._icon, pos)
    }
    if (this._shadow) {
      L.DomUtil.setPosition(this._shadow, pos)
    }

    this._zIndex = pos.y + (this.options.zIndexOffset ?? 0)

    const map = this._map
    if (map && (map._animatingZoom || map.touchZoom?._zooming)) {
      return
    }

    this._resetZIndex()
  }
}
