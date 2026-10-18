'use client';

// MapLibre with a vector basemap drawn in the paper palette, following the reference build.
// The basemap is orientation only — water, parks, roads and place names — because the
// households are the content. A raster basemap cannot be recoloured this way, which is why
// this is a vector style rather than tiles with a CSS filter over them.

import { useEffect, useRef, useState } from 'react';
import * as maplibreNs from 'maplibre-gl';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PERIMETER, ZONE_NAMES, type LatLngTuple } from '@/lib/zones';
import { describeMapError } from '@/lib/webgl';
import { HOUSE_COLOR, houseColor, reasonOf } from '@/lib/priority';
import { STATUS_LABEL, STRUCTURE_LABEL } from '@/lib/types';
import type { AddressState } from '@/lib/types';

/**
 * maplibre-gl v5 resolves to named exports under CJS and a default-only object under ESM,
 * so a plain namespace import works in one and throws in the other. Reading through
 * `default` when it exists covers both.
 */
const maplibregl = ((maplibreNs as unknown as { default?: typeof maplibreNs }).default ??
  maplibreNs) as typeof maplibreNs;

const PAPER = '#f4efe6';
const CONTEXT = '#7d8a96';
const LABELS = 'basemap-labels';

/**
 * The frame is locked to Pacific Palisades. This board covers one incident, so panning off
 * to Burbank or zooming out to the whole county is never useful and only invites the map to
 * be read as more than it is. Derived from the perimeter with a margin, not a guessed box.
 */
const FRAME_MARGIN = { lat: 0.013, lng: 0.016 };

function lockedBounds(): [[number, number], [number, number]] {
  const lats = PERIMETER.map((p) => p[0]);
  const lngs = PERIMETER.map((p) => p[1]);
  return [
    [Math.min(...lngs) - FRAME_MARGIN.lng, Math.min(...lats) - FRAME_MARGIN.lat],
    [Math.max(...lngs) + FRAME_MARGIN.lng, Math.max(...lats) + FRAME_MARGIN.lat],
  ];
}

/** Below this the region stops filling the frame; above it, overzoomed tiles go soft. */
const MIN_ZOOM = 12;
const MAX_ZOOM = 18;

/** The vector source's own top zoom. Past it MapLibre overzooms the z14 tiles. */
const SOURCE_MAX_ZOOM = 14;

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

const lngToTileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);

const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Pull every basemap tile the locked frame can ever show into the browser's HTTP cache.
 *
 * Because the view cannot leave Pacific Palisades, that whole set is about 54 tiles across
 * z12–14 — small enough to fetch once up front. Without this, zooming out requests a ring of
 * cold tiles at the edges and they arrive late; with it they are already on disk, so the
 * edges are there as soon as they are drawn.
 *
 * Fire-and-forget: a failure here costs nothing, since MapLibre fetches tiles itself anyway.
 */
