/**
 * Shared constants for P2P Web Share
 */

/** Size of each file chunk in bytes (64KB — optimal for WebRTC data channels) */
export const CHUNK_SIZE = 64 * 1024;

/** Maximum buffered amount before pausing sends (1MB) */
export const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024;

/** Signaling server URL */
export const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

/**
 * ICE server configuration for NAT traversal.
 *
 * STUN lets a peer discover its own public address — enough when at least one
 * side is on a "friendly" NAT (e.g. two homes on the same kind of router).
 * But many real-world networks (symmetric NAT, mobile data, corporate/campus
 * Wi-Fi) block a direct browser-to-browser link entirely. In those cases a
 * TURN relay is REQUIRED — without it the connection simply never establishes
 * and the receiver gets nothing. So for cross-city / cross-network transfers
 * you must ship TURN, not just STUN.
 *
 * For production, create your own TURN credentials (Metered free tier at
 * https://dashboard.metered.ca/, Twilio, or self-hosted coturn) and set the
 * env vars below in client/.env.production. If unset, we fall back to the
 * free public Open Relay service (best-effort, rate-limited — fine for demos).
 */
// VITE_TURN_URL may be a single URL or a comma-separated list (TURN providers
// usually give several: :80, :443, and :443?transport=tcp to punch through
// restrictive firewalls). They share the same username/credential.
const TURN_URLS = (import.meta.env.VITE_TURN_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(TURN_URLS.length && TURN_USERNAME && TURN_CREDENTIAL
    ? [{ urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL }]
    : [
        // Free public TURN fallback (Open Relay by Metered) — best-effort.
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ]),
];

/** Time before abandoned room is cleaned up (5 minutes) */
export const ROOM_CLEANUP_TIMEOUT = 5 * 60 * 1000;

/** Number of recent chunks to average for speed calculation */
export const SPEED_WINDOW_SIZE = 10;

/** WebRTC data channel label */
export const DATA_CHANNEL_LABEL = 'p2p-file-transfer';

/** Message types sent over the data channel */
export const MSG_TYPE = {
  FILE_META: 'file-meta',
  CHUNK: 'chunk',
  TRANSFER_COMPLETE: 'transfer-complete',
  RESUME_FROM: 'resume-from', // receiver → sender: chunk index to (re)start at
};

/** Transfer states */
export const TRANSFER_STATE = {
  IDLE: 'idle',
  HASHING: 'hashing',
  WAITING: 'waiting',
  CONNECTING: 'connecting',
  TRANSFERRING: 'transferring',
  PAUSED: 'paused',
  RESUMING: 'resuming',
  COMPLETED: 'completed',
  ERROR: 'error',
};

/** Connection states */
export const CONNECTION_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed',
};
