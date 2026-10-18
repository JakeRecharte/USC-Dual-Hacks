import Fastify from 'fastify';
import { appendFile, mkdir } from 'node:fs/promises';
import Retell, { verify } from 'retell-sdk';
import { config } from './config.js';
import { checkBypass, callerText } from './bypass.js';
import { scoreDistress, handoffInstruction } from './distress.js';
import * as sessions from './sessions.js';
import * as backend from './backend.js';
import { dbHealth } from './db.js';
import { FRESH_MIN } from './routing.js';
import { NAME_GIVE_UP, sayForLookup, sayForRouting, sayRelativeOut, sayResidentLeft, sayResidentOut } from './speech.js';
import { callerLines, earlyReport, reconcileReport } from './report-intent.js';

const app = Fastify({ logger: { level: 'info' } });
const retell = config.retellApiKey ? new Retell({ apiKey: config.retellApiKey }) : null;

// Keep the exact raw body: Retell signs the bytes, not the re-serialized JSON.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  req.rawBody = body;
  try {
    done(null, body ? JSON.parse(body) : {});
  } catch (err) {
    err.statusCode = 400;
    done(err);
  }
});

// Every inbound body goes to logs/requests.jsonl. Check the first real one against the
// field shapes below before trusting them.
await mkdir(new URL('../logs/', import.meta.url), { recursive: true });
const logBody = (route, body) =>
  appendFile(new URL('../logs/requests.jsonl', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), route, body }) + '\n').catch(() => {});

async function verifyRetell(req, reply) {
  logBody(req.url, req.body);
  if (!config.verifySignatures) return;
  const sig = req.headers['x-retell-signature'];
  const ok = sig && config.retellApiKey && (await verify(req.rawBody, config.retellApiKey, sig));
  if (!ok) {
    req.log.warn({ url: req.url, hasSig: Boolean(sig) }, 'rejected: bad x-retell-signature');
    return reply.code(401).send({ error: 'bad signature' });
  }
}

// Custom functions, called by the agent mid-conversation.
// Body is { name, call, args } (or args at root if args_at_root is on in Retell).
const argsOf = (body) => {
  const { call = {}, args: nested, name, ...rest } = body;
  // Retell's playground (eval harness) is never a real caller.
  if (call.call_id === 'playground') call.simulated = true;
  return { call, args: nested || rest };
};

// Caller's emotional state across the call. Only ever moves up: a caller who was
// panicked a minute ago is not "calm" because they caught their breath.
const STATES = ['calm', 'worried', 'distressed', 'panicked'];
const TRANSCRIPT_EVERY_MS = 4000;
function noteCallerState(callId, state, source) {
  if (!STATES.includes(state)) return sessions.get(callId)?.caller_state || null;
  const s = sessions.get(callId) || sessions.upsert(callId, {});
  const worst = STATES.indexOf(state) > STATES.indexOf(s.caller_state ?? 'calm') ? state : (s.caller_state || state);
  if (worst !== s.caller_state) {
    sessions.upsert(callId, { caller_state: worst });
    backend.patchCall(callId, { caller_state: worst });
    sessions.bus.emit('emotion', { call_id: callId, caller_state: worst, source, distress_score: s.distress_score ?? 0, now: Date.now() });
  }
  return worst;
}

// As soon as the house is identified and the caller has clearly said where the person is,
// write it, so the board changes colour mid-call. log_call confirms or takes it back.
function tryEarlyReport(callId, log) {
  const s = sessions.get(callId);
  if (!s?.lookup?.found || !s.lookup.name_match || !s.address) return;
  const early = earlyReport(callerLines(s.transcript, 4));
  if (!early) return;
  void backend.recordEarly(callId, { address: s.address, subject_name: s.subject_name, ...early }).then((r) => {
    if (r) log.info({ call_id: callId, status: r.status }, 'early report written');
  });
}

