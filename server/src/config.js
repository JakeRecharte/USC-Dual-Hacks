// Telephony tunables. Engine tunables (radius, window, threshold) live in Person B's config.js.
import 'dotenv/config';

const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 3000),

  retellApiKey: process.env.RETELL_API_KEY || '',
  // Escape hatch only. Leave true; scripts/simulate.js signs its requests like Retell does.
  verifySignatures: process.env.RETELL_VERIFY !== 'false',

  fromNumber: process.env.RETELL_FROM_NUMBER || '',
  outboundAgentId: process.env.RETELL_OUTBOUND_AGENT_ID || '',

  // Outbound safety. Nothing rings unless it is in CONSENTED_NUMBERS AND alerts are enabled.
  consented: new Set(list(process.env.CONSENTED_NUMBERS)),
  alertsEnabled: process.env.ALERTS_ENABLED === 'true',
  maxDialsPerCluster: Number(process.env.MAX_DIALS_PER_CLUSTER || 25),

  // Keyword pass over the live transcript, every chunk. Flags the session for the console
  // the moment these are said; the agent's own request_human/transfer does the transfer.
  bypassPhrases: [
    'bleeding', 'trapped', "can't get out", 'cant get out', 'stuck inside', 'someone inside',
    'not breathing', "can't breathe", 'unconscious', 'oxygen', 'gun', 'knife', 'help me',
    'sangrando', 'atrapado', 'atrapada', 'no puede respirar', 'oxígeno', 'oxigeno',
  ],
};
