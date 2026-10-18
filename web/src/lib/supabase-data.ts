// Maps P2's tables onto the shape both portals render.
//
// Schema per docs/DATA_CONTRACT.md: `addresses` holds the household, `status_log` is
// append-only and the board wants the newest row per address. `inside_perimeter` is NOT a
// column — the contract keeps the perimeter as one polygon — so it is computed here.
//
// Everything reads defensively. A missing `structure` column degrades to "not assessed"
// rather than blanking the board, because that column is a request to P2 (see
// docs/FRONTEND_CONTRACT.md §1) and may not exist yet.

import type { SupabaseClient } from '@supabase/supabase-js';
// Explicit .ts on these two because they are value imports and the unit tests resolve this
// module through Node's own loader, which does not guess extensions. The type-only imports
// below are erased, so they need none.
import { PERIMETER } from './zones.ts';
import { pointInPolygon } from './geo.ts';
import type { AddressState, HouseColor, Source, Status, Structure } from './types';

export const ADDRESS_COLUMNS = 'id, address, lat, lng, zone_id, resident_name';
export const STATUS_COLUMNS = 'address_id, status, source, note, recorded_at';

interface AddressRowDb {
  id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  zone_id: string | null;
  resident_name: string | null;
  structure?: string | null;
  structure_recorded_at?: string | null;
}

interface StatusRowDb {
  address_id: string;
  status: string | null;
  source: string | null;
  note: string | null;
  recorded_at: string | null;
}

const STATUSES: Status[] = ['cleared', 'refused', 'no_answer', 'self_out', 'in_transit', 'unknown'];
const SOURCES: Source[] = ['officer', 'resident_reply', 'call'];
const STRUCTURES: Structure[] = ['intact', 'damaged', 'destroyed', 'unassessed'];

const asStatus = (v: unknown): Status => (STATUSES.includes(v as Status) ? (v as Status) : 'unknown');
const asSource = (v: unknown): Source | null => (SOURCES.includes(v as Source) ? (v as Source) : null);
const asStructure = (v: unknown): Structure =>
  STRUCTURES.includes(v as Structure) ? (v as Structure) : 'unassessed';

/** Join an address to its newest status_log row. */
export function joinRows(addresses: AddressRowDb[], statuses: StatusRowDb[]): AddressState[] {
  const newest = new Map<string, StatusRowDb>();
  for (const row of statuses) {
    const current = newest.get(row.address_id);
    // Rows with no timestamp lose to any row that has one.
    const t = row.recorded_at ? Date.parse(row.recorded_at) : -Infinity;
    const existing = current?.recorded_at ? Date.parse(current.recorded_at) : -Infinity;
    if (!current || t > existing) newest.set(row.address_id, row);
  }

  return addresses
    .filter((a) => a.lat != null && a.lng != null)
    // This board covers one incident. A household outside the perimeter is not filtered in
    // the UI, it never enters: whatever else the table holds, the map cannot show it.
    .filter((a) => pointInPolygon([Number(a.lat), Number(a.lng)], PERIMETER))
    .map((a) => {
      const latest = newest.get(a.id);
      return {
        id: a.id,
        address: a.address ?? 'Unknown address',
        lat: Number(a.lat),
        lng: Number(a.lng),
        zone_id: a.zone_id ?? 'unzoned',
        resident_name: a.resident_name ?? '',
        inside_perimeter: true,
        status: latest ? asStatus(latest.status) : 'unknown',
        source: latest ? asSource(latest.source) : null,
        recorded_at: latest?.recorded_at ?? null,
        note: latest?.note ?? null,
        structure: asStructure(a.structure),
        structure_recorded_at: a.structure_recorded_at ?? null,
      } satisfies AddressState;
    });
}

