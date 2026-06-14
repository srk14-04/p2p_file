/**
 * P2P Web Share — WebRTC Hook
 * 
 * Manages the RTCPeerConnection lifecycle:
 * - Creates and configures peer connections
 * - Handles SDP offer/answer exchange
 * - Manages ICE candidate gathering and relay
 * - Creates and manages data channels for file transfer
 * - Monitors connection state and provides backpressure control
 */

import { useRef, useCallback, useState } from 'react';
import { ICE_SERVERS, DATA_CHANNEL_LABEL, MAX_BUFFERED_AMOUNT } from '../utils/constants';
import { CONNECTION_STATE } from '../utils/constants';

export function useWebRTC() {
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATE.DISCONNECTED);

  // Callback refs
  const onDataChannelOpenRef = useRef(null);
  const onDataChannelMessageRef = useRef(null);
  const onDataChannelCloseRef = useRef(null);
  const onIceCandidateRef = useRef(null);

  /**
   * Set up common event handlers on the peer connection.
   */
  const setupPeerConnectionEvents = useCallback((pc) => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidateRef.current?.(event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[webrtc] Connection state:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connecting':
          setConnectionState(CONNECTION_STATE.CONNECTING);
          break;
        case 'connected':
          setConnectionState(CONNECTION_STATE.CONNECTED);
          break;
        case 'disconnected':
        case 'closed':
          setConnectionState(CONNECTION_STATE.DISCONNECTED);
          break;
        case 'failed':
          setConnectionState(CONNECTION_STATE.FAILED);
          break;
        default:
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[webrtc] ICE connection state:', pc.iceConnectionState);
    };
  }, []);

  /**
   * Set up data channel event handlers.
   */
  const setupDataChannelEvents = useCallback((dc) => {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log('[webrtc] Data channel opened');
      onDataChannelOpenRef.current?.(dc);
    };

    dc.onmessage = (event) => {
      onDataChannelMessageRef.current?.(event.data);
    };

    dc.onclose = () => {
      console.log('[webrtc] Data channel closed');
      onDataChannelCloseRef.current?.();
    };

    dc.onerror = (err) => {
      console.error('[webrtc] Data channel error:', err);
    };
  }, []);

  // ------------------------------------------------------------------
  // Connection Creation (Sender)
  // ------------------------------------------------------------------

  const createConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    setupPeerConnectionEvents(pc);

    // Sender creates the data channel
    const dc = pc.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true, // Guarantee chunk ordering for file integrity
    });
    dcRef.current = dc;
    setupDataChannelEvents(dc);

    return pc;
  }, [setupPeerConnectionEvents, setupDataChannelEvents]);

  // ------------------------------------------------------------------
  // Connection Acceptance (Receiver)
  // ------------------------------------------------------------------

  const acceptConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    setupPeerConnectionEvents(pc);

    // Receiver waits for the data channel to be opened by sender
    pc.ondatachannel = (event) => {
      console.log('[webrtc] Received data channel');
      const dc = event.channel;
      dcRef.current = dc;
      setupDataChannelEvents(dc);
    };

    return pc;
  }, [setupPeerConnectionEvents, setupDataChannelEvents]);

  // ------------------------------------------------------------------
  // SDP Exchange
  // ------------------------------------------------------------------

  const createOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) throw new Error('No peer connection');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, []);

  const handleOffer = useCallback(async (offer) => {
    const pc = pcRef.current;
    if (!pc) throw new Error('No peer connection');

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }, []);

  const handleAnswer = useCallback(async (answer) => {
    const pc = pcRef.current;
    if (!pc) throw new Error('No peer connection');

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }, []);

  const addIceCandidate = useCallback(async (candidate) => {
    const pc = pcRef.current;
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[webrtc] Error adding ICE candidate:', err);
    }
  }, []);

  // ------------------------------------------------------------------
  // Data Channel Operations
  // ------------------------------------------------------------------

  /**
   * Send data over the data channel with backpressure management.
   * Returns a promise that resolves when the buffer is clear enough to send.
   */
  const sendData = useCallback((data) => {
    return new Promise((resolve, reject) => {
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') {
        return reject(new Error('Data channel not open'));
      }

      const trySend = () => {
        if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          // Wait for buffer to drain
          dc.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT / 2;
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            try {
              dc.send(data);
              resolve();
            } catch (err) {
              reject(err);
            }
          };
        } else {
          try {
            dc.send(data);
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      };

      trySend();
    });
  }, []);

  /**
   * Close the peer connection and data channel.
   */
  const closeConnection = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setConnectionState(CONNECTION_STATE.DISCONNECTED);
  }, []);

  // ------------------------------------------------------------------
  // Callback Setters
  // ------------------------------------------------------------------

  const setOnDataChannelOpen = useCallback((cb) => { onDataChannelOpenRef.current = cb; }, []);
  const setOnDataChannelMessage = useCallback((cb) => { onDataChannelMessageRef.current = cb; }, []);
  const setOnDataChannelClose = useCallback((cb) => { onDataChannelCloseRef.current = cb; }, []);
  const setOnIceCandidate = useCallback((cb) => { onIceCandidateRef.current = cb; }, []);

  return {
    // State
    connectionState,
    dataChannel: dcRef,

    // Connection management
    createConnection,
    acceptConnection,
    closeConnection,

    // SDP exchange
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,

    // Data operations
    sendData,

    // Callback setters
    setOnDataChannelOpen,
    setOnDataChannelMessage,
    setOnDataChannelClose,
    setOnIceCandidate,
  };
}
