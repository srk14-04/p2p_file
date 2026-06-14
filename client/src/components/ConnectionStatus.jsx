/**
 * ConnectionStatus Component
 * 
 * Displays the current WebRTC connection state with a pulsing dot indicator.
 */

import { CONNECTION_STATE } from '../utils/constants';

export default function ConnectionStatus({ state, peerPresent }) {
  const getStatusConfig = () => {
    switch (state) {
      case CONNECTION_STATE.CONNECTED:
        return {
          color: 'bg-status-success',
          text: 'Connected via WebRTC (P2P)',
          glow: 'shadow-[0_0_10px_rgba(34,197,94,0.5)]'
        };
      case CONNECTION_STATE.CONNECTING:
        return {
          color: 'bg-status-warning',
          text: 'Establishing direct connection...',
          glow: 'shadow-[0_0_10px_rgba(245,158,11,0.5)]'
        };
      case CONNECTION_STATE.FAILED:
        return {
          color: 'bg-status-error',
          text: 'Connection failed',
          glow: 'shadow-[0_0_10px_rgba(239,68,68,0.5)]'
        };
      case CONNECTION_STATE.DISCONNECTED:
      default:
        if (peerPresent) {
           return {
            color: 'bg-status-warning',
            text: 'Peer joined, preparing connection...',
            glow: 'shadow-[0_0_10px_rgba(245,158,11,0.5)]'
          };
        }
        return {
          color: 'bg-gray-500',
          text: 'Waiting for peer to join...',
          glow: ''
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-3 bg-void/50 border border-glass-border rounded-full py-2 px-4 w-fit">
      <div className="relative flex items-center justify-center w-3 h-3">
        {(state === CONNECTION_STATE.CONNECTING || peerPresent && state === CONNECTION_STATE.DISCONNECTED) && (
          <div className={`absolute w-full h-full rounded-full ${config.color} animate-ping opacity-75`}></div>
        )}
        <div className={`w-2.5 h-2.5 rounded-full ${config.color} ${config.glow}`}></div>
      </div>
      <span className="text-sm font-medium text-gray-300">{config.text}</span>
    </div>
  );
}