async function warmTiles(bounds: [[number, number], [number, number]], signal: AbortSignal) {
  let template: string | undefined;
  try {
    const res = await fetch(TILEJSON_URL, { signal });
    template = ((await res.json()) as { tiles?: string[] }).tiles?.[0];
  } catch {
    return;
  }
  if (!template) return;

  const [[west, south], [east, north]] = bounds;
  const urls: string[] = [];
  for (let z = Math.floor(MIN_ZOOM); z <= SOURCE_MAX_ZOOM; z += 1) {
    for (let x = lngToTileX(west, z); x <= lngToTileX(east, z); x += 1) {
      for (let y = latToTileY(north, z); y <= latToTileY(south, z); y += 1) {
        urls.push(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
      }
    }
  }

  // Six at a time: enough to finish quickly, few enough to leave the visible tiles priority.
  const queue = urls.values();
  const worker = async () => {
    for (const url of queue) {
      if (signal.aborted) return;
      try {
        await fetch(url, { signal, cache: 'force-cache', mode: 'cors' });
      } catch {
        /* One cold tile is not worth failing over. */
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/**
 * The basemap carries real detail — landcover, building footprints, the full road network
 * and street names — because an officer reads this to find a house, not to admire it. The
 * vector source tops out at z14 and MapLibre overzooms past that, which stays sharp since
 * the geometry is scaled rather than resampled.
 */
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
    { id: 'bg', type: 'background', paint: { 'background-color': '#f1ece2' } },

    // Hillside and canyon vegetation: most of what burns here, and what makes the
    // Highlands and Rustic Canyon read as terrain rather than blank paper.
    { id: 'landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'scrub', 'forest']]],
      paint: { 'fill-color': '#e6e6d2', 'fill-opacity': 0.75 } },
    { id: 'landuse-residential', type: 'fill', source: 'basemap', 'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
      paint: { 'fill-color': '#efe9dd', 'fill-opacity': 0.7 } },
    { id: 'park', type: 'fill', source: 'basemap', 'source-layer': 'park',
      paint: { 'fill-color': '#dfe3cc', 'fill-opacity': 0.8 } },
    { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water',
      paint: { 'fill-color': '#cfd8d5' } },
    { id: 'waterway', type: 'line', source: 'basemap', 'source-layer': 'waterway',
      paint: { 'line-color': '#cfd8d5', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 2] } },

    // Footprints at the zoom an officer actually works at.
    { id: 'buildings', type: 'fill', source: 'basemap', 'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-color': '#e6ded0',
        'fill-outline-color': '#dbd2c2',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 0.9],
      } },

    { id: 'roads-service', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      minzoom: 14,
      filter: ['in', ['get', 'class'], ['literal', ['service', 'track', 'path']]],
      paint: { 'line-color': '#e8e1d5', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 3] } },
    { id: 'roads-minor', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'tertiary']]],
      paint: { 'line-color': '#e2dace', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 2.2, 18, 7] } },
    { id: 'roads-major', type: 'line', source: 'basemap', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': '#d6ccba', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 14, 3, 18, 10] } },

    // Street names: the difference between a picture and something you can navigate.
    { id: 'street-labels', type: 'symbol', source: 'basemap', 'source-layer': 'transportation_name',
      minzoom: 14,
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9.5, 17, 12],
        'symbol-placement': 'line',
        'text-max-angle': 35,
        'text-letter-spacing': 0.02,
      },
      paint: { 'text-color': '#8a8173', 'text-halo-color': PAPER, 'text-halo-width': 1.3 } },

    { id: LABELS, type: 'symbol', source: 'basemap', 'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'neighbourhood']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 8,
      },
      paint: { 'text-color': '#6f665a', 'text-halo-color': PAPER, 'text-halo-width': 1.4 } },
  ],
};

interface BuildingFile {
  /** Flat [lng, lat, lng, lat, …] rings, one per building. */
  rings: number[][];
  /** [lat, lng] centroid per building, same order and rounding as the household sites. */
  cent: [number, number][];
  zone: number[];
  zones: string[];
}

/** Key a household to its outline. Both sides round to 5dp, so this matches exactly. */
const siteKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

interface Outlines {
  /** Footprint ring per household centroid. */
  bySite: Map<string, [number, number][]>;
  /** Every dwelling in the perimeter, for the context layer. */
  all: [number, number][][];
}

async function loadOutlines(signal: AbortSignal): Promise<Outlines | null> {
  try {
    const res = await fetch('/buildings.json', { signal, cache: 'no-cache' });
    if (!res.ok) return null;
    const file = (await res.json()) as BuildingFile;
    const bySite = new Map<string, [number, number][]>();
    const all: [number, number][][] = [];
    file.rings.forEach((flat, i) => {
      const ring: [number, number][] = [];
      for (let j = 0; j < flat.length; j += 2) ring.push([flat[j], flat[j + 1]]);
      if (ring.length < 3) return;
      ring.push(ring[0]);
      all.push(ring);
      const c = file.cent[i];
      if (c) bySite.set(siteKey(c[0], c[1]), ring);
    });
    return { bySite, all };
  } catch {
    // The map still works without outlines: households fall back to points.
    return null;
  }
}

/** GeoJSON wants [lng, lat]; everything else in this app is [lat, lng]. */
const toLngLat = ([lat, lng]: LatLngTuple): [number, number] => [lng, lat];

const metresToDegrees = (metres: number, lat: number) => ({
  lat: metres / 111_320,
  lng: metres / (111_320 * Math.cos((lat * Math.PI) / 180)),
});

