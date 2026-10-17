import { NextResponse } from 'next/server';
import { roleFromRequest } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';

/**
 * A dispatcher confirms or dismisses one suggested resource. Appends to suggestion_decisions
 * (the audit trail); never edits calls. Dispatch role only, and the suggestion must exist on
 * that call right now, so a stale screen can't confirm something the line no longer suggests.
 */
export async function POST(req: Request) {
  const role = await roleFromRequest(req);
  if (role !== 'dispatch') return NextResponse.json({ error: 'dispatchers only' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const callId = String(body?.call_id ?? '');
  const suggestionId = String(body?.suggestion_id ?? '');
  const decision = body?.decision;
  if (!callId || !suggestionId || (decision !== 'confirmed' && decision !== 'dismissed')) {
    return NextResponse.json({ error: 'send call_id, suggestion_id and decision (confirmed|dismissed)' }, { status: 400 });
  }

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: 'database not configured' }, { status: 503 });

  const { data: call, error: readError } = await db.from('calls').select('suggestions').eq('call_id', callId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  const suggestion = ((call?.suggestions ?? []) as { id: string; resource: string }[]).find((s) => s.id === suggestionId);
  if (!suggestion) return NextResponse.json({ error: 'that suggestion is no longer on this call' }, { status: 409 });

  const row = { call_id: callId, suggestion_id: suggestionId, resource: suggestion.resource, decision, decided_by: role };
  const { data, error } = await db.from('suggestion_decisions').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, decision: data });
}
