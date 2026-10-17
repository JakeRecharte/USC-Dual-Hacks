// Live call state keyed by Retell call_id. Feeds the console's live-calls panel and the
// concurrent-sessions count. In memory on purpose; Supabase persistence is Person B's.
import { EventEmitter } from 'node:events';

// One bus, two sources: real Retell traffic and the synthetic generator both emit here.
export const bus = new EventEmitter();

const sessions = new Map();

export function upsert(callId, patch) {
  const s = sessions.get(callId) || { call_id: callId, signals: [], lane: null, ended_at: null };
  Object.assign(s, patch);
  sessions.set(callId, s);
  return s;
}

export function addSignal(callId, signal, decision) {
  const s = upsert(callId, {});
  s.signals.push({ ...signal, lane: decision.lane });
  s.lane = decision.lane;
  return s;
}

export const all = () => [...sessions.values()];
export const active = () => all().filter((s) => !s.ended_at);
