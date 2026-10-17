// Supabase, shared with the board (docs/SUPABASE_SETUP.md). The server uses the service-role
// key, which never leaves Railway. Without both env vars this is null and the backend runs on
// its in-memory fake data, so the phone line works with or without the database.
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const db = config.supabaseUrl && config.supabaseKey
  ? createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// Last database failure, for /health. A failure never breaks a call: the caller gets the
// fallback answer and the error shows up here and in the logs.
export const dbHealth = { mode: db ? 'supabase' : 'memory', lastError: null, lastErrorAt: null };

export function dbFailed(where, err) {
  dbHealth.lastError = `${where}: ${err?.message || err}`;
  dbHealth.lastErrorAt = new Date().toISOString();
  console.error(`[db] ${dbHealth.lastError}`);
}
