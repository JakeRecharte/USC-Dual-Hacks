// The house colour rule, run on the scenario's clock.
//
// Live, Supabase decides each house's colour (public.house_color in docs/sql/house_colors_v2.sql)
// whenever status_log or calls change. The scenario has no database, so this is the same rule in
// TypeScript, with "now" being the simulated time. test/scenario.test.ts runs both sides of the
// rule's table so the two cannot quietly drift apart.
//
//   red     refused (staying), or an urgent call newer than the latest status
//   green   cleared / self_out within the last two hours (the scenario passes six)
//   grey    cleared / self_out older than that, or never checked
//   orange  last knock got no answer
//   yellow  evacuating (in_transit), including a relative's unverified "they got out"
//
// Value imports carry .ts because the tests load this through Node's own loader.
import { FRESH_MIN } from '../priority.ts';
import type { HouseColor, Status } from '../types';

export interface ColorInput {
  status: Status;
  /** When the newest status was recorded, in ms. Null = never checked. */
  checkedAt: number | null;
  /** When the newest urgent call about this house arrived, in ms. Null = none. */
  urgentCallAt: number | null;
}

export interface Coloured {
  color: HouseColor;
  reason: string;
}

export function simHouseColor({ status, checkedAt, urgentCallAt }: ColorInput, now: number, freshMin: number = FRESH_MIN): Coloured {
  // An urgent call only counts until a NEWER status arrives for the house.
  const urgent = urgentCallAt !== null && (checkedAt === null || urgentCallAt > checkedAt);
  const fresh = checkedAt !== null && checkedAt >= now - freshMin * 60_000;
  const cleared = status === 'cleared' || status === 'self_out';

  if (status === 'refused') return { color: 'red', reason: 'people at this house are staying' };
  if (urgent) return { color: 'red', reason: 'a caller about this house needed a person now' };
  if (cleared && fresh) {
    return { color: 'green', reason: status === 'self_out' ? 'resident reported out' : 'checked and cleared' };
  }
  if (cleared) return { color: 'grey', reason: `last check is more than ${freshMin / 60} hours old` };
  if (status === 'no_answer') return { color: 'orange', reason: 'last knock got no answer' };
  if (status === 'in_transit') return { color: 'yellow', reason: 'reported leaving, no follow-up' };
  return { color: 'grey', reason: 'no verified record' };
}
