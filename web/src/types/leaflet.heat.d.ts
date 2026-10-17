// leaflet.heat ships no types. This augments @types/leaflet with the surface the board uses.
import 'leaflet';

declare module 'leaflet' {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    /** Intensity that maps to the top of the gradient. Weights are 0–1, so this is 1. */
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: [number, number, number][]): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  function heatLayer(
    latlngs: [number, number, number][],
    options?: HeatLayerOptions,
  ): HeatLayer;
}

declare module 'leaflet.heat';
