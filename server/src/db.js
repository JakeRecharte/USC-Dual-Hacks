// Supabase, shared with the board (docs/SUPABASE_SETUP.md). The server uses the service-role
// key, which never leaves Railway. Without both env vars this is null and the backend runs on
// its in-memory fake data, so the phone line works with or without the database.
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Last database failure, for /health. A failure never breaks a call: the caller gets the
// fallback answer and the error shows up here and in the logs.
export const dbHealth = { mode: 'memory', lastError: null, lastErrorAt: null };

// Creating the client must never take the phone line down (it once did, on a Node without a
// native WebSocket): if it throws, run in memory mode and say why on /health.
function connect() {
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  try {
    const client = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    dbHealth.mode = 'supabase';
    return client;
  } catch (err) {
    dbHealth.lastError = `connect: ${err.message}`;
    dbHealth.lastErrorAt = new Date().toISOString();
    console.error(`[db] ${dbHealth.lastError}; running on in-memory data`);
    return null;
  }
}
export const db = connect();

export function dbFailed(where, err) {
  dbHealth.lastError = `${where}: ${err?.message || err}`;
  dbHealth.lastErrorAt = new Date().toISOString();
  console.error(`[db] ${dbHealth.lastError}`);
}
