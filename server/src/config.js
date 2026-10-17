// Telephony tunables. Engine tunables (radius, window, threshold) live in Person B's config.js.
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),

  retellApiKey: process.env.RETELL_API_KEY || '',
  // Escape hatch only. Leave true; scripts/simulate.js signs its requests like Retell does.
  verifySignatures: process.env.RETELL_VERIFY !== 'false',

  fromNumber: process.env.RETELL_FROM_NUMBER || '',

  // Keyword pass over the live transcript, every chunk. Flags the session for the console
  // the moment these are said; the agent's own request_human/transfer does the transfer.
  // Whole words, negation-aware (see bypass.js). Not "oxygen" or other conditions: "she's
  // on oxygen" is a vulnerability (scored by log_call), not an emergency happening now.
  // Not "help me": "can you help me find my mom" is how ordinary calls start.
  bypassPhrases: [
    'bleeding', 'trapped', "can't get out", 'cant get out', 'stuck inside', 'still inside', 'someone inside',
    'not breathing', "isn't breathing", 'stopped breathing', "can't breathe", 'unconscious', 'unresponsive',
    'not responding', "can't get up", 'collapsed', 'house is on fire', 'on fire', 'fire in the house',
    'gun', 'shot', 'knife', 'stabbed',
    'sangrando', 'atrapado', 'atrapada', 'no puede respirar', 'inconsciente', 'no responde',
  ],
};