app.post('/fn/lookup_address', { preHandler: verifyRetell }, async (req, reply) => {
  const { call, args } = argsOf(req.body);
  const now = Date.now();
  const { _geo: geo, ...lookup } = await backend.lookupAddress(args, now);
  const prior = sessions.get(call.call_id);
  const misses = (prior?.name_misses ?? 0) + (lookup.found && !lookup.name_match ? 1 : 0);
  const say = lookup.found && !lookup.name_match && misses >= 2
    ? NAME_GIVE_UP
    : sayForLookup(lookup, args.subject_name, now, FRESH_MIN);

  // Answer first: the caller is listening to silence until this returns.
  reply.send({ ...lookup, say });

  setImmediate(() => {
    sessions.upsert(call.call_id, { address: args.address, subject_name: args.subject_name, lookup, name_misses: misses });
    tryEarlyReport(call.call_id, req.log);
    backend.patchCall(call.call_id, {
      address: args.address, subject_name: args.subject_name, address_id: lookup.address_id,
      lookup_found: lookup.found, lookup_status: lookup.status, name_match: lookup.name_match,
      inside_perimeter: lookup.inside_perimeter, from_number: call.from_number, simulated: Boolean(call.simulated),
      ...(geo ? { lat: geo.lat, lng: geo.lng, geo_precision: geo.precision } : {}),
    });
    noteCallerState(call.call_id, args.caller_state, 'agent');
    sessions.bus.emit('lookup', { call_id: call.call_id, address: args.address, subject_name: args.subject_name, ...lookup, now });
    req.log.info({ call_id: call.call_id, address: args.address, found: lookup.found, name_match: lookup.name_match, status: lookup.status }, 'lookup');
  });
});

app.post('/fn/log_call', { preHandler: verifyRetell }, async (req, reply) => {
  const { call, args } = argsOf(req.body);
  const now = Date.now();
  const session = sessions.get(call.call_id);
  const callerState = noteCallerState(call.call_id, args.caller_state, 'agent');
  // The agent's report fields, corrected by the caller's own words (report-intent.js).
  const { corrected, ...reported } = reconcileReport({
    reported_status: ['staying', 'out'].includes(args.reported_status) ? args.reported_status : null,
    reported_by: args.reported_by === 'resident' ? 'resident' : args.reported_by === 'relative_or_friend' ? 'relative_or_friend' : null,
    caller_update: args.caller_update || null,
  }, callerLines(session?.transcript));
  if (corrected.length) req.log.warn({ call_id: call.call_id, corrected, caller_update: args.caller_update }, 'report corrected from caller words');
  const payload = {
    mode: args.mode === 'routine' ? 'routine' : 'wildfire',
    address: args.address,
    subject_name: args.subject_name,
    with_them_now: args.with_them_now === true,
    // Emergency words heard mid-sentence count even if the agent didn't flag them.
    emergency: args.emergency === true || Boolean(session?.bypass_reason),
    emergency_reason: session?.bypass_reason || null,
    caller_update: args.caller_update || null,
    ...reported,
    reported_minutes_ago: Number.isFinite(Number(args.reported_minutes_ago)) ? Number(args.reported_minutes_ago) : 0,
    last_contact_hours: args.last_contact_hours ?? null,
    vulnerability: args.vulnerability || {},
    red_flags: args.red_flags || {},
    caller_state: callerState,
    simulated: Boolean(call.simulated),
    call_id: call.call_id,
    from_number: call.from_number,
  };
  const { row } = await backend.logCall(payload, now);
  const transfer = row.routing === 'human_now' || row.routing === 'priority_queue';

  const say = row.report_written === 'self_out' ? sayResidentOut(now)
    : row.report_written === 'in_transit'
      ? (payload.reported_by === 'resident' ? sayResidentLeft(now) : sayRelativeOut(payload.subject_name, now))
      : sayForRouting[row.routing];
  reply.send({ routing: row.routing, severity: row.severity, reason: row.reason, transfer, say });

  setImmediate(() => {
    sessions.upsert(call.call_id, { routing: row.routing, severity: row.severity, logged: true });
    sessions.bus.emit('call_logged', { ...row, simulated: Boolean(call.simulated) });
    req.log.info({ call_id: call.call_id, routing: row.routing, severity: row.severity, reason: row.reason }, 'call logged');
  });
});

// Agent calls this the moment it hears life-safety language, then calls transfer_call.
// Kept separate from log_call so the emergency path never waits on a lookup.
app.post('/fn/request_human', { preHandler: verifyRetell }, async (req, reply) => {
  const { call = {}, args: nested, name, ...rest } = req.body;
  const args = nested || rest;
  reply.send({ transfer: true, say: '' });

  setImmediate(() => {
    sessions.upsert(call.call_id, { routing: 'human_now', bypass_reason: args.reason });
    backend.patchCall(call.call_id, { bypass: true, bypass_reason: args.reason, routing: 'human_now', severity: 5,
      reason: `agent requested a person: ${args.reason}`, from_number: call.from_number, simulated: Boolean(call.simulated) });
    sessions.bus.emit('bypass', { call_id: call.call_id, from_number: call.from_number, kind: 'agent', reasons: [args.reason].filter(Boolean), now: Date.now() });
    req.log.warn({ call_id: call.call_id, reason: args.reason }, 'BYPASS requested');
  });
});

