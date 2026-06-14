/**
 * P2P Web Share — File Transfer Hook
 * 
 * Orchestrates the complete file transfer pipeline:
 * - Sender: chunk → hash → encrypt → send with backpressure
 * - Receiver: receive → decrypt → verify hash → store → auto-download
 * - Supports auto-resume from last verified chunk
 * 
 * This hook ties together the crypto and chunker utilities with
 * the WebRTC data channel for end-to-end encrypted file transfer.
 */

import { useRef, useCallback, useState } from 'react';
import { CHUNK_SIZE, SPEED_WINDOW_SIZE, TRANSFER_STATE, MSG_TYPE } from '../utils/constants';
import { encryptChunk, decryptChunk, hashChunk, hashFile, hashesEqual } from '../utils/crypto';
import {
  getTotalChunks,
  sliceFile,
  buildChunkPacket,
  parseChunkPacket,
  reassembleAndDownload,
} from '../utils/chunker';

export function useFileTransfer() {
  const [transferState, setTransferState] = useState(TRANSFER_STATE.IDLE);
  const [progress, setProgress] = useState({
    percent: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    speed: 0,        // bytes per second
    eta: 0,          // seconds remaining
    currentChunk: 0,
    totalChunks: 0,
    resumedFrom: -1, // chunk index we resumed from (-1 = fresh start)
  });
  const [fileInfo, setFileInfo] = useState(null);
  const [transferError, setTransferError] = useState(null);

  // Internal state refs (for use inside async loops)
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const receivedChunksRef = useRef([]);
  const speedSamplesRef = useRef([]); // timestamps for speed calculation
  const sendTokenRef = useRef(0); // identifies the current send loop; a resume bumps it

  // ------------------------------------------------------------------
  // SENDER: Send file over data channel
  // ------------------------------------------------------------------

  const startSending = useCallback(async (file, sendDataFn, encryptionKey, startChunk = 0) => {
    // Supersede any in-flight send loop (e.g. a resume after reconnect): the
    // older loop sees the token change and bails out, so only one loop sends.
    const myToken = ++sendTokenRef.current;
    try {
      isCancelledRef.current = false;
      isPausedRef.current = false;
      const totalChunks = getTotalChunks(file.size);

      setTransferState(startChunk > 0 ? TRANSFER_STATE.RESUMING : TRANSFER_STATE.HASHING);
      setProgress((p) => ({
        ...p,
        totalBytes: file.size,
        totalChunks,
        resumedFrom: startChunk > 0 ? startChunk : -1,
      }));

      // Compute overall file hash (for metadata)
      const fileHash = await hashFile(file);
      const meta = {
        name: file.name,
        size: file.size,
        type: file.type,
        totalChunks,
        fileHash,
      };
      setFileInfo(meta);

      // Send the file metadata to the receiver BEFORE any chunks. The data
      // channel is ordered, so this string message is guaranteed to arrive
      // ahead of chunk 0 — the receiver uses it to size its buffer and to
      // know the file name/type for download. (Previously this relied on a
      // RoomPage effect gated on transferState===HASHING, which never fired
      // because fileInfo is only set as the state flips to TRANSFERRING.)
      await sendDataFn(JSON.stringify({ type: MSG_TYPE.FILE_META, metadata: meta }));

      setTransferState(TRANSFER_STATE.TRANSFERRING);
      speedSamplesRef.current = [];

      for (let i = startChunk; i < totalChunks; i++) {
        // Bail out if a newer send loop has taken over (resume after reconnect).
        if (sendTokenRef.current !== myToken) return;
        // Check for pause/cancel
        while (isPausedRef.current) {
          if (sendTokenRef.current !== myToken) return;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (isCancelledRef.current) {
          setTransferState(TRANSFER_STATE.IDLE);
          return;
        }

        // 1. Read chunk from file
        const chunkData = await sliceFile(file, i);

        // 2. Hash the plaintext chunk (for verification)
        const chunkHash = await hashChunk(chunkData);

        // 3. Encrypt the chunk
        const { iv, encrypted } = await encryptChunk(chunkData, encryptionKey);

        // 4. Build the binary packet (index + IV + hash + encrypted data)
        const packet = buildChunkPacket(i, iv, chunkHash, encrypted);

        // 5. Send with backpressure management
        await sendDataFn(packet);

        // 6. Update progress
        const bytesTransferred = Math.min((i + 1) * CHUNK_SIZE, file.size);
        const now = Date.now();
        speedSamplesRef.current.push({ time: now, bytes: chunkData.byteLength });

        // Keep only recent samples for speed calc
        if (speedSamplesRef.current.length > SPEED_WINDOW_SIZE) {
          speedSamplesRef.current.shift();
        }

        const speed = calculateSpeed(speedSamplesRef.current);
        const remainingBytes = file.size - bytesTransferred;
        const eta = speed > 0 ? remainingBytes / speed : 0;

        setProgress({
          percent: Math.round((bytesTransferred / file.size) * 100),
          bytesTransferred,
          totalBytes: file.size,
          speed,
          eta,
          currentChunk: i + 1,
          totalChunks,
          resumedFrom: startChunk > 0 ? startChunk : -1,
        });
      }

      if (sendTokenRef.current === myToken) {
        setTransferState(TRANSFER_STATE.COMPLETED);
      }
    } catch (err) {
      // A send failure on a superseded loop (stale closed channel) is expected
      // during a reconnect — don't surface it as a transfer error.
      if (sendTokenRef.current !== myToken) return;
      console.error('[transfer] Send error:', err);
      setTransferError(err.message);
      setTransferState(TRANSFER_STATE.ERROR);
    }
  }, []);

  // ------------------------------------------------------------------
  // RECEIVER: Process incoming chunks
  // ------------------------------------------------------------------

  const initReceiver = useCallback((metadata, startChunk = 0) => {
    // If we already hold chunks for this same-sized transfer (a transient
    // disconnect where the tab stayed open), KEEP them so the sender can resume
    // from the first missing chunk instead of re-sending everything. Otherwise
    // allocate a fresh buffer.
    const existing = receivedChunksRef.current;
    const isResume =
      Array.isArray(existing) &&
      existing.length === metadata.totalChunks &&
      existing.some(Boolean);
    if (!isResume) {
      receivedChunksRef.current = new Array(metadata.totalChunks).fill(null);
    }
    speedSamplesRef.current = [];
    isCancelledRef.current = false;
    isPausedRef.current = false;

    setFileInfo(metadata);
    setTransferState(startChunk > 0 ? TRANSFER_STATE.RESUMING : TRANSFER_STATE.WAITING);
    setProgress((p) => ({
      ...p,
      // Preserve visible progress on resume; reset it for a fresh transfer.
      percent: isResume ? p.percent : 0,
      bytesTransferred: isResume ? p.bytesTransferred : 0,
      totalBytes: metadata.size,
      speed: 0,
      eta: 0,
      currentChunk: startChunk,
      totalChunks: metadata.totalChunks,
      resumedFrom: startChunk > 0 ? startChunk : -1,
    }));
  }, []);

  /**
   * Returns the index of the first chunk we have NOT yet received (0 for a
   * fresh transfer). The receiver sends this to the sender to drive resume.
   */
  const getFirstMissingChunk = useCallback(() => {
    const arr = receivedChunksRef.current;
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i]) return i;
    }
    return arr.length;
  }, []);

  /**
   * Process a single received chunk packet.
   * Returns the chunk index if successful, or -1 on error.
   */
  const processReceivedChunk = useCallback(async (packetData, encryptionKey) => {
    try {
      // 1. Parse the packet
      const { chunkIndex, iv, hash, encryptedData } = parseChunkPacket(packetData);

      if (transferState !== TRANSFER_STATE.TRANSFERRING &&
          transferState !== TRANSFER_STATE.RESUMING) {
        setTransferState(TRANSFER_STATE.TRANSFERRING);
      }

      // 2. Decrypt the chunk
      const decrypted = await decryptChunk(encryptedData, iv, encryptionKey);

      // 3. Verify the hash
      const computedHash = await hashChunk(decrypted);
      if (!hashesEqual(computedHash, hash)) {
        console.error(`[transfer] Hash mismatch on chunk ${chunkIndex}!`);
        setTransferError(`Data corruption detected on chunk ${chunkIndex}`);
        setTransferState(TRANSFER_STATE.ERROR);
        return -1;
      }

      // 4. Store the verified chunk
      receivedChunksRef.current[chunkIndex] = decrypted;

      // 5. Update progress
      const chunksReceived = receivedChunksRef.current.filter(Boolean).length;
      const totalChunks = receivedChunksRef.current.length;
      const bytesTransferred = receivedChunksRef.current
        .filter(Boolean)
        .reduce((sum, c) => sum + c.byteLength, 0);

      const now = Date.now();
      speedSamplesRef.current.push({ time: now, bytes: decrypted.byteLength });
      if (speedSamplesRef.current.length > SPEED_WINDOW_SIZE) {
        speedSamplesRef.current.shift();
      }

      const totalBytes = receivedChunksRef.current.length * CHUNK_SIZE; // approximate
      const speed = calculateSpeed(speedSamplesRef.current);
      const remainingBytes = Math.max(0, (fileInfo?.size || totalBytes) - bytesTransferred);
      const eta = speed > 0 ? remainingBytes / speed : 0;

      setProgress({
        percent: Math.round((chunksReceived / totalChunks) * 100),
        bytesTransferred,
        totalBytes: fileInfo?.size || totalBytes,
        speed,
        eta,
        currentChunk: chunksReceived,
        totalChunks,
        resumedFrom: progress.resumedFrom,
      });

      // 6. Check if transfer is complete
      if (chunksReceived === totalChunks) {
        setTransferState(TRANSFER_STATE.COMPLETED);
      }

      return chunkIndex;
    } catch (err) {
      console.error('[transfer] Receive error:', err);
      setTransferError(err.message);
      setTransferState(TRANSFER_STATE.ERROR);
      return -1;
    }
  }, [transferState, fileInfo, progress.resumedFrom]);

  /**
   * Trigger auto-download of the completed file.
   */
  const downloadFile = useCallback(() => {
    if (!fileInfo) return;

    const chunks = receivedChunksRef.current.filter(Boolean);
    if (chunks.length !== fileInfo.totalChunks) {
      console.error('[transfer] Cannot download — not all chunks received');
      return;
    }

    reassembleAndDownload(chunks, fileInfo.name, fileInfo.type);
  }, [fileInfo]);

  // ------------------------------------------------------------------
  // Control
  // ------------------------------------------------------------------

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setTransferState(TRANSFER_STATE.PAUSED);
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setTransferState(TRANSFER_STATE.TRANSFERRING);
  }, []);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    receivedChunksRef.current = [];
    setTransferState(TRANSFER_STATE.IDLE);
    setProgress({
      percent: 0, bytesTransferred: 0, totalBytes: 0,
      speed: 0, eta: 0, currentChunk: 0, totalChunks: 0, resumedFrom: -1,
    });
  }, []);

  const reset = useCallback(() => {
    isCancelledRef.current = false;
    isPausedRef.current = false;
    receivedChunksRef.current = [];
    speedSamplesRef.current = [];
    setTransferState(TRANSFER_STATE.IDLE);
    setTransferError(null);
    setFileInfo(null);
    setProgress({
      percent: 0, bytesTransferred: 0, totalBytes: 0,
      speed: 0, eta: 0, currentChunk: 0, totalChunks: 0, resumedFrom: -1,
    });
  }, []);

  return {
    // State
    transferState,
    progress,
    fileInfo,
    transferError,

    // Sender
    startSending,
    setFileInfo,

    // Receiver
    initReceiver,
    processReceivedChunk,
    downloadFile,
    getFirstMissingChunk,

    // Control
    pause,
    resume,
    cancel,
    reset,
  };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Calculate transfer speed from recent samples (bytes per second).
 */
function calculateSpeed(samples) {
  if (samples.length < 2) return 0;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const timeDelta = (last.time - first.time) / 1000; // seconds

  if (timeDelta <= 0) return 0;

  const totalBytes = samples.reduce((sum, s) => sum + s.bytes, 0);
  return totalBytes / timeDelta;
}
