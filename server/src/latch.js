// Fire-once latch per cluster. Calls #6, #7, #8 all cross the threshold; only one may fan out.
//
// In memory until Supabase lands, then this becomes:
//   update clusters set alerted = true, alerted_at = now()
//   where id = $1 and alerted = false returning id
// Zero rows back = someone else already fired.
//
// The in-memory version is atomic because the check and the set happen in the same
// synchronous tick, before any await. Keep it that way.
const fired = new Set();

export async function tryLatch(clusterId) {
  if (fired.has(clusterId)) return false;
  fired.add(clusterId);
  return true;
}

export const hasFired = (clusterId) => fired.has(clusterId);
