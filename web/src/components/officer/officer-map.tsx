'use client';

// The officer's own map: street level, centred on them, houses big enough to hit with a
// gloved thumb. Same MapLibre setup as the dispatcher's board — same vector basemap, same
// buildings.json, same interop shim — with three differences that matter on a street:
//
//   * the frame is not locked. The dispatcher's view cannot leave the incident because the
//     board covers one incident; an officer needs to look up the block and then come back.
//   * the top zoom goes to 20, where a single house fills a third of a phone screen.
//   * the basemap is lighter and the status fills are opaque, because this screen is read
//     in direct sunlight with the brightness already at maximum.

import { useEffect, useRef } from 'react';
import * as maplibreNs from 'maplibre-gl';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STATUS_COLOR } from '@/lib/priority';
import type { LatLng } from '@/lib/geo';
import type { OfficerPosition } from '@/lib/officer-position';
import type { AddressState } from '@/lib/types';

/**
 * maplibre-gl v5 resolves to named exports under CJS and a default-only object under ESM,
 * so a plain namespace import works in one and throws in the other. Reading through
 * `default` when it exists covers both.
 */
const maplibregl = ((maplibreNs as unknown as { default?: typeof maplibreNs }).default ??
  maplibreNs) as typeof maplibreNs;

/**
 * A lighter paper than the board's #f4efe6. Outdoors at noon a phone loses most of its
 * contrast range, so the ground goes nearly white and everything drawn on it is darker and
 * more saturated than it would be indoors.
 */
const PAPER = '#fbf9f5';
const LABELS = 'basemap-labels';

/** Street level. Below 15 the officer is no longer looking at their own surroundings. */
const MIN_ZOOM = 15;
/** Past the z14 vector source MapLibre overzooms, which stays sharp: geometry, not pixels. */
const MAX_ZOOM = 20;
/** Tight enough that individual houses are distinct and one-handed targets. */
const FOLLOW_ZOOM = 18;

/**
 * How much of the bottom of the screen the sheet covers. Follow mode centres the officer in
 * what is left rather than in the whole canvas, so the blue dot does not slide under the
 * sheet the moment a house is tapped.
 */
const SHEET_PADDING = 300;

const BASE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    basemap: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution:
        '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': PAPER } },

    { id: 'landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'scrub', 'forest']]],
      paint: { 'fill-color': '#e9ead4', 'fill-opacity': 0.8 } },
    { id: 'park', type: 'fill', source: 'basemap', 'source-layer': 'park',
      paint: { 'fill-color': '#e2e7cd', 'fill-opacity': 0.85 } },
    { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water',
      paint: { 'fill-color': '#c3d2d0' } },

    // Every building the basemap knows about, as a pale ground the tracked houses sit on.
    { id: 'buildings', type: 'fill', source: 'basemap', 'source-layer': 'building',
      paint: { 'fill-color': '#ece5d8', 'fill-outline-color': '#d8cfbe' } },

    // Roads are what an officer navigates by, so they are drawn harder than on the board.
    { id: 'roads-service', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['service', 'track', 'path']]],
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2, 20, 10] } },
    { id: 'roads-minor-case', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'tertiary']]],
      paint: { 'line-color': '#cfc5b2', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 7, 20, 26] } },
    { id: 'roads-minor', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'tertiary']]],
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 5, 20, 22] } },
    { id: 'roads-major-case', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': '#c0b49e', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 11, 20, 34] } },
    { id: 'roads-major', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 9, 20, 30] } },

    // Street names, large: this is how the officer knows which street they are on.
    { id: 'street-labels', type: 'symbol', source: 'basemap', 'source-layer': 'transportation_name',
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 12, 19, 16],
        'symbol-placement': 'line',
        'text-max-angle': 35,
        'text-letter-spacing': 0.02,
      },
      paint: { 'text-color': '#4b443a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },

    { id: LABELS, type: 'symbol', source: 'basemap', 'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
      },
      paint: { 'text-color': '#6f665a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
  ],
};

interface BuildingFile {
  /** Flat [lng, lat, lng, lat, …] rings, one per building. */
  rings: number[][];
  /** [lat, lng] centroid per building, same order and rounding as the household sites. */
  cent: [number, number][];
}

/** Key a household to its outline. Both sides round to 5dp, so this matches exactly. */
const siteKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

