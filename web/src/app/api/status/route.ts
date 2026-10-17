import { NextResponse } from 'next/server';
import { roleFromRequest } from '@/lib/auth';
import { applyUpdate, type StatusUpdate } from '@/lib/server-store';
import { configProblem, serviceClient, supabaseConfigured } from '@/lib/supabase';
import { writeStatus } from '@/lib/supabase-data';
import type { Status, Structure } from '@/lib/types';

const STATUSES: Status[] = ['cleared', 'refused', 'no_answer', 'self_out', 'in_transit', 'unknown'];
const STRUCTURES: Structure[] = ['intact', 'damaged', 'destroyed', 'unassessed'];

/**
 * Accepts one update or an array of them. The array form is what the officer page's offline
 * queue flushes when signal comes back, which is why each item carries its own
 * `recorded_at`: the time the officer tapped, not the time it reached us.
 */
export async function POST(req: Request) {
  const role = await roleFromRequest(req);
  if (role !== 'officer') return NextResponse.json({ error: 'officers only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const items: unknown[] = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 200) {
    return NextResponse.json({ error: 'send 1 to 200 updates' }, { status: 400 });
  }

  const applied: unknown[] = [];
  const rejected: { index: number; reason: string }[] = [];
  const updates: { index: number; update: StatusUpdate }[] = [];

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

    updates.push({ index, update: { ...update, source: 'officer' as const } });
  }

  // Supabase mode: the database is the shared source of truth, so Vercel's serverless
  // instances do not need to agree about anything. The officer page repaints optimistically
  // and the dispatcher hears about it over Realtime, straight from Postgres.
  if (supabaseConfigured) {
    const client = serviceClient();
    if (!client) {
      return NextResponse.json(
        { error: configProblem() ?? 'Supabase is configured but unusable.' },
        { status: 503 },
      );
    }
    for (const { index, update } of updates) {
      const result = await writeStatus(client, update);
      if (result.ok) applied.push(update.address_id);
      else rejected.push({ index, reason: result.reason });
    }
    return NextResponse.json({ applied, rejected, mode: 'supabase', now: Date.now() });
  }

  for (const { index, update } of updates) {
    const row = applyUpdate(update);
    if (row) applied.push(row);
    else rejected.push({ index, reason: 'address not on record' });
  }

  return NextResponse.json({ applied, rejected, mode: 'memory', now: Date.now() });
}
