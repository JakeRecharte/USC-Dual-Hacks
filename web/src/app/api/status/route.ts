import { NextResponse } from 'next/server';
import { ROLE_COOKIE, roleFromCookie } from '@/lib/auth';
import { applyUpdate, type StatusUpdate } from '@/lib/server-store';
import type { Status, Structure } from '@/lib/types';

const STATUSES: Status[] = ['cleared', 'refused', 'no_answer', 'self_out', 'in_transit', 'unknown'];
const STRUCTURES: Structure[] = ['intact', 'damaged', 'destroyed', 'unassessed'];

/**
 * Accepts one update or an array of them. The array form is what the officer page's offline
 * queue flushes when signal comes back, which is why each item carries its own
 * `recorded_at`: the time the officer tapped, not the time it reached us.
 */
export async function POST(req: Request) {
  const role = await roleFromCookie(
    req.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ROLE_COOKIE}=`))
      ?.slice(ROLE_COOKIE.length + 1),
  );
  if (role !== 'officer') return NextResponse.json({ error: 'officers only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const items: unknown[] = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 200) {
    return NextResponse.json({ error: 'send 1 to 200 updates' }, { status: 400 });
  }

  const applied = [];
  const rejected: { index: number; reason: string }[] = [];

  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const update: StatusUpdate = { address_id: String(item.address_id ?? '') };

    if (!update.address_id) {
      rejected.push({ index, reason: 'missing address_id' });
      continue;
    }
    if (item.status !== undefined) {
      if (!STATUSES.includes(item.status as Status)) {
        rejected.push({ index, reason: `status not in the contract: ${String(item.status)}` });
        continue;
      }
      update.status = item.status as Status;
    }
    if (item.structure !== undefined) {
      if (!STRUCTURES.includes(item.structure as Structure)) {
        rejected.push({ index, reason: `unknown structure: ${String(item.structure)}` });
        continue;
      }
      update.structure = item.structure as Structure;
    }
    if (!update.status && !update.structure) {
      rejected.push({ index, reason: 'nothing to change' });
      continue;
    }
    if (typeof item.note === 'string') update.note = item.note.slice(0, 280) || null;
    if (typeof item.recorded_at === 'string' && Number.isFinite(Date.parse(item.recorded_at))) {
      update.recorded_at = item.recorded_at;
    }

    const row = applyUpdate({ ...update, source: 'officer' });
    if (row) applied.push(row);
    else rejected.push({ index, reason: 'address not on record' });
  }

  return NextResponse.json({ applied, rejected, now: Date.now() });
}