async function loadOutlines(signal: AbortSignal): Promise<Map<string, [number, number][]> | null> {
  try {
    const res = await fetch('/buildings.json', { signal, cache: 'force-cache' });
    if (!res.ok) return null;
    const file = (await res.json()) as BuildingFile;
    const bySite = new Map<string, [number, number][]>();
    file.rings.forEach((flat, i) => {
      const ring: [number, number][] = [];
      for (let j = 0; j < flat.length; j += 2) ring.push([flat[j], flat[j + 1]]);
      if (ring.length < 3) return;
      ring.push(ring[0]);
      const c = file.cent[i];
      if (c) bySite.set(siteKey(c[0], c[1]), ring);
    });
    return bySite;
  } catch {
    // The map still works without outlines: households fall back to a footprint-sized square.
    return null;
  }
}

const metresToDegrees = (metres: number, lat: number) => ({
  lat: metres / 111_320,
  lng: metres / (111_320 * Math.cos((lat * Math.PI) / 180)),
});

function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64): [number, number][] {
  const d = metresToDegrees(radiusM, lat);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [lng + d.lng * Math.cos(a), lat + d.lat * Math.sin(a)] as [number, number];
  });
}

/** Fallback outline, about the footprint of a small house, for a household with no ring. */
function squareAround(lat: number, lng: number): [number, number][] {
  const d = metresToDegrees(9, lat);
  return [
    [lng - d.lng, lat - d.lat],
    [lng + d.lng, lat - d.lat],
    [lng + d.lng, lat + d.lat],
    [lng - d.lng, lat + d.lat],
    [lng - d.lng, lat - d.lat],
  ];
}

/** A wedge pointing where the officer is walking. Only drawn when heading is known. */
function headingCone(lat: number, lng: number, heading: number, radiusM = 26): [number, number][] {
  const d = metresToDegrees(radiusM, lat);
  const spread = 26;
  const leg = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [lng + d.lng * Math.sin(a), lat + d.lat * Math.cos(a)];
  };
  return [[lng, lat], leg(heading - spread), leg(heading), leg(heading + spread), [lng, lat]];
}

