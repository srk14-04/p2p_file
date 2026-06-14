/**
 * FileInfo Component
 * 
 * Glassmorphism card showing file details: name, size, type, and icon.
 * Includes a collapsible section for the SHA-256 fingerprint.
 */

import { useState } from 'react';
import { formatFileSize, getFileIcon } from '../utils/chunker';

export default function FileInfo({ file, fileHash, isReceiver = false }) {
  const [showHash, setShowHash] = useState(false);

  if (!file) return null;

  return (
    <div className="bg-glass border border-glass-border rounded-xl p-6 shadow-xl animate-fade-in backdrop-blur-md">
      <h3 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">
        {isReceiver ? 'Receiving File' : 'Shared File'}
      </h3>
      
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-void/50 border border-glass-border flex items-center justify-center text-3xl shadow-inner">
          {getFileIcon(file.type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-semibold text-white truncate" title={file.name}>
            {file.name}
          </h4>
          <p className="text-gray-400 text-sm mt-1">
            {formatFileSize(file.size)}
            {file.type && <span className="mx-2">•</span>}
            {file.type}
          </p>
        </div>
      </div>

      {fileHash && (
        <div className="mt-4 pt-4 border-t border-glass-border/50">
          <button 
            onClick={() => setShowHash(!showHash)}
            className="flex items-center gap-2 text-xs text-neon-indigo hover:text-neon-violet transition-colors"
          >
            <svg 
              className={`w-3 h-3 transition-transform duration-200 ${showHash ? 'rotate-90' : ''}`} 
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            SHA-256 Fingerprint (Integrity Check)
          </button>
          
          {showHash && (
            <div className="mt-2 bg-void/80 p-2 rounded border border-glass-border font-mono text-[10px] text-gray-400 break-all select-all">
              {fileHash}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