/**
 * Supabase returns at most 1,000 rows per request and the board has ~2,000 households and
 * more statuses than that, so every read pages until a short page comes back.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  // Four pages at a time: at ~8,000 houses one page after another was a dozen round trips
  // per read, seconds of lag every time a house changed.
  const rows: T[] = [];
  for (let from = 0; ; from += 4000) {
    const pages = await Promise.all([0, 1, 2, 3].map((k) => page(from + k * 1000, from + k * 1000 + 999)));
    for (const { data, error } of pages) {
      if (error) throw new Error(error.message);
      const chunk = (data ?? []) as T[];
      rows.push(...chunk);
      if (chunk.length < 1000) return rows;
    }
  }
}

interface HouseColorRowDb {
  id: string;
  color: string | null;
  color_reason: string | null;
}

/** Everything the board needs: every household, every status, and Supabase's colours. */
export async function fetchBoard(client: SupabaseClient): Promise<AddressState[]> {
  // `structure` may not exist yet, so it is asked for separately and the request retried
  // without it rather than failing the whole board.
  let addresses: AddressRowDb[];
  try {
    addresses = await fetchAll<AddressRowDb>((from, to) =>
      client.from('addresses').select(`${ADDRESS_COLUMNS}, structure, structure_recorded_at`).order('id').range(from, to));
  } catch {
    try {
      addresses = await fetchAll<AddressRowDb>((from, to) => client.from('addresses').select(ADDRESS_COLUMNS).order('id').range(from, to));
    } catch (e) {
      throw new Error(`addresses: ${(e as Error).message}`);
    }
  }

  let statuses: StatusRowDb[];
  try {
    statuses = await fetchAll<StatusRowDb>((from, to) =>
      client.from('status_log').select(STATUS_COLUMNS).order('recorded_at', { ascending: false }).range(from, to));
  } catch (e) {
    throw new Error(`status_log: ${(e as Error).message}`);
  }

  // Colours are optional: before house_colors.sql runs the board keeps its own status colours.
  let colors: HouseColorRowDb[] = [];
  try {
    colors = await fetchAll<HouseColorRowDb>((from, to) => client.from('houses').select('id, color, color_reason').order('id').range(from, to));
  } catch {
    colors = [];
  }

  return withColors(joinRows(addresses, statuses), colors);
}

const HOUSE_COLORS: HouseColor[] = ['green', 'yellow', 'orange', 'red', 'grey'];

/**
 * One house from a Realtime houses row: its colour and its newest status. Fields the row
 * doesn't carry stay as they were; a colour the board doesn't know is ignored.
 */
export function patchFromHouse(a: AddressState, row: Record<string, unknown>): AddressState {
  const next: AddressState = { ...a };
  if (HOUSE_COLORS.includes(row.color as HouseColor)) {
    next.color = row.color as HouseColor;
    next.color_reason = (row.color_reason as string | null) ?? null;
  }
  if (typeof row.evacuation_status === 'string') next.status = row.evacuation_status as Status;
  if ('evacuation_note' in row) next.note = (row.evacuation_note as string | null) ?? null;
  if ('evacuation_status_source' in row) next.source = (row.evacuation_status_source as AddressState['source']) ?? null;
  if ('last_checked_at' in row) next.recorded_at = (row.last_checked_at as string | null) ?? null;
  return next;
}

/** Attach Supabase's colour to each household; unknown values are ignored, not trusted. */
export function withColors(rows: AddressState[], colors: HouseColorRowDb[]): AddressState[] {
  const byId = new Map(colors.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = byId.get(r.id);
    if (!c || !HOUSE_COLORS.includes(c.color as HouseColor)) return r;
    return { ...r, color: c.color as HouseColor, color_reason: c.color_reason ?? null };
  });
}

export interface StatusWrite {
  address_id: string;
  status?: Status;
  structure?: Structure;
  note?: string | null;
  source?: Source;
  recorded_at?: string;
}

/**
 * Write one officer tap. A status is an INSERT, because `status_log` is a log and overwriting
 * history would destroy the one thing this system promises: what was recorded, and when.
 * Structure is an UPDATE on the household, since it is a current fact, not an event.
 */
export async function writeStatus(
  client: SupabaseClient,
  update: StatusWrite,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const recordedAt = update.recorded_at ?? new Date().toISOString();

  // One read before any write: a status may only be recorded against a household inside the
  // perimeter. The officer page cannot offer anything else, so reaching this means a direct
  // call to the API, and the board is not the place to record it.
  const target = await client
    .from('addresses')
    .select('lat, lng')
    .eq('id', update.address_id)
    .maybeSingle();
  if (target.error) return { ok: false, reason: `address lookup: ${target.error.message}` };
  if (!target.data) return { ok: false, reason: 'address not on record' };
  const { lat, lng } = target.data as { lat: number | null; lng: number | null };
  if (lat == null || lng == null || !pointInPolygon([Number(lat), Number(lng)], PERIMETER)) {
    return { ok: false, reason: 'address is outside the incident perimeter' };
  }

  if (update.status) {
    const { error } = await client.from('status_log').insert({
      address_id: update.address_id,
      status: update.status,
      source: update.source ?? 'officer',
      note: update.note ?? null,
      recorded_at: recordedAt,
    });
    if (error) return { ok: false, reason: `status_log insert: ${error.message}` };
  }

  if (update.structure) {
    const { error } = await client
      .from('addresses')
      .update({ structure: update.structure, structure_recorded_at: recordedAt })
      .eq('id', update.address_id);
    if (error) {
      // The column is a pending request to P2; the status half still succeeded.
      return { ok: false, reason: `structure not stored (needs the column): ${error.message}` };
    }
  }

  return { ok: true };
}
