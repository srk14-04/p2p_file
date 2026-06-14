/**
 * FileDrop Component
 * 
 * Drag-and-drop zone for file upload with visual feedback.
 * Supports click-to-browse fallback and file size validation.
 */

import { useState, useRef, useCallback } from 'react';
import { formatFileSize, getFileIcon } from '../utils/chunker';

export default function FileDrop({ onFileSelected, disabled = false }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;

    setSelectedFile(file);
    onFileSelected?.(file);
  }, [onFileSelected]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  }, [disabled, handleFile]);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const isLargeFile = selectedFile && selectedFile.size > 50 * 1024 * 1024;

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center
          transition-all duration-300 group
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragOver
            ? 'border-neon-violet bg-neon-violet/10 shadow-lg shadow-neon-violet/20 scale-[1.02]'
            : selectedFile
              ? 'border-status-success/40 bg-status-success/5'
              : 'border-glass-border bg-glass hover:border-neon-indigo/50 hover:bg-glass-hover hover:shadow-lg hover:shadow-neon-indigo/10'
          }
        `}
      >
        {/* Animated border glow on dragover */}
        {isDragOver && (
          <div className="absolute inset-0 rounded-2xl animate-glow opacity-50 pointer-events-none" />
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        {selectedFile ? (
          /* Selected file display */
          <div className="animate-scale-in">
            <div className="text-5xl mb-4">{getFileIcon(selectedFile.type)}</div>
            <p className="text-white font-semibold text-lg truncate max-w-md mx-auto">
              {selectedFile.name}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {formatFileSize(selectedFile.size)}
              {selectedFile.type && ` · ${selectedFile.type}`}
            </p>
            {isLargeFile && (
              <p className="text-status-warning text-xs mt-3 flex items-center justify-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                File is larger than 50MB — transfer may use more memory
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
              className="mt-4 text-xs text-gray-500 hover:text-gray-300 underline transition-colors"
            >
              Choose different file
            </button>
          </div>
        ) : (
          /* Empty drop zone */
          <div>
            <div className={`mb-4 transition-transform duration-300 ${isDragOver ? 'scale-110' : 'group-hover:scale-105'}`}>
              <svg className="w-16 h-16 mx-auto text-gray-500 group-hover:text-neon-indigo transition-colors duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium text-lg">
              {isDragOver ? 'Drop your file here' : 'Drag & drop a file here'}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              or <span className="text-neon-indigo underline">browse</span> to choose
            </p>
            <p className="text-gray-600 text-xs mt-4">
              Any file type · Recommended under 50MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
