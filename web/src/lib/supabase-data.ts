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
import { PERIMETER } from './addresses.ts';
import { pointInPolygon } from './geo.ts';
import type { AddressState, Source, Status, Structure } from './types';

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
    .map((a) => {
      const latest = newest.get(a.id);
      return {
        id: a.id,
        address: a.address ?? 'Unknown address',
        lat: Number(a.lat),
        lng: Number(a.lng),
        zone_id: a.zone_id ?? 'unzoned',
        resident_name: a.resident_name ?? '',
        inside_perimeter: pointInPolygon([Number(a.lat), Number(a.lng)], PERIMETER),
        status: latest ? asStatus(latest.status) : 'unknown',
        source: latest ? asSource(latest.source) : null,
        recorded_at: latest?.recorded_at ?? null,
        note: latest?.note ?? null,
        structure: asStructure(a.structure),
        structure_recorded_at: a.structure_recorded_at ?? null,
      } satisfies AddressState;
    });
}

/** Everything the board needs, in two queries. */
export async function fetchBoard(client: SupabaseClient): Promise<AddressState[]> {
  // `structure` may not exist yet, so it is asked for separately and the request retried
  // without it rather than failing the whole board.
  let addresses: AddressRowDb[] | null = null;
  const withStructure = await client
    .from('addresses')
    .select(`${ADDRESS_COLUMNS}, structure, structure_recorded_at`);

  if (withStructure.error) {
    const plain = await client.from('addresses').select(ADDRESS_COLUMNS);
    if (plain.error) throw new Error(`addresses: ${plain.error.message}`);
    addresses = plain.data as AddressRowDb[];
  } else {
    addresses = withStructure.data as AddressRowDb[];
  }

  const statuses = await client
    .from('status_log')
    .select(STATUS_COLUMNS)
    .order('recorded_at', { ascending: false });
  if (statuses.error) throw new Error(`status_log: ${statuses.error.message}`);

  return joinRows(addresses ?? [], (statuses.data ?? []) as StatusRowDb[]);
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
