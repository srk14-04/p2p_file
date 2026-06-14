/**
 * ShareLink Component
 * 
 * Displays the room URL in a styled input with a copy-to-clipboard button.
 * Visual feedback on successful copy.
 */

import { useState } from 'react';

export default function ShareLink({ roomId, encryptionKey }) {
  const [copied, setCopied] = useState(false);

  // The room only exists once the signaling server has assigned a real ID.
  // Until then `roomId` is null/placeholder ("Creating...") — sharing that
  // would produce a dead link the receiver can't join ("Room not found").
  const isReady = Boolean(roomId) && roomId !== 'Creating...' && Boolean(encryptionKey);

  // Construct the full share URL including the encryption key in the hash
  const shareUrl = isReady
    ? `${window.location.origin}/room/${roomId}#key=${encryptionKey}`
    : '';

  const handleCopy = async () => {
    if (!isReady) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="bg-glass border border-glass-border rounded-xl p-6 shadow-xl backdrop-blur-md">
      <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
        Share Link
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Send this link to the receiver. They will connect directly to your browser.
        The encryption key is included in the link and never sent to the server.
      </p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            readOnly
            value={isReady ? shareUrl : 'Creating secure room…'}
            placeholder="Creating secure room…"
            className={`w-full bg-void/50 border border-glass-border rounded-lg py-3 px-4 text-sm font-mono focus:outline-none focus:border-neon-indigo/50 pr-12 ${isReady ? 'text-gray-300' : 'text-gray-500 italic'}`}
            onClick={(e) => isReady && e.target.select()}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <svg className="w-4 h-4 text-neon-indigo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
        </div>

        <button
          onClick={handleCopy}
          disabled={!isReady}
          className={`
            relative overflow-hidden flex items-center justify-center h-11 px-6 rounded-lg font-medium text-sm transition-all duration-300
            ${!isReady
              ? 'bg-glass border border-glass-border text-gray-500 cursor-not-allowed'
              : copied
                ? 'bg-status-success text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : 'bg-gradient-to-r from-neon-indigo to-neon-violet text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:scale-[1.02]'
            }
          `}
        >
          {!isReady ? (
            <span className="flex items-center gap-2">Creating…</span>
          ) : copied ? (
            <span className="flex items-center gap-2 animate-scale-in">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy Link
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
