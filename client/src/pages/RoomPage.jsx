import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { MSG_TYPE, CONNECTION_STATE, TRANSFER_STATE } from '../utils/constants';
import { importKeyFromBase64 } from '../utils/crypto';

import FileInfo from '../components/FileInfo';
import ShareLink from '../components/ShareLink';
import ConnectionStatus from '../components/ConnectionStatus';
import TransferProgress from '../components/TransferProgress';

export default function RoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isSender = id === 'new';
  
  // State
  const [encryptionKeyStr, setEncryptionKeyStr] = useState('');
  const [cryptoKey, setCryptoKey] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [readyToDownload, setReadyToDownload] = useState(false);
  const [showEncKey, setShowEncKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  
  // Hooks
  const signaling = useSignaling();
  const webrtc = useWebRTC();
  const transfer = useFileTransfer();
  
  // Keep file reference for sender
  const fileRef = useRef(null);

  // Guards the sender against starting the transfer twice on one connection.
  const sendStartedRef = useRef(false);

  // The established room ID — survives socket reconnects so we can re-attach
  // to the SAME room instead of creating/joining a new one.
  const roomIdRef = useRef(null);
  const initialConnectRef = useRef(false);

  // ------------------------------------------------------------------
  // 1. Initialization
  // ------------------------------------------------------------------
  useEffect(() => {
    async function init() {
      try {
        // Extract encryption key from hash or state
        let keyStr = '';
        if (isSender) {
          fileRef.current = window.__P2P_SELECTED_FILE;
          keyStr = location.state?.encryptionKey;
          if (!fileRef.current || !keyStr) {
            // Missing file or key, redirect to home
            navigate('/');
            return;
          }
        } else {
          // Receiver: get key from URL hash (e.g. #key=base64string)
          const hashMatch = window.location.hash.match(/#key=([^&]+)/);
          keyStr = hashMatch ? hashMatch[1] : null;
          if (!keyStr) {
            alert('Invalid share link: Missing encryption key.');
            navigate('/');
            return;
          }
        }

        setEncryptionKeyStr(keyStr);
        const key = await importKeyFromBase64(keyStr);
        setCryptoKey(key);

        setIsInitializing(false);
      } catch (err) {
        console.error('Init error:', err);
        alert('Failed to initialize secure room.');
        navigate('/');
      }
    }
    
    init();
  }, [isSender, id, navigate, location.state]);

  // ------------------------------------------------------------------
  // 2. Signaling & Room Connection
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isInitializing || !signaling.isConnected || initialConnectRef.current) return;
    initialConnectRef.current = true;

    (async function connectRoom() {
      if (isSender) {
        // Sender creates the room (once).
        try {
          const newRoomId = await signaling.createRoom();
          roomIdRef.current = newRoomId;
          // Update URL without reloading (to show the room ID)
          window.history.replaceState({}, '', `/room/${newRoomId}#key=${encryptionKeyStr}`);
        } catch (err) {
          console.error('Failed to create room:', err);
        }
      } else {
        // Receiver joins existing room (once).
        roomIdRef.current = id;
        try {
          const resumeState = await signaling.joinRoom(id);
          if (resumeState?.fileMetadata) {
            console.log('[room] Found resume state:', resumeState);
            transfer.initReceiver(resumeState.fileMetadata, resumeState.lastVerifiedChunk + 1);
          }
        } catch (err) {
          console.error('Failed to join room:', err);
          alert('Room not found or full.');
          navigate('/');
        }
      }
    })();
  }, [isInitializing, signaling.isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // 2b. Reconnection — reclaim the SAME room (don't create/join fresh, and
  // don't wipe transfer state) so a dropped transfer can auto-resume.
  // ------------------------------------------------------------------
  useEffect(() => {
    signaling.setOnReconnect(async () => {
      const rid = roomIdRef.current;
      if (!rid) return;
      console.log('[room] Reconnected — reclaiming room', rid);
      try {
        await signaling.reclaimRoom(rid, isSender ? 'sender' : 'receiver');
      } catch (err) {
        console.error('[room] Failed to reclaim room after reconnect:', err);
      }
    });
  }, [isSender]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // 2c. Tear down ONLY on real unmount — never on a transient reconnect,
  // so received chunks survive a brief drop and the transfer can resume.
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      webrtc.closeConnection();
      transfer.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // 3. WebRTC Setup & Negotiation
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isInitializing) return;

    // ----- SENDER LOGIC -----
    if (isSender) {
      // Start (or resume) the send exactly once per connection. The receiver
      // tells us which chunk to begin at via a RESUME_FROM control message
      // (0 for a fresh transfer, or its first missing chunk after a reconnect).
      const beginSend = (startChunk) => {
        if (sendStartedRef.current) return;
        sendStartedRef.current = true;
        transfer.startSending(fileRef.current, webrtc.sendData, cryptoKey, startChunk);
      };

      signaling.setOnPeerJoined(async () => {
        try {
          // New (or re-established) connection — allow a fresh (re)start.
          sendStartedRef.current = false;
          webrtc.createConnection();
          const offer = await webrtc.createOffer();
          signaling.sendOffer(offer);
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      });

      signaling.setOnAnswer(async (answer) => {
        await webrtc.handleAnswer(answer);
      });

      signaling.setOnIceCandidate(async (candidate) => {
        await webrtc.addIceCandidate(candidate);
      });

      webrtc.setOnIceCandidate((candidate) => {
        signaling.sendIceCandidate(candidate);
      });

      // Receiver tells us where to (re)start from.
      webrtc.setOnDataChannelMessage((data) => {
        if (typeof data !== 'string') return;
        try {
          const msg = JSON.parse(data);
          if (msg.type === MSG_TYPE.RESUME_FROM) {
            const startChunk = Number.isInteger(msg.index) && msg.index > 0 ? msg.index : 0;
            console.log('[room] Receiver requested resume from chunk', startChunk);
            beginSend(startChunk);
          }
        } catch (e) {
          console.error('Failed to parse control message:', e);
        }
      });

      // When the channel opens, wait briefly for the receiver's resume point.
      // If it never arrives (e.g. an older client), fall back to a full send.
      webrtc.setOnDataChannelOpen(async () => {
        console.log('[room] Data channel open. Awaiting receiver resume point...');
        setTimeout(() => beginSend(0), 3000);
      });
    }
    
    // ----- RECEIVER LOGIC -----
    else {
      signaling.setOnOffer(async (offer) => {
        try {
          const pc = webrtc.acceptConnection();
          const answer = await webrtc.handleOffer(offer);
          signaling.sendAnswer(answer);
        } catch (err) {
          console.error('Error handling offer:', err);
        }
      });

      signaling.setOnIceCandidate(async (candidate) => {
        await webrtc.addIceCandidate(candidate);
      });

      webrtc.setOnIceCandidate((candidate) => {
        signaling.sendIceCandidate(candidate);
      });

      // On (re)connection, tell the sender the first chunk we still need so it
      // can resume rather than restart from 0. Fresh transfer → 0.
      webrtc.setOnDataChannelOpen((dc) => {
        const startChunk = transfer.getFirstMissingChunk();
        console.log('[room] Channel open. Requesting resume from chunk', startChunk);
        try {
          dc.send(JSON.stringify({ type: MSG_TYPE.RESUME_FROM, index: startChunk }));
        } catch (e) {
          console.error('Failed to send resume request:', e);
        }
      });

      // Handle incoming file data
      webrtc.setOnDataChannelMessage(async (data) => {
        if (typeof data === 'string') {
          // Metadata message
          try {
            const msg = JSON.parse(data);
            if (msg.type === MSG_TYPE.FILE_META) {
              transfer.initReceiver(msg.metadata, 0);
            }
          } catch (e) {
            console.error('Failed to parse text message:', e);
          }
        } else if (data instanceof ArrayBuffer) {
          // Binary chunk packet
          const chunkIndex = await transfer.processReceivedChunk(data, cryptoKey);
          if (chunkIndex >= 0) {
            signaling.sendChunkAck(chunkIndex); // For auto-resume tracking
          }
        }
      });
    }
    
    // Handle peer disconnect
    signaling.setOnPeerDisconnected(() => {
      webrtc.closeConnection();
      transfer.pause(); // Pause transfer until they reconnect
    });

  }, [isInitializing, isSender, cryptoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: file metadata is sent to the RECEIVER from within startSending() in
  // useFileTransfer (ordered ahead of chunk 0). Here we additionally publish it
  // to the signaling SERVER so a receiver who reconnects mid-transfer can
  // auto-resume (the server hands it back as resumeState on re-join). Harmless
  // if no receiver is present yet.
  useEffect(() => {
    if (isSender && transfer.fileInfo) {
      signaling.sendFileMetadata(transfer.fileInfo);
    }
  }, [isSender, transfer.fileInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle transfer completion (receiver side) — mark ready, don't auto-download
  useEffect(() => {
    if (!isSender && transfer.transferState === TRANSFER_STATE.COMPLETED) {
      signaling.sendTransferComplete();
      setReadyToDownload(true);
    }
  }, [transfer.transferState, isSender]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual download handler
  const handleManualDownload = () => {
    transfer.downloadFile();
  };

  // Copy encryption key to clipboard
  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(encryptionKeyStr);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy key:', err);
    }
  };

  // Handle transfer completion (sender side)
  useEffect(() => {
    if (isSender) {
      signaling.setOnTransferComplete(() => {
        console.log('[room] Receiver acknowledged transfer complete');
      });
    }
  }, [isSender, signaling]);


  // ------------------------------------------------------------------
  // UI Render
  // ------------------------------------------------------------------
  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center text-white">Initializing secure room...</div>;
  }

  const roomIdToDisplay = signaling.roomId || (isSender ? 'Creating...' : id);

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 relative z-10 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-6 animate-slide-up">
        
        {/* Header & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl font-bold text-white">
            {isSender ? 'Share Room' : 'Receive File'}
          </h2>
          <ConnectionStatus 
            state={webrtc.connectionState} 
            peerPresent={signaling.peerPresent} 
          />
        </div>

        {/* Sender Specific: Share Link */}
        {isSender && (
          <ShareLink roomId={signaling.roomId} encryptionKey={encryptionKeyStr} />
        )}

        {/* File Info */}
        {(isSender ? fileRef.current : transfer.fileInfo) && (
          <FileInfo 
            file={isSender ? fileRef.current : transfer.fileInfo} 
            fileHash={transfer.fileInfo?.fileHash}
            isReceiver={!isSender} 
          />
        )}

        {/* Transfer Progress */}
        <TransferProgress 
          progress={transfer.progress} 
          state={transfer.transferState} 
          error={transfer.transferError || signaling.error} 
        />
        
        {/* Disconnect Warning */}
        {(!signaling.peerPresent && transfer.transferState === TRANSFER_STATE.PAUSED) && (
          <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-xl text-status-warning text-sm text-center animate-pulse-slow">
            Peer disconnected. Transfer paused. Waiting for them to reconnect to resume...
          </div>
        )}

        {/* ── RECEIVER ONLY: Download Panel ── */}
        {!isSender && readyToDownload && (
          <div className="bg-glass border border-status-success/30 rounded-xl p-6 shadow-xl backdrop-blur-md animate-scale-in">
            <h3 className="text-sm font-medium text-gray-400 mb-1 uppercase tracking-wider">File Ready</h3>
            <p className="text-xs text-gray-500 mb-5">
              All chunks verified. The file was transferred securely and its integrity confirmed via SHA-256.
            </p>
            <button
              id="receiver-download-btn"
              onClick={handleManualDownload}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-status-success to-[#4ade80] hover:shadow-[0_0_24px_rgba(34,197,94,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save File to Device
            </button>
          </div>
        )}

        {/* ── RECEIVER ONLY: Encryption Key Panel ── */}
        {!isSender && encryptionKeyStr && (
          <div className="bg-glass border border-glass-border rounded-xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Encryption Key</h3>
              <button
                id="toggle-enc-key-btn"
                onClick={() => setShowEncKey((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-neon-indigo hover:text-neon-violet transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showEncKey
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                </svg>
                {showEncKey ? 'Hide' : 'Show'} Key
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              This AES-GCM 256-bit key was embedded in the share link and used to encrypt every chunk.
              The signaling server never had access to it.
            </p>

            {showEncKey && (
              <div className="animate-slide-down">
                <div className="bg-void/80 border border-glass-border rounded-lg p-3 font-mono text-[11px] text-neon-indigo break-all select-all mb-3">
                  {encryptionKeyStr}
                </div>
                <button
                  id="copy-enc-key-btn"
                  onClick={handleCopyKey}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    keyCopied
                      ? 'bg-status-success/10 border-status-success/40 text-status-success'
                      : 'bg-glass border-glass-border text-gray-300 hover:border-neon-indigo/40 hover:text-neon-indigo'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {keyCopied
                      ? <polyline points="20 6 9 17 4 12"/>
                      : <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>}
                  </svg>
                  {keyCopied ? 'Key Copied!' : 'Copy Key to Clipboard'}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
