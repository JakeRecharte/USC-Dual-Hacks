// house_events (docs/sql/house_colors.sql): a Retell call registered a house or changed its colour.
import type { HouseColor } from './types';

export interface HouseEvent {
  id: string;
  address: string;
  color: HouseColor;
  previous_color: HouseColor | null;
  first_call: boolean;
  reason: string | null;
  created_at: string;
}

const LABEL: Record<HouseColor, string> = { red: 'RED', yellow: 'YELLOW', green: 'GREEN' };

/** One line for the alert: what Retell did to the house. */
export function headline(e: Pick<HouseEvent, 'address' | 'color' | 'previous_color' | 'first_call'>): string {
  if (e.first_call || !e.previous_color) return `Retell registered ${e.address} as ${LABEL[e.color]}`;
  return `Retell changed ${e.address}: ${LABEL[e.previous_color]} → ${LABEL[e.color]}`;
}
