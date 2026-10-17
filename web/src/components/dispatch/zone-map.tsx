'use client';

// Raw Leaflet rather than react-leaflet: fewer moving parts, no React 19 peer-dep risk, and
// leaflet.heat is an imperative plugin anyway. The map is created once and the layers are
// updated in place, so a status change repaints without the view jumping.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { PERIMETER, ZONE_NAMES } from '@/lib/addresses';
import {
  URGENCY_COLOR,
  URGENCY_WEIGHT,
  reasonOf,
  urgencyOf,
  zoneSummaries,
} from '@/lib/priority';
import { STATUS_LABEL, STRUCTURE_LABEL } from '@/lib/types';
import type { AddressState } from '@/lib/types';

export type MapMode = 'heat' | 'zones';

/**
 * A sequential warm ramp, not a green-to-red one. Green-to-red is the convention in
 * emergency ops but it is also the worst case for red-green colourblindness: a deuteranope
 * cannot tell the safe end from the dangerous end. Here low density simply fades to nothing,
 * so "no heat" means the block is handled, and the ramp climbs yellow → orange → red with
 * falling lightness, which reads as one direction to everyone.
 */
const HEAT_GRADIENT: Record<number, string> = {
  0.0: 'rgba(253,224,71,0)',
  0.3: 'rgba(253,224,71,0.45)',
  0.55: URGENCY_COLOR.watch,
  0.78: URGENCY_COLOR.high,
  1.0: URGENCY_COLOR.critical,
};

export function ZoneMap({
  addresses,
  mode,
  now,
  focusId,
  onSelect,
}: {
  addresses: AddressState[];
  mode: MapMode;
  now: number;
  focusId: string | null;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.HeatLayer | null>(null);
  const zoneLayerRef = useRef<L.LayerGroup | null>(null);
  const dotLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: [34.045, -118.545],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    L.polygon(PERIMETER, {
      color: URGENCY_COLOR.critical,
      weight: 2,
      opacity: 0.85,
      dashArray: '8 6',
      fill: true,
      fillColor: URGENCY_COLOR.critical,
      fillOpacity: 0.05,
      interactive: false,
    })
      .addTo(map)
      .bindTooltip('Active fire perimeter', { sticky: true });

    heatRef.current = L.heatLayer([], {
      radius: 42,
      blur: 28,
      max: 1,
      minOpacity: 0.25,
      maxZoom: 15,
      gradient: HEAT_GRADIENT,
    });
    zoneLayerRef.current = L.layerGroup();
    dotLayerRef.current = L.layerGroup().addTo(map);

    map.fitBounds(L.polygon(PERIMETER).getBounds(), { padding: [24, 24] });

    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      heatRef.current = null;
      zoneLayerRef.current = null;
      dotLayerRef.current = null;
      markers.clear();
    };
  }, []);

  // Swap which overlay is showing.
  useEffect(() => {
    const map = mapRef.current;
    const heat = heatRef.current;
    const zones = zoneLayerRef.current;
    if (!map || !heat || !zones) return;

    if (mode === 'heat') {
      zones.remove();
      heat.addTo(map);
    } else {
      heat.remove();
      zones.addTo(map);
    }
  }, [mode]);

  // Repaint on every status change.
  useEffect(() => {
    const map = mapRef.current;
    const dots = dotLayerRef.current;
    const zones = zoneLayerRef.current;
    if (!map || !dots || !zones || addresses.length === 0) return;

    heatRef.current?.setLatLngs(
      addresses.map((a) => [a.lat, a.lng, URGENCY_WEIGHT[urgencyOf(a, now)]] as [number, number, number]),
    );

    zones.clearLayers();
    for (const zone of zoneSummaries(addresses, now)) {
      const members = addresses.filter((a) => a.zone_id === zone.zone_id);
      // A circle wide enough to hold the zone's addresses, with a little air around them.
      const radius = Math.max(
        320,
        ...members.map((a) => map.distance([zone.lat, zone.lng], [a.lat, a.lng])),
      ) * 1.25;

      L.circle([zone.lat, zone.lng], {
        radius,
        color: URGENCY_COLOR[zone.urgency],
        weight: 2,
        opacity: 0.8,
        fillColor: URGENCY_COLOR[zone.urgency],
        fillOpacity: zone.urgency === 'clear' ? 0.06 : 0.18,
        interactive: false,
      }).addTo(zones);

      L.marker([zone.lat, zone.lng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:600 11px/1.1 var(--font-sans);letter-spacing:.06em;text-transform:uppercase;color:${URGENCY_COLOR[zone.urgency]};text-shadow:0 1px 3px #000">${zone.zone_id} · ${zone.unresolved}/${zone.total}</div>`,
          iconSize: [0, 0],
        }),
      }).addTo(zones);
    }

    dots.clearLayers();
    markersRef.current.clear();
    const small = mode === 'heat';
    for (const a of addresses) {
      const urgency = urgencyOf(a, now);
      const marker = L.circleMarker([a.lat, a.lng], {
        radius: small ? 4 : 7,
        color: '#0b0f14',
        weight: small ? 1 : 1.5,
        fillColor: URGENCY_COLOR[urgency],
        // Kept visible over the heat blobs so every address stays clickable.
        fillOpacity: small ? 0.9 : 1,
      })
        .bindPopup(popupHtml(a, now))
        .on('click', () => selectRef.current(a.id))
        .addTo(dots);
      markersRef.current.set(a.id, marker);
    }
  }, [addresses, now, mode]);

  // Clicking a row in the lists pans to the address and opens its popup.
  useEffect(() => {
    if (!focusId) return;
    const marker = markersRef.current.get(focusId);
    const map = mapRef.current;
    if (!marker || !map) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
    marker.openPopup();
  }, [focusId]);

  return <div ref={hostRef} className="h-full w-full" role="application" aria-label="Zone priority map" />;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function popupHtml(a: AddressState, now: number): string {
  const urgency = urgencyOf(a, now);
  const damage =
    a.structure === 'unassessed'
      ? ''
      : `<div style="margin-top:4px;color:${a.structure === 'destroyed' ? URGENCY_COLOR.critical : URGENCY_COLOR.watch}">Structure: ${STRUCTURE_LABEL[a.structure]}</div>`;
  const note = a.note
    ? `<div style="margin-top:6px;padding-left:8px;border-left:2px solid ${URGENCY_COLOR.critical}99">${escapeHtml(a.note)}</div>`
    : '';
  return `
    <div style="min-width:200px">
      <div style="font-weight:600">${escapeHtml(a.address)}</div>
      <div style="color:var(--muted);margin-top:2px">${escapeHtml(a.resident_name)} · ${escapeHtml(ZONE_NAMES[a.zone_id] ?? a.zone_id)}</div>
      <div style="margin-top:6px;color:${URGENCY_COLOR[urgency]};font-weight:600">${STATUS_LABEL[a.status]}</div>
      <div style="color:var(--muted)">${escapeHtml(reasonOf(a, now))}</div>
      ${damage}
      ${note}
    </div>`;
}
