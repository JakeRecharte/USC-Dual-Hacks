// Live call state keyed by Retell call_id: who they're asking about, the lookup, the routing.
// Feeds the board's live-calls panel. In memory on purpose; durable rows are P2's `calls`.
import { EventEmitter } from 'node:events';

// One bus, two sources: real Retell traffic and simulated calls both emit here.
export const bus = new EventEmitter();

const sessions = new Map();

export function upsert(callId, patch) {
  const s = sessions.get(callId) || { call_id: callId, routing: null, ended_at: null };
  Object.assign(s, patch);
  sessions.set(callId, s);
  return s;
}

export const get = (callId) => sessions.get(callId);
export const remove = (callId) => sessions.delete(callId);
export const clear = () => sessions.clear();
export const all = () => [...sessions.values()];
export const active = () => all().filter((s) => !s.ended_at);
