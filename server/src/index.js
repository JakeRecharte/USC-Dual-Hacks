import Fastify from 'fastify';
import { appendFile, mkdir } from 'node:fs/promises';
import { verify } from 'retell-sdk';
import { config } from './config.js';
import { triage } from './engine-stub.js';
import { checkBypass, callerText } from './bypass.js';
import * as sessions from './sessions.js';
import * as clusters from './cluster-stub.js';
import { targetOutbound } from './targets-stub.js';
import { fanOut, allDials } from './fanout.js';

const app = Fastify({ logger: { level: 'info' } });

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

// Custom function, called by the agent mid-conversation.
// Body is { name, call, args } (or args at root if args_at_root is on in Retell).
app.post('/fn/report_incident', { preHandler: verifyRetell }, async (req, reply) => {
  const { call = {}, args: nested, name, ...rest } = req.body;
  const args = nested || rest;
  const now = Date.now();

  const signal = {
    incident_type: args.incident_type,
    street: args.street,
    cross_street: args.cross_street,
    firsthand: args.firsthand,
    people_affected: args.people_affected,
    lang: args.lang,
    call_id: call.call_id,
    from_number: call.from_number,
  };

  const decision = triage(signal, now);

  // Answer first: the caller is listening to silence until this returns.
  reply.send({ lane: decision.lane, say: decision.say, transfer: decision.lane === 'BYPASS' });

  setImmediate(() => {
    sessions.addSignal(signal.call_id, signal, decision);
    sessions.bus.emit('signal', { signal, decision, now, simulated: Boolean(call.simulated) });
    req.log.info({ call_id: signal.call_id, lane: decision.lane, signal }, 'triaged');

    // Threshold check runs after the caller already has their answer.
    const seen = clusters.observe(signal, now);
    if (!seen) return;
    sessions.bus.emit('cluster', { ...clusters.all().find((c) => c.id === seen.cluster.id) });
    if (seen.confirmed) {
      fanOut(seen.cluster, targetOutbound(seen.cluster), now)
        .then((summary) => summary && req.log.warn({ summary }, 'ALERT fan-out'))
        .catch((err) => req.log.error({ err }, 'fan-out failed'));
    }
  });
});

// Agent calls this the moment it hears life-safety language, then calls transfer_call.
// Kept separate from report_incident so the bypass path never waits on clustering.
app.post('/fn/request_human', { preHandler: verifyRetell }, async (req, reply) => {
  const { call = {}, args: nested, name, ...rest } = req.body;
  const args = nested || rest;
  reply.send({ transfer: true, say: "I'm connecting you to a person now. Please stay on the line." });

  setImmediate(() => {
    sessions.upsert(call.call_id, { lane: 'BYPASS', bypass_reason: args.reason });
    sessions.bus.emit('bypass', { call_id: call.call_id, from_number: call.from_number, reason: args.reason, now: Date.now() });
    req.log.warn({ call_id: call.call_id, reason: args.reason }, 'BYPASS requested');
  });
});

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
    } else if (event === 'transcript_updated') {
      const s = sessions.upsert(call.call_id, { transcript: call.transcript });
      const hit = !s.bypass_reason && checkBypass(callerText(call));
      if (hit) {
        sessions.upsert(call.call_id, { lane: 'BYPASS', bypass_reason: `said "${hit}"` });
        sessions.bus.emit('bypass', { call_id: call.call_id, from_number: call.from_number, reason: hit, now: Date.now() });
        req.log.warn({ call_id: call.call_id, phrase: hit }, 'BYPASS phrase in live transcript');
      }
      return;
    } else if (event === 'call_ended') {
      sessions.upsert(call.call_id, {
        ended_at: call.end_timestamp || Date.now(),
        transcript: call.transcript, disconnection_reason: call.disconnection_reason,
      });
    }
    sessions.bus.emit(event, call);
    req.log.info({ event, call_id: call.call_id }, 'lifecycle');
  });
});

// Read side for the console until Supabase Realtime is wired up. Read-only, so open CORS.
app.addHook('onSend', async (req, reply, payload) => {
  if (req.method === 'GET') reply.header('access-control-allow-origin', '*');
  return payload;
});

const snapshot = () => ({
  active: sessions.active().length,
  sessions: sessions.all(),
  clusters: clusters.all(),
  dials: allDials(),
});

app.get('/sessions', async () => ({ active: sessions.active().length, sessions: sessions.all() }));
app.get('/clusters', async () => clusters.all());
app.get('/dials', async () => allDials());
app.get('/state', async () => snapshot());
app.get('/health', async () => ({ ok: true }));

// Server-sent events: every bus event, live. The console opens one EventSource and never
// polls. First message is a full snapshot so a reconnect starts from current state.
const STREAMED = ['signal', 'bypass', 'cluster', 'alert', 'dial', 'sweep', 'call_started', 'call_ended', 'call_analyzed'];
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
