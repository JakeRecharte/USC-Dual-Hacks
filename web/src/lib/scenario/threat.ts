// Which fire threat a household sits under, and how streets are named for it.
//
// The board reads houses.fire_threat_level from Supabase into AddressState.threat. Where that is
// absent (memory mode, or a project where `npm run apply-threat` has not run) the same research
// supplies it, matched by street the way server/scripts/apply-threat.js matches it.
import { STREET_THREAT } from './street-threat.ts';
import type { AddressState, ThreatLevel } from '../types';

export const normStreet = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "820 Chautauqua Blvd" → "chautauqua blvd". */
export const streetKeyOf = (address: string): string => normStreet(address).replace(/^\d+\s+/, '');

/** "820 Chautauqua Blvd" → "Chautauqua Blvd", for showing. */
export const streetNameOf = (address: string): string => address.replace(/^\d+\s+/, '').trim();

const BY_STREET = new Map(STREET_THREAT.map((t) => [normStreet(t.street), t]));

export const researchFor = (streetKey: string) => BY_STREET.get(streetKey) ?? null;

/** The first sentence of the research reason, which is the part a dispatcher needs. */
export function researchReason(streetKey: string): string | null {
  const reason = researchFor(streetKey)?.reason;
  if (!reason) return null;
  const first = reason.replace(/^LOWER CONFIDENCE[^:]*:\s*/i, '').split(/;\s|\.\s/)[0].trim();
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

/** Supabase's level when the board has it, else the research table's, else the lowest. */
export function threatOf(a: Pick<AddressState, 'address' | 'threat'>): ThreatLevel {
  return a.threat ?? researchFor(streetKeyOf(a.address))?.level ?? 'low';
}
