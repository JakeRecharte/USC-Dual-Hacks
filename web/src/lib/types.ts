// Types mirror docs/DATA_CONTRACT.md. Anything added here that is not in the contract is
// marked FRONTEND-ONLY and must not be sent to the voice agent.

/** status_log.status, exactly the six contracted values. The agent may read these aloud. */
export type Status =
  | 'cleared'
  | 'refused'
  | 'no_answer'
  | 'self_out'
  | 'in_transit'
  | 'unknown';

/** status_log.source. */
export type Source = 'officer' | 'resident_reply' | 'call';

/**
 * FRONTEND-ONLY, board-only. Kept out of `Status` on purpose: the voice agent must never
 * tell a caller their home burned down. Dispatchers see it, callers never hear it.
 * See docs/FRONTEND_CONTRACT.md.
 */
export type Structure = 'intact' | 'damaged' | 'destroyed' | 'unassessed';

/**
 * The agent's read of the caller, per docs/DATA_CONTRACT.md §3a. Only ever moves up: a
 * caller who was panicked stays panicked for the rest of the call.
 */
export type CallerState = 'calm' | 'worried' | 'distressed' | 'panicked';

/** calls.routing. */
export type Routing =
  | 'human_now'
  | 'priority_queue'
  | 'answered_by_agent'
  | 'scheduled_followup';

export interface AddressRow {
  id: string;
  address: string;
  lat: number;
  lng: number;
  zone_id: string;
  resident_name: string;
  inside_perimeter: boolean;
}

/** An address joined to its newest status_log row, which is what both portals render. */
export interface AddressState extends AddressRow {
  status: Status;
  source: Source | null;
  /** ISO string, or null when nothing has ever been recorded. Always shown to the user. */
  recorded_at: string | null;
  note: string | null;
  structure: Structure;
  structure_recorded_at: string | null;
}

/** A row in the dispatcher's live call queue, from the telephony server's SSE feed. */
export interface CallRow {
  id: string;
  call_id?: string;
  mode: 'wildfire' | 'routine';
  address: string;
  subject_name: string;
  address_id: string | null;
  routing: Routing;
  severity: number;
  reason: string;
  created_at: string;
  from_number?: string | null;
  /** Set when the agent heard life-safety language mid-sentence and bypassed the script. */
  bypass?: boolean;
  caller_state?: CallerState | null;
  /** Keyword score of the caller's words. 3 or more is what trips a handoff. */
  distress_score?: number;
}

export const STATUS_LABEL: Record<Status, string> = {
  cleared: 'Cleared',
  refused: 'Refused',
  no_answer: 'No answer',
  self_out: 'Self-evacuated',
  in_transit: 'Evacuating',
  unknown: 'Unknown',
};

export const STRUCTURE_LABEL: Record<Structure, string> = {
  intact: 'Standing',
  damaged: 'Damaged',
  destroyed: 'Destroyed',
  unassessed: 'Not assessed',
};

export const ROUTING_LABEL: Record<Routing, string> = {
  human_now: 'Human now',
  priority_queue: 'Priority queue',
  answered_by_agent: 'Answered by agent',
  scheduled_followup: 'Follow-up scheduled',
};

/** Routing order for the queue: most urgent first. */
export const ROUTING_RANK: Record<Routing, number> = {
  human_now: 0,
  priority_queue: 1,
  scheduled_followup: 2,
  answered_by_agent: 3,
};

export const CALLER_STATE_LABEL: Record<CallerState, string> = {
  calm: 'Calm',
  worried: 'Worried',
  distressed: 'Distressed',
  panicked: 'Panicked',
};

/**
 * Worried is the normal call on this line — "I can't reach my mom" is why people ring — so
 * only distressed and above get a colour that pulls the eye.
 */
export const CALLER_STATE_RANK: Record<CallerState, number> = {
  calm: 0,
  worried: 1,
  distressed: 2,
  panicked: 3,
};

/** docs/DATA_CONTRACT.md §3a: the score at which the server hands the call to a human. */
export const DISTRESS_THRESHOLD = 3;
