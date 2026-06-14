/**
 * Shared constants for P2P Web Share
 */

/** Size of each file chunk in bytes (64KB — optimal for WebRTC data channels) */
export const CHUNK_SIZE = 64 * 1024;

/** Maximum buffered amount before pausing sends (1MB) */
export const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024;

/** Signaling server URL */
export const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

/** ICE server configuration for NAT traversal */
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
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