export function OfficerMap({
  households,
  position,
  route,
  follow,
  selectedId,
  onSelect,
  onBreakFollow,
  onRecenterReady,
}: {
  /** The households in range, already filtered. These are the only tappable houses. */
  households: AddressState[];
  position: OfficerPosition | null;
  /** The simulated walk, drawn as a dotted line. Empty under real GPS. */
  route: LatLng[];
  follow: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Called on the officer's first drag or pinch, which ends follow mode. */
  onBreakFollow: () => void;
  /** Hands the parent a recenter function, so the button can live outside the canvas. */
  onRecenterReady: (recenter: () => void) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const outlinesRef = useRef<Map<string, [number, number][]> | null>(null);
  // Latest props, so MapLibre's own handlers always see current values without rebinding.
  const stateRef = useRef({ households, position, route, selectedId, follow });
  stateRef.current = { households, position, route, selectedId, follow };
  const callbacks = useRef({ onSelect, onBreakFollow });
  callbacks.current = { onSelect, onBreakFollow };
  /** Set while the component is moving the map itself, so follow does not break itself. */
  const programmatic = useRef(false);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const start = stateRef.current.position;
    const map = new maplibregl.Map({
      container: hostRef.current,
      style: BASE_STYLE,
      center: start ? [start.lng, start.lat] : [-118.5232, 34.0401],
      zoom: FOLLOW_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      fadeDuration: 0,
      // One finger drags the map. Rotating and pitching by accident with a gloved hand is
      // all cost and no benefit, and a rotated map is a map an officer has to re-read.
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    const abort = new AbortController();
    void loadOutlines(abort.signal).then((bySite) => {
      if (!bySite || abort.signal.aborted) return;
      outlinesRef.current = bySite;
      const m = mapRef.current;
      if (m && readyRef.current) paint(m, stateRef.current, outlinesRef.current);
    });

    map.on('load', () => {
      map.addSource('houses', { type: 'geojson', data: emptyCollection() });
      map.addSource('walk', { type: 'geojson', data: emptyCollection() });
      map.addSource('officer', { type: 'geojson', data: emptyCollection() });
      map.addSource('accuracy', { type: 'geojson', data: emptyCollection() });
      map.addSource('cone', { type: 'geojson', data: emptyCollection() });

      // The houses in range, drawn as the real shape of the building, filled solid. On the
      // board these are translucent; here the officer needs the answer from arm's length.
      map.addLayer({
        id: 'house-fill', type: 'fill', source: 'houses',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fillOpacity'] },
      }, LABELS);
      map.addLayer({
        id: 'house-line', type: 'line', source: 'houses',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': ['get', 'color'],
          // The selected house carries a heavy ring, so the sheet is unambiguous about
          // which building it is about.
          'line-width': ['case', ['get', 'selected'], 4, 1.5],
          'line-opacity': 1,
        },
      }, LABELS);

      // The street number, once the zoom is tight enough for it to fit on the roof.
      map.addLayer({
        id: 'house-label', type: 'symbol', source: 'houses',
        filter: ['==', ['geometry-type'], 'Point'],
        minzoom: 17.5,
        layout: {
          'text-field': ['get', 'number'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#2b241b', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });

      // An invisible, finger-sized target over each house. A footprint is about 30px across
      // at z18 and a gloved thumb is wider than that, so the hit area is deliberately
      // larger than the thing it selects.
      map.addLayer({
        id: 'house-tap', type: 'circle', source: 'houses',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 26, 'circle-color': '#000000', 'circle-opacity': 0 },
      });

      map.addLayer({
        id: 'walk', type: 'line', source: 'walk',
        paint: { 'line-color': '#38bdf8', 'line-width': 3, 'line-opacity': 0.5, 'line-dasharray': [2, 2] },
      }, LABELS);

      map.addLayer({
        id: 'accuracy-fill', type: 'fill', source: 'accuracy',
        paint: { 'fill-color': '#1d7fd4', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'accuracy-line', type: 'line', source: 'accuracy',
        paint: { 'line-color': '#1d7fd4', 'line-width': 1, 'line-opacity': 0.4 },
      });
      map.addLayer({
        id: 'cone', type: 'fill', source: 'cone',
        paint: { 'fill-color': '#1d7fd4', 'fill-opacity': 0.3 },
      });
      // The blue dot, with a white collar so it reads against a dark roof or a green lawn.
      map.addLayer({
        id: 'officer-halo', type: 'circle', source: 'officer',
        paint: { 'circle-radius': 13, 'circle-color': '#ffffff', 'circle-opacity': 0.95 },
      });
      map.addLayer({
        id: 'officer-dot', type: 'circle', source: 'officer',
        paint: {
          'circle-radius': 9,
          'circle-color': '#1d7fd4',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      for (const layer of ['house-tap', 'house-fill']) {
        map.on('click', layer, (e) => {
          const id = String(e.features?.[0]?.properties?.id ?? '');
          if (id) {
            callbacks.current.onSelect(id);
            // MapLibre would otherwise also deliver this to the bare-map handler below.
            e.preventDefault?.();
          }
        });
      }

      // A tap on open ground closes the sheet. One more way out than a close button, and it
      // needs no aim at all.
      map.on('click', (e) => {
        if (e.defaultPrevented) return;
        const hit = map.queryRenderedFeatures(e.point, { layers: ['house-tap', 'house-fill'] });
        if (hit.length === 0) callbacks.current.onSelect(null);
      });

      map.on('mouseenter', 'house-tap', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'house-tap', () => { map.getCanvas().style.cursor = ''; });

      readyRef.current = true;
      paint(map, stateRef.current, outlinesRef.current);
      const p = stateRef.current.position;
      if (p) map.jumpTo({ center: [p.lng, p.lat], zoom: FOLLOW_ZOOM });
    });

    /**
     * Any gesture ends follow mode, immediately and for good until the officer asks for it
     * back. `originalEvent` is present only when a drag, pinch or wheel caused the move —
     * the component's own easeTo has none — so this never fires on a GPS tick.
     */
    const userMoved = (e: { originalEvent?: unknown }) => {
      if (programmatic.current || !e.originalEvent) return;
      if (stateRef.current.follow) callbacks.current.onBreakFollow();
    };
    map.on('dragstart', userMoved);
    map.on('zoomstart', userMoved);

    return () => {
      readyRef.current = false;
      abort.abort();
      map.remove();
      mapRef.current = null;
    };
    // Mounted once. Everything that changes is read through refs or the effects below.
  }, []);

  // Hand the parent a way to put the map back on the officer.
  useEffect(() => {
    onRecenterReady(() => {
      const map = mapRef.current;
      const p = stateRef.current.position;
      if (!map || !p) return;
      programmatic.current = true;
      map.easeTo({
        center: [p.lng, p.lat],
        zoom: FOLLOW_ZOOM,
        padding: sheetPadding(stateRef.current.selectedId != null),
        duration: 450,
      });
      map.once('moveend', () => { programmatic.current = false; });
    });
  }, [onRecenterReady]);

  // Repaint on data, position or selection change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    paint(map, { households, position, route, selectedId }, outlinesRef.current);
  }, [households, position, route, selectedId]);

  // Follow mode. Nothing here runs while follow is off, which is what makes a drag stick:
  // the next GPS tick moves the dot and leaves the frame exactly where the officer put it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !follow || !position) return;
    programmatic.current = true;
    map.easeTo({
      center: [position.lng, position.lat],
      // Centre only. A pinch ends follow mode, so while follow is on the zoom is whatever
      // follow last set it to and there is nothing here to fight over.
      padding: sheetPadding(selectedId != null),
      duration: 600,
      essential: true,
    });
    const done = () => { programmatic.current = false; };
    map.once('moveend', done);
    return () => {
      map.off('moveend', done);
      programmatic.current = false;
    };
  }, [follow, position, selectedId]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full"
      role="application"
      aria-label="Map of the houses around you"
    />
  );
}

const emptyCollection = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

/** Keep the officer above the sheet when one is open, and centred when none is. */
const sheetPadding = (sheetOpen: boolean) => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: sheetOpen ? SHEET_PADDING : 0,
});

/** The leading house number, which is all that fits on a roof. */
const houseNumber = (address: string) => address.split(' ')[0] ?? '';

function paint(
  map: MlMap,
  state: {
    households: AddressState[];
    position: OfficerPosition | null;
    route: LatLng[];
    selectedId: string | null;
  },
  outlines: Map<string, [number, number][]> | null,
): void {
  const { households, position, route, selectedId } = state;

  const houses = map.getSource('houses') as maplibregl.GeoJSONSource | undefined;
  if (houses) {
    houses.setData({
      type: 'FeatureCollection',
      features: households.flatMap((a) => {
        const ring = outlines?.get(siteKey(a.lat, a.lng)) ?? squareAround(a.lat, a.lng);
        const shared = {
          id: a.id,
          color: STATUS_COLOR[a.status],
          // `unknown` is drawn lighter than `no_answer`: same colour, different weight, so
          // "never contacted" and "knocked, nobody home" are not the same mark.
          fillOpacity: a.status === 'unknown' ? 0.4 : 0.82,
          selected: a.id === selectedId,
          number: houseNumber(a.address),
        };
        return [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: shared,
          },
          // The tap target and the roof label hang off the centroid, not the outline.
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
            properties: shared,
          },
        ] satisfies GeoJSON.Feature[];
      }),
    });
  }

  const walk = map.getSource('walk') as maplibregl.GeoJSONSource | undefined;
  walk?.setData(
    route.length > 1
      ? {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: route.map(([lat, lng]) => [lng, lat]) },
        }
      : emptyCollection(),
  );

  const officer = map.getSource('officer') as maplibregl.GeoJSONSource | undefined;
  const accuracy = map.getSource('accuracy') as maplibregl.GeoJSONSource | undefined;
  const cone = map.getSource('cone') as maplibregl.GeoJSONSource | undefined;

  if (!position) {
    officer?.setData(emptyCollection());
    accuracy?.setData(emptyCollection());
    cone?.setData(emptyCollection());
    return;
  }

  officer?.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
  });

  // Only a real fix has a radius to show. A circle under the simulated dot would be a claim
  // about accuracy that there is nothing behind.
  accuracy?.setData(
    position.accuracy != null && position.accuracy > 1
      ? {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [circlePolygon(position.lat, position.lng, position.accuracy)],
          },
        }
      : emptyCollection(),
  );

  cone?.setData(
    position.heading != null
      ? {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [headingCone(position.lat, position.lng, position.heading)],
          },
        }
      : emptyCollection(),
  );
}
