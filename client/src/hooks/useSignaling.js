/**
 * P2P Web Share — Signaling Hook
 * 
 * Manages the Socket.io connection to the signaling server.
 * Handles room creation/joining, SDP/ICE relay, and resume state.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';
import { SIGNALING_URL } from '../utils/constants';

export function useSignaling() {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [peerPresent, setPeerPresent] = useState(false);
  const [error, setError] = useState(null);

  // Callback refs for WebRTC signaling events
  const onOfferRef = useRef(null);
  const onAnswerRef = useRef(null);
  const onIceCandidateRef = useRef(null);
  const onPeerJoinedRef = useRef(null);
  const onPeerDisconnectedRef = useRef(null);
  const onFileMetadataRef = useRef(null);
  const onResumeStateRef = useRef(null);
  const onTransferCompleteRef = useRef(null);
  const onReconnectRef = useRef(null);

  // True once we've connected at least once — used to distinguish the first
  // connect from a reconnect after a dropped network.
  const hasConnectedRef = useRef(false);

  // Initialize Socket.io connection
  useEffect(() => {
    const socket = io(SIGNALING_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[signaling] Connected:', socket.id);
      setIsConnected(true);
      setError(null);
      if (hasConnectedRef.current) {
        // Reconnect after a drop — let the page re-attach to its room and resume.
        onReconnectRef.current?.();
      } else {
        hasConnectedRef.current = true;
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[signaling] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[signaling] Connection error:', err.message);
      setError(`Cannot reach signaling server: ${err.message}`);
    });

    // WebRTC signal relay events
    socket.on('offer', (offer) => onOfferRef.current?.(offer));
    socket.on('answer', (answer) => onAnswerRef.current?.(answer));
    socket.on('ice-candidate', (candidate) => onIceCandidateRef.current?.(candidate));
    socket.on('file-metadata', (metadata) => onFileMetadataRef.current?.(metadata));
    socket.on('transfer-complete', () => onTransferCompleteRef.current?.());

    socket.on('peer-joined', ({ peerId }) => {
      console.log('[signaling] Peer joined:', peerId);
      setPeerPresent(true);
      onPeerJoinedRef.current?.(peerId);
    });

    socket.on('peer-disconnected', ({ reason }) => {
      console.log('[signaling] Peer disconnected:', reason);
      setPeerPresent(false);
      onPeerDisconnectedRef.current?.(reason);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ------------------------------------------------------------------
  // Room Management
  // ------------------------------------------------------------------

  const createRoom = useCallback(() => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return reject(new Error('Not connected to signaling server'));
      }

      socket.emit('create-room', (response) => {
        if (response.error) {
          setError(response.error);
          return reject(new Error(response.error));
        }
        setRoomId(response.roomId);
        console.log('[signaling] Room created:', response.roomId);
        resolve(response.roomId);
      });
    });
  }, []);

  const joinRoom = useCallback((targetRoomId) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return reject(new Error('Not connected to signaling server'));
      }

      socket.emit('join-room', targetRoomId, (response) => {
        if (response.error) {
          setError(response.error);
          return reject(new Error(response.error));
        }
        setRoomId(targetRoomId);
        setPeerPresent(true);
        console.log('[signaling] Joined room:', targetRoomId);

        // Fire resume state callback if available
        if (response.resumeState && onResumeStateRef.current) {
          onResumeStateRef.current(response.resumeState);
        }

        resolve(response.resumeState);
      });
    });
  }, []);

  const reclaimRoom = useCallback((targetRoomId, role) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return reject(new Error('Not connected to signaling server'));
      }

      socket.emit('reclaim-room', { roomId: targetRoomId, role }, (response) => {
        if (response.error) {
          setError(response.error);
          return reject(new Error(response.error));
        }
        setRoomId(targetRoomId);
        setPeerPresent(true);
        console.log('[signaling] Reclaimed room:', targetRoomId);

        if (response.resumeState && onResumeStateRef.current) {
          onResumeStateRef.current(response.resumeState);
        }
        resolve(response.resumeState);
      });
    });
  }, []);

  // ------------------------------------------------------------------
  // Signaling Methods
  // ------------------------------------------------------------------

  const sendOffer = useCallback((offer) => {
    socketRef.current?.emit('offer', offer);
  }, []);

  const sendAnswer = useCallback((answer) => {
    socketRef.current?.emit('answer', answer);
  }, []);

  const sendIceCandidate = useCallback((candidate) => {
    socketRef.current?.emit('ice-candidate', candidate);
  }, []);

  const sendFileMetadata = useCallback((metadata) => {
    socketRef.current?.emit('file-metadata', metadata);
  }, []);

  const sendChunkAck = useCallback((chunkIndex) => {
    socketRef.current?.emit('chunk-ack', chunkIndex);
  }, []);

  const sendTransferComplete = useCallback(() => {
    socketRef.current?.emit('transfer-complete');
  }, []);

  // ------------------------------------------------------------------
  // Callback Setters
  // ------------------------------------------------------------------

  const setOnOffer = useCallback((cb) => { onOfferRef.current = cb; }, []);
  const setOnAnswer = useCallback((cb) => { onAnswerRef.current = cb; }, []);
  const setOnIceCandidate = useCallback((cb) => { onIceCandidateRef.current = cb; }, []);
  const setOnPeerJoined = useCallback((cb) => { onPeerJoinedRef.current = cb; }, []);
  const setOnPeerDisconnected = useCallback((cb) => { onPeerDisconnectedRef.current = cb; }, []);
  const setOnFileMetadata = useCallback((cb) => { onFileMetadataRef.current = cb; }, []);
  const setOnResumeState = useCallback((cb) => { onResumeStateRef.current = cb; }, []);
  const setOnTransferComplete = useCallback((cb) => { onTransferCompleteRef.current = cb; }, []);
  const setOnReconnect = useCallback((cb) => { onReconnectRef.current = cb; }, []);

  return {
    // State
    isConnected,
    roomId,
    peerPresent,
    error,

    // Room management
    createRoom,
    joinRoom,
    reclaimRoom,

    // Signaling methods
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendFileMetadata,
    sendChunkAck,
    sendTransferComplete,

    // Callback setters
    setOnOffer,
    setOnAnswer,
    setOnIceCandidate,
    setOnPeerJoined,
    setOnPeerDisconnected,
    setOnFileMetadata,
    setOnResumeState,
    setOnTransferComplete,
    setOnReconnect,
  };
}