export function ZoneMap({
  addresses,
  now,
  focusId,
  onSelect,
}: {
  addresses: AddressState[];
  now: number;
  focusId: string | null;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  // Latest data, so the load handler can paint whatever has arrived by then.
  const dataRef = useRef({ addresses, now });
  dataRef.current = { addresses, now };
  const outlinesRef = useRef<Outlines | null>(null);

  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    // A browser without WebGL2 makes the constructor throw; show why instead of losing the page.
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: hostRef.current,
        style: BASE_STYLE,
        center: [-118.545, 34.055],
        zoom: 12.8,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // Hard stop: the view cannot leave the incident.
        maxBounds: lockedBounds(),
        // No cross-fade between zoom levels: on an operations board a tile that is there
        // should be drawn, not eased in over 300ms.
        fadeDuration: 0,
        // The locked region is a few dozen tiles, so nothing ever needs evicting.
        maxTileCacheSize: 400,
        refreshExpiredTiles: false,
        attributionControl: { compact: true },
      });
    } catch (e) {
      setMapError(describeMapError(e));
      return;
    }
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    const warm = new AbortController();
    void warmTiles(lockedBounds(), warm.signal);

    // Real OpenStreetMap dwelling outlines. The free vector basemap drops most small
    // buildings at z14, which is why the neighbourhood looks empty without this.
    void loadOutlines(warm.signal).then((outlines) => {
      if (!outlines || warm.signal.aborted) return;
      outlinesRef.current = outlines;
      const map = mapRef.current;
      if (!map || !readyRef.current) return;
      const context = map.getSource('context-buildings') as maplibregl.GeoJSONSource | undefined;
      context?.setData({
        type: 'FeatureCollection',
        features: outlines.all.map((ring) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring] },
        })),
      });
      paint(map, dataRef.current.addresses, dataRef.current.now, outlines);
    });

    map.on('load', () => {
      map.addSource('perimeter', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[...PERIMETER.map(toLngLat), toLngLat(PERIMETER[0])]] },
        },
      });
      map.addSource('context-buildings', { type: 'geojson', data: emptyCollection() });
      map.addSource('households', { type: 'geojson', data: emptyCollection() });
      // Stand in for the outlines when zoomed out far enough that a footprint is smaller
      // than a pixel.
      map.addSource('household-points', { type: 'geojson', data: emptyCollection() });

      map.addLayer({
        id: 'perimeter-fill', type: 'fill', source: 'perimeter',
        paint: { 'fill-color': '#9b2c1f', 'fill-opacity': 0.04 },
      }, LABELS);
      map.addLayer({
        id: 'perimeter-line', type: 'line', source: 'perimeter',
        paint: { 'line-color': '#9b2c1f', 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [4, 3] },
      }, LABELS);

      // Every dwelling the perimeter contains, including the ones with no record. Grey, the
      // way the reference greys parcels outside the current filter: present, not tracked.
      map.addLayer({
        id: 'context-buildings', type: 'fill', source: 'context-buildings',
        minzoom: 13.5,
        paint: {
          'fill-color': CONTEXT,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, 0.28],
          'fill-outline-color': '#b9c2cb',
        },
      }, LABELS);

      // The tracked households, drawn as the actual shape of the house.
      map.addLayer({
        id: 'household-fill', type: 'fill', source: 'households',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fillOpacity'] },
      }, LABELS);
      map.addLayer({
        id: 'household-line', type: 'line', source: 'households',
        minzoom: 14,
        paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.9 },
      }, LABELS);

      // Below the zoom where a footprint covers more than a pixel or two, dots read better.
      map.addLayer({
        id: 'household-points', type: 'circle', source: 'household-points',
        maxzoom: 15,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.6, 14, 3, 15, 4.5],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 14, ['get', 'dotOpacity'], 15, 0],
          'circle-stroke-width': 0,
        },
      });

      map.on('click', 'household-fill', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = String(f.properties?.id ?? '');
        selectRef.current(id);
        new maplibregl.Popup({ offset: 12, closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(String(f.properties?.popup ?? ''))
          .addTo(map);
      });
      map.on('mouseenter', 'household-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'household-fill', () => { map.getCanvas().style.cursor = ''; });

      map.fitBounds(boundsOf(PERIMETER), { padding: 28, animate: false });

      readyRef.current = true;
      paint(map, dataRef.current.addresses, dataRef.current.now, outlinesRef.current);
    });

    return () => {
      readyRef.current = false;
      warm.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Repaint on data or clock change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    paint(map, addresses, now, outlinesRef.current);
  }, [addresses, now]);

  // Clicking a row in the lists flies to that household.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !focusId) return;
    const row = addresses.find((a) => a.id === focusId);
    if (!row) return;
    map.flyTo({ center: [row.lng, row.lat], zoom: Math.max(map.getZoom(), 15), speed: 1.4 });
    new maplibregl.Popup({ offset: 12 })
      .setLngLat([row.lng, row.lat])
      .setHTML(popupHtml(row, now))
      .addTo(map);
    // `now` ticks every 15s and would otherwise reopen the popup on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  if (mapError) {
    return (
      <div role="alert" className="flex h-full w-full items-center justify-center p-6 text-center text-sm leading-relaxed text-muted">
        {mapError}
      </div>
    );
  }
  return <div ref={hostRef} className="h-full w-full" role="application" aria-label="Palisades evacuation map" />;
}