// The server can't transfer a call itself, but it can speak into the live conversation:
// updateLive injects an instruction and makes the agent respond now, interrupting it if
// it's mid-sentence. The agent then calls request_human + transfer_to_human.
function handoff(call, reasons, log) {
  if (call.simulated || !retell) return;
  retell.call.updateLive(call.call_id, {
    call_control: { additional_context: handoffInstruction(reasons), trigger_response: true },
  }).then(
    () => log.warn({ call_id: call.call_id }, 'handoff injected into live call'),
    (err) => log.error({ call_id: call.call_id, err: err.message }, 'handoff injection failed'),
  );
}

// Call lifecycle webhook: call_started, call_ended, call_analyzed.
app.post('/webhook/retell', { preHandler: verifyRetell }, async (req, reply) => {
  const { event, call = {} } = req.body;
  reply.code(204).send();

  setImmediate(() => {
    if (event === 'call_started') {
      sessions.upsert(call.call_id, {
        direction: call.direction, from_number: call.from_number, to_number: call.to_number,
        started_at: call.start_timestamp || Date.now(),
      });
      backend.patchCall(call.call_id, { status: 'in_progress', direction: call.direction, from_number: call.from_number,
        started_at: new Date(call.start_timestamp || Date.now()).toISOString(), simulated: Boolean(call.simulated) });
    } else if (event === 'transcript_updated') {
      const s = sessions.upsert(call.call_id, { transcript: call.transcript });
      tryEarlyReport(call.call_id, req.log);
      const distress = scoreDistress(call);
      if (distress.score !== (s.distress_score ?? 0)) {
        // Gauge for the board: how distressed the caller's words read, live.
        sessions.upsert(call.call_id, { distress_score: distress.score });
        backend.patchCall(call.call_id, { distress_score: distress.score });
        sessions.bus.emit('emotion', { call_id: call.call_id, caller_state: s.caller_state || null, source: 'words',
          distress_score: distress.score, reasons: distress.reasons, now: Date.now() });
      }
      // Live transcript on the row, at most every few seconds (this event fires per utterance chunk).
      if (Date.now() - (s.transcript_saved_at ?? 0) > TRANSCRIPT_EVERY_MS) {
        sessions.upsert(call.call_id, { transcript_saved_at: Date.now() });
        backend.patchCall(call.call_id, { transcript: call.transcript });
      }
      if (s.bypass_reason) return; // already escalated once; don't nag the agent

      const phrase = checkBypass(callerText(call));
      if (!phrase && !distress.distressed) return;

      const kind = phrase ? 'emergency' : 'distress';
      const reasons = phrase ? [`said "${phrase}"`] : distress.reasons;
      sessions.upsert(call.call_id, { routing: 'human_now', bypass_reason: `${kind}: ${reasons.join('; ')}` });
      backend.patchCall(call.call_id, { bypass: true, bypass_reason: `${kind}: ${reasons.join('; ')}`, routing: 'human_now',
        severity: 5, reason: `${kind} heard live: ${reasons.join('; ')}` });
      sessions.bus.emit('bypass', { call_id: call.call_id, from_number: call.from_number, kind, reasons, now: Date.now() });
      req.log.warn({ call_id: call.call_id, kind, reasons }, 'BYPASS from live transcript');
      handoff(call, reasons, req.log);
      return;
    } else if (event === 'call_ended') {
      const ended = sessions.upsert(call.call_id, {
        ended_at: call.end_timestamp || Date.now(),
        transcript: call.transcript, disconnection_reason: call.disconnection_reason,
      });
      const endedAt = call.end_timestamp || Date.now();
      backend.patchCall(call.call_id, { status: 'ended', ended_at: new Date(endedAt).toISOString(),
        duration_s: call.start_timestamp ? Math.round((endedAt - call.start_timestamp) / 1000) : null,
        disconnection_reason: call.disconnection_reason ?? null, transcript: call.transcript ?? ended.transcript ?? null });
      // Hung up before routing, or transferred on the emergency path: still gets a routing.
      if (!ended.logged) {
        const row = backend.logUnrouted(ended, call, Date.now());
        sessions.upsert(call.call_id, { routing: row.routing, logged: true });
        sessions.bus.emit('call_logged', { ...row, simulated: Boolean(call.simulated) });
        req.log.warn({ call_id: call.call_id, routing: row.routing, reason: row.reason }, 'call ended unrouted');
      }
    } else if (event === 'transfer_bridged') {
      sessions.upsert(call.call_id, { transfer: 'connected' });
      backend.patchCall(call.call_id, { transfer_status: 'connected' });
    } else if (event === 'transfer_cancelled' || event === 'transfer_ended') {
      const s = sessions.get(call.call_id);
      if (s?.transfer !== 'connected') {
        const detail = call.transfer_status || call.disconnection_reason || event;
        const row = backend.logTransferFailed(call.call_id, call.from_number ?? s?.from_number, detail, Date.now());
        sessions.upsert(call.call_id, { transfer: 'failed', routing: row.routing, logged: true });
        backend.patchCall(call.call_id, { transfer_status: 'failed' });
        sessions.bus.emit('call_logged', { ...row, simulated: Boolean(call.simulated) });
        sessions.bus.emit('transfer_failed', { call_id: call.call_id, detail, now: Date.now() });
        req.log.error({ call_id: call.call_id, detail }, 'TRANSFER FAILED: caller needs a callback');
      }
    } else if (event === 'transfer_started') {
      sessions.upsert(call.call_id, { transfer: 'ringing' });
      backend.patchCall(call.call_id, { transfer_status: 'ringing' });
    } else if (event === 'call_analyzed') {
      // Retell's post-call analysis, a few seconds after the call ends.
      const a = call.call_analysis || {};
      backend.patchCall(call.call_id, {
        summary: a.call_summary ?? null, user_sentiment: a.user_sentiment ?? null,
        recording_url: call.recording_url ?? null,
        latency_ms: call.latency?.e2e?.p50 != null ? Math.round(call.latency.e2e.p50) : null,
      });
    }
    sessions.bus.emit(event, call);
    req.log.info({ event, call_id: call.call_id }, 'lifecycle');
  });
});

