/**
 * TransferProgress Component
 * 
 * Displays the current transfer progress, speed, ETA, and state.
 */

import { formatFileSize, formatDuration } from '../utils/chunker';
import { TRANSFER_STATE } from '../utils/constants';

export default function TransferProgress({ progress, state, error }) {
  if (state === TRANSFER_STATE.IDLE || state === TRANSFER_STATE.WAITING || state === TRANSFER_STATE.CONNECTING) {
    return null;
  }

  const {
    percent,
    bytesTransferred,
    totalBytes,
    speed,
    eta,
    currentChunk,
    totalChunks,
    resumedFrom
  } = progress;

  const isComplete = state === TRANSFER_STATE.COMPLETED;
  const isError = state === TRANSFER_STATE.ERROR;
  const isResuming = state === TRANSFER_STATE.RESUMING;

  // Determine progress bar color based on state
  let barColor = 'from-neon-indigo via-neon-violet to-neon-purple';
  if (isComplete) barColor = 'from-status-success to-[#4ade80]';
  if (isError) barColor = 'from-status-error to-[#f87171]';

  return (
    <div className="bg-glass border border-glass-border rounded-xl p-6 shadow-xl backdrop-blur-md">
      {/* Header Info */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">
            {isComplete ? 'Transfer Complete' : isError ? 'Transfer Failed' : 'Transfer Progress'}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold text-white">{percent}%</span>
            {isResuming && (
              <span className="text-xs bg-neon-indigo/20 text-neon-indigo px-2 py-0.5 rounded border border-neon-indigo/30">
                Resuming...
              </span>
            )}
          </div>
        </div>

        {!isComplete && !isError && (
          <div className="text-right">
            <div className="text-sm font-medium text-white">
              {formatFileSize(speed)}/s
            </div>
            <div className="text-xs text-gray-400">
              {formatDuration(eta)} remaining
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative h-4 bg-void/50 rounded-full overflow-hidden border border-glass-border">
        <div 
          className={`absolute top-0 left-0 h-full bg-gradient-to-r ${barColor} transition-all duration-300 ease-out`}
          style={{ width: `${percent}%` }}
        >
          {/* Animated shimmer effect during transfer */}
          {!isComplete && !isError && (
            <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)] -translate-x-full animate-shimmer" />
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex justify-between items-center mt-3 text-xs">
        <div className="text-gray-400">
          <span className="text-gray-300 font-medium">{formatFileSize(bytesTransferred)}</span> of {formatFileSize(totalBytes)}
        </div>
        <div className="text-gray-500">
          Chunk {currentChunk} / {totalChunks}
        </div>
      </div>

      {/* Error Message */}
      {isError && (
        <div className="mt-4 p-3 bg-status-error/10 border border-status-error/30 rounded-lg text-sm text-status-error flex items-start gap-2">
          <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p>{error || 'An unknown error occurred during transfer.'}</p>
        </div>
      )}

      {/* Success Message */}
      {isComplete && (
        <div className="mt-4 flex justify-center">
          <div className="w-12 h-12 rounded-full bg-status-success/20 flex items-center justify-center animate-scale-in">
            <svg className="w-6 h-6 text-status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
