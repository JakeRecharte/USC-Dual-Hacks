// Shared status store for both portals.
//
// Why this exists: during the demo the officer is on a phone and the dispatcher is on a
// laptop. They are different browsers, so a tap has to travel through the server to reach
// the board. This holds the newest status per address in memory and pushes every change to
// subscribers over SSE.
//
// It is deliberately the ONLY place that writes status. When P2's `update_status` is live,
// set BACKEND_URL and `applyUpdate` forwards there too; swap `seedAddresses()` for a
// Supabase read and the portals are unchanged.
import { EventEmitter } from 'node:events';
import { seedAddresses } from './addresses';
import type { AddressState, Source, Status, Structure } from './types';

export interface StatusUpdate {
  address_id: string;
  status?: Status;
  structure?: Structure;
  note?: string | null;
  source?: Source;
  /** Set by the officer page's offline queue: when the tap actually happened. */
  recorded_at?: string;
}

interface Store {
  addresses: Map<string, AddressState>;
  bus: EventEmitter;
  seededAt: number;
}

// Next's dev server re-evaluates modules on edit; without this the board resets mid-demo.
const globalRef = globalThis as unknown as { __lineStore?: Store };

function create(): Store {
  const bus = new EventEmitter();
  bus.setMaxListeners(100);
  return {
    addresses: new Map(seedAddresses().map((a) => [a.id, a])),
    bus,
    seededAt: Date.now(),
  };
}

const store: Store = (globalRef.__lineStore ??= create());

export const bus = store.bus;

export const allAddresses = (): AddressState[] => [...store.addresses.values()];

export const getAddress = (id: string): AddressState | undefined => store.addresses.get(id);

/**
 * Apply one officer tap. Returns the updated row, or null if the address is unknown.
 * Status and structure are independent: an officer can mark a house destroyed without
 * touching the evacuation status, and vice versa.
 */
export function applyUpdate(update: StatusUpdate): AddressState | null {
  const current = store.addresses.get(update.address_id);
  if (!current) return null;

  const at = update.recorded_at ?? new Date().toISOString();
  const next: AddressState = { ...current };

  if (update.status) {
    next.status = update.status;
    next.source = update.source ?? 'officer';
    next.recorded_at = at;
    // A note belongs to the status read that carried it, so a new status clears the old note.
    next.note = update.note ?? null;
  } else if (update.note !== undefined) {
    next.note = update.note;
  }

  if (update.structure) {
    next.structure = update.structure;
    next.structure_recorded_at = at;
  }

  store.addresses.set(next.id, next);
  bus.emit('status', next);
  void forwardToBackend(update, at);
  return next;
}

/** Puts the fake data back. The reset button on the board, before every demo run. */
export function resetStore(): AddressState[] {
  store.addresses = new Map(seedAddresses().map((a) => [a.id, a]));
  store.seededAt = Date.now();
  const rows = allAddresses();
  bus.emit('reset', rows);
  return rows;
}

/**
 * Best-effort mirror into P2's `update_status`. Fire-and-forget on purpose: the board must
 * stay responsive even when the backend is down, which on demo day it might be.
 */
async function forwardToBackend(update: StatusUpdate, at: string): Promise<void> {
  const base = process.env.BACKEND_URL;
  if (!base || !update.status) return;
  try {
    await fetch(`${base.replace(/\/$/, '')}/update_status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address_id: update.address_id,
        status: update.status,
        source: update.source ?? 'officer',
        note: update.note ?? null,
        recorded_at: at,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Swallowed: the in-memory store is the demo's source of truth.
  }
}
