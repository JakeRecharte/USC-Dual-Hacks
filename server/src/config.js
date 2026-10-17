// Telephony tunables. Engine tunables (radius, window, threshold) live in Person B's config.js.
import 'dotenv/config';

const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

// CONSENTED_NUMBERS entries are "+13105551234" or "+13105551234:es-ES" (language for the alert).
const consentedEntries = list(process.env.CONSENTED_NUMBERS).map((e) => {
  const [number, lang] = e.split(':');
  return { number, lang: lang || 'en-US' };
});

export const config = {
  port: Number(process.env.PORT || 3000),

  retellApiKey: process.env.RETELL_API_KEY || '',
  // Escape hatch only. Leave true; scripts/simulate.js signs its requests like Retell does.
  verifySignatures: process.env.RETELL_VERIFY !== 'false',

  fromNumber: process.env.RETELL_FROM_NUMBER || '',
  outboundAgentId: process.env.RETELL_OUTBOUND_AGENT_ID || '',

  // Outbound safety. Nothing rings unless it is in CONSENTED_NUMBERS AND alerts are enabled.
  consented: new Set(consentedEntries.map((e) => e.number)),
  consentedEntries,
  alertsEnabled: process.env.ALERTS_ENABLED === 'true',
  maxDialsPerCluster: Number(process.env.MAX_DIALS_PER_CLUSTER || 25),

  // Stand-ins for Person B's engine config until it lands: unique firsthand callers on one
  // incident type + street before the alert fires, and how many synthetic residents to
  // rank alongside the consented phones so the console shows real vs simulated.
  alertThreshold: Number(process.env.ALERT_THRESHOLD || 5),
  syntheticTargets: Number(process.env.SYNTHETIC_TARGETS || 40),

  // The only words the outbound agent adds after naming the incident. Approved script:
  // no promise that help is coming, no claim anyone is safe.
  alertMessage: process.env.ALERT_MESSAGE ||
    'If anyone with you is hurt or in danger, stay on the line and I can connect you to a person.',

  // Keyword pass over the live transcript, every chunk. Flags the session for the console
  // the moment these are said; the agent's own request_human/transfer does the transfer.
  bypassPhrases: [
    'bleeding', 'trapped', "can't get out", 'cant get out', 'stuck inside', 'someone inside',
    'not breathing', "can't breathe", 'unconscious', 'oxygen', 'gun', 'knife', 'help me',
    'sangrando', 'atrapado', 'atrapada', 'no puede respirar', 'oxígeno', 'oxigeno',
  ],
};