const emptyCollection = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

function boundsOf(ring: LatLngTuple[]): [[number, number], [number, number]] {
  const lats = ring.map((p) => p[0]);
  const lngs = ring.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function paint(
  map: MlMap,
  addresses: AddressState[],
  now: number,
  outlines: Outlines | null,
): void {
  if (addresses.length === 0) return;

  const households = map.getSource('households') as maplibregl.GeoJSONSource | undefined;
  const points = map.getSource('household-points') as maplibregl.GeoJSONSource | undefined;
  if (!households || !points) return;

  // One feature per household, carrying the real outline of its building. A household whose
  // outline is missing falls back to a small square so it is never invisible.
  households.setData({
    type: 'FeatureCollection',
    features: addresses.map((a) => {
      const ring = outlines?.bySite.get(siteKey(a.lat, a.lng)) ?? squareAround(a.lat, a.lng);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          id: a.id,
          color: HOUSE_COLOR[houseColor(a, now)],
          fillOpacity: 0.85,
          popup: popupHtml(a, now),
        },
      } satisfies GeoJSON.Feature;
    }),
  });

  points.setData({
    type: 'FeatureCollection',
    features: addresses.map((a) => {
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
        properties: {
          color: HOUSE_COLOR[houseColor(a, now)],
          dotOpacity: 0.9,
        },
      } satisfies GeoJSON.Feature;
    }),
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

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function popupHtml(a: AddressState, now: number): string {
  const damage =
    a.structure === 'unassessed'
      ? ''
      : `<div style="margin-top:5px;font:500 11px/1.2 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:${
          a.structure === 'destroyed' ? '#9b2c1f' : '#7a4f0e'
        }">${STRUCTURE_LABEL[a.structure]}</div>`;
  const note = a.note
    ? `<div style="margin-top:6px;padding-left:8px;border-left:2px solid #9b2c1f66;color:#6f665a">${escapeHtml(a.note)}</div>`
    : '';
  return `
    <div style="min-width:210px">
      <div style="font:500 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6f665a">${escapeHtml(
        ZONE_NAMES[a.zone_id] ?? a.zone_id,
      )}</div>
      <div style="margin-top:4px;font-family:'Libre Caslon Display',Georgia,serif;font-size:17px;line-height:1.2;color:#1f1a14">${escapeHtml(
        a.address,
      )}</div>
      <div style="margin-top:2px;color:#6f665a">${escapeHtml(a.resident_name)}</div>
      <div style="margin-top:7px;color:${HOUSE_COLOR[houseColor(a, now)]};font-weight:600">${STATUS_LABEL[a.status]}${a.color_reason ? ` · ${a.color_reason}` : ''}</div>
      <div style="color:#6f665a">${escapeHtml(reasonOf(a, now))}</div>
      ${damage}
      ${note}
    </div>`;
}

export { CONTEXT };