// Demo reset (scripts/reset-demo.js): forget every in-memory call and session. Signed like Retell.
app.post('/dev/reset-memory', { preHandler: verifyRetell }, async () => {
  sessions.clear();
  backend.forgetAllCalls();
  return { ok: true };
});

// Eval harness only: forget the shared "playground" call between scenarios. Signed like Retell.
app.post('/dev/reset-playground', { preHandler: verifyRetell }, async () => {
  sessions.remove('playground');
  backend.forgetCall('playground');
  return { ok: true };
});

// Read side for the console until Supabase Realtime is wired up. Read-only, so open CORS.
app.addHook('onSend', async (req, reply, payload) => {
  if (req.method === 'GET') reply.header('access-control-allow-origin', '*');
  return payload;
});

const snapshot = () => ({
  active: sessions.active().length,
  sessions: sessions.all(),
  calls: backend.allCalls(),
});

app.get('/sessions', async () => ({ active: sessions.active().length, sessions: sessions.all() }));
app.get('/calls', async () => backend.allCalls());
app.get('/state', async () => snapshot());
app.get('/health', async () => ({ ok: true, data: dbHealth }));

// Server-sent events: every bus event, live. The console opens one EventSource and never
// polls. First message is a full snapshot so a reconnect starts from current state.
const STREAMED = ['lookup', 'call_logged', 'bypass', 'emotion', 'transfer_failed', 'call_started', 'call_ended', 'call_analyzed', 'house'];
// A call recoloured a house: stream it so the board paints it at once.
backend.houseEvents.on('house', (h) => sessions.bus.emit('house', h));
app.get('/events', (req, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
  const send = (type, data) => reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  send('snapshot', snapshot());

  const handlers = STREAMED.map((type) => [type, (data) => send(type, data)]);
  for (const [type, fn] of handlers) sessions.bus.on(type, fn);
  // Proxies (Railway's included) drop idle streams; a comment line every 15s keeps it open.
  const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15000);

  req.raw.on('close', () => {
    clearInterval(ping);
    for (const [type, fn] of handlers) sessions.bus.off(type, fn);
  });
});
sessions.bus.setMaxListeners(100);

if (!config.retellApiKey) app.log.warn('RETELL_API_KEY not set: signed requests will be rejected');
if (!config.verifySignatures) app.log.warn('RETELL_VERIFY=false: signature checks are OFF');

await app.listen({ port: config.port, host: '0.0.0.0' });
