// Creates or updates the Line Intake agent from the files in retell/, so the agent config
// lives in git instead of the dashboard. Safe to re-run whenever the prompt changes.
//
//   npm run setup-retell -- --url https://usc-dual-hacks-production.up.railway.app
//   npm run setup-retell                     uses a running ngrok tunnel instead
//   npm run setup-retell -- --buy 213        ALSO buys a number in that area code ($2/mo)
import { readFile, writeFile } from 'node:fs/promises';
import Retell from 'retell-sdk';
import { config } from '../src/config.js';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const file = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

if (!config.retellApiKey) throw new Error('RETELL_API_KEY missing from server/.env');
const retell = new Retell({ apiKey: config.retellApiKey });

const INBOUND_NAME = 'Line Intake';
const VOICE = process.env.RETELL_VOICE_ID || '11labs-Marissa';
const MODEL = process.env.RETELL_MODEL || 'claude-5.5-haiku';
const DISPATCHER = process.env.DISPATCHER_NUMBER || '';

async function publicUrl() {
  const explicit = arg('--url') || process.env.PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    const { tunnels } = await res.json();
    const https = tunnels.find((t) => t.public_url.startsWith('https://'));
    if (https) return https.public_url;
  } catch {}
  throw new Error('No public URL. Start `ngrok http 3000` first, or pass --url.');
}

async function tools(base) {
  const raw = (await file('retell/tools.json'))
    .replaceAll('{{PUBLIC_URL}}', base)
    .replaceAll('{{DISPATCHER_NUMBER}}', DISPATCHER);
  const all = JSON.parse(raw);
  if (DISPATCHER) return all;
  console.warn('! DISPATCHER_NUMBER not set: transfer_to_human left out. Bypass calls cannot transfer yet.');
  return all.filter((t) => t.type !== 'transfer_call');
}

async function findAgent(name) {
  const res = await retell.agent.list({ limit: 1000 });
  const items = Array.isArray(res) ? res : res.items || [];
  // list items are summaries without response_engine; fetch the full agent
  const hit = items.find((a) => a.agent_name === name);
  return hit ? retell.agent.retrieve(hit.agent_id) : null;
}

async function upsertAgent({ name, prompt, toolList, beginMessage, startSpeaker, base }) {
  const llmBody = {
    model: MODEL,
    general_prompt: prompt,
    general_tools: toolList,
    begin_message: beginMessage,
    start_speaker: startSpeaker,
  };
  const agentBody = {
    agent_name: name,
    voice_id: VOICE,
    language: 'multi',
    webhook_url: `${base}/webhook/retell`,
    webhook_events: ['call_started', 'call_ended', 'call_analyzed', 'transcript_updated'],
    max_call_duration_ms: 5 * 60 * 1000, // silence is billed
    end_call_after_silence_ms: 20 * 1000,
    interruption_sensitivity: 1, // barge-in is part of the demo
  };

  const existing = await findAgent(name);
  if (existing) {
    const llmId = existing.response_engine.llm_id;
    // keep a voice picked in the dashboard unless RETELL_VOICE_ID overrides it
    if (!process.env.RETELL_VOICE_ID) agentBody.voice_id = existing.voice_id;
    await retell.llm.update(llmId, llmBody);
    await retell.agent.update(existing.agent_id, agentBody);
    console.log(`updated ${name}: ${existing.agent_id}`);
    return existing.agent_id;
  }
  const llm = await retell.llm.create(llmBody);
  const agent = await retell.agent.create({ ...agentBody, response_engine: { type: 'retell-llm', llm_id: llm.llm_id } });
  console.log(`created ${name}: ${agent.agent_id}`);
  return agent.agent_id;
}

const base = await publicUrl();
console.log('public URL:', base);
const allTools = await tools(base);

const inboundId = await upsertAgent({
  name: INBOUND_NAME,
  base,
  prompt: await file('retell/agent-prompt.md'),
  toolList: allTools,
  startSpeaker: 'agent',
  beginMessage:
    "LA Community Line. I'm automated, and I can get you a person. Is anyone hurt or in danger?",
});

let number = config.fromNumber;
const buy = arg('--buy');
if (!number && buy) {
  const bought = await retell.phoneNumber.create({ area_code: Number(buy), nickname: 'Line' });
  number = bought.phone_number;
  console.log('bought number:', number);
}

if (number) {
  await retell.phoneNumber.update(number, {
    inbound_agents: [{ agent_id: inboundId, weight: 1, agent_version: 'latest' }],
    outbound_agents: [], // inbound only: the number never places calls
  });
  console.log(`${number} → inbound ${INBOUND_NAME}, outbound disabled`);
} else {
  console.log('No number yet. Buy one in the dashboard, or re-run with --buy <area code>.');
}

// Write the number back into .env.
const envUrl = new URL('../.env', import.meta.url);
let env = await readFile(envUrl, 'utf8').catch(() => '');
const set = (k, v) => {
  if (!v) return;
  env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : env + `\n${k}=${v}\n`;
};
set('RETELL_FROM_NUMBER', number);
await writeFile(envUrl, env);
console.log('server/.env updated');
