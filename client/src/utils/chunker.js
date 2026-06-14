/**
 * P2P Web Share — File Chunking & Reassembly
 * 
 * Handles splitting files into chunks for WebRTC transfer,
 * building binary packets with headers (chunk index, IV, hash),
 * parsing received packets, and reassembling the final file.
 */

import { CHUNK_SIZE } from './constants';

/**
 * Calculate total number of chunks for a file.
 */
export function getTotalChunks(fileSize) {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

/**
 * Read a single chunk from a File object.
 * 
 * @param {File} file - The source file
 * @param {number} chunkIndex - Zero-based chunk index
 * @returns {Promise<ArrayBuffer>} The chunk data
 */
export async function sliceFile(file, chunkIndex) {
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  const blob = file.slice(start, end);
  return blob.arrayBuffer();
}

/**
 * Build a binary packet for sending over WebRTC data channel.
 * 
 * Packet layout (binary):
 *   [4 bytes]  Chunk index (Uint32, big-endian)
 *   [12 bytes] AES-GCM IV
 *   [32 bytes] SHA-256 hash of the ORIGINAL (pre-encryption) chunk
 *   [N bytes]  Encrypted chunk data
 * 
 * Total header: 48 bytes
 * 
 * @param {number} chunkIndex
 * @param {Uint8Array} iv - 12-byte IV from encryption
 * @param {Uint8Array} hash - 32-byte SHA-256 of plaintext chunk
 * @param {ArrayBuffer} encryptedData
 * @returns {ArrayBuffer}
 */
export function buildChunkPacket(chunkIndex, iv, hash, encryptedData) {
  const HEADER_SIZE = 4 + 12 + 32; // 48 bytes
  const packet = new ArrayBuffer(HEADER_SIZE + encryptedData.byteLength);
  const view = new DataView(packet);
  const uint8View = new Uint8Array(packet);

  // Write chunk index (4 bytes, big-endian)
  view.setUint32(0, chunkIndex, false);

  // Write IV (12 bytes)
  uint8View.set(iv, 4);

  // Write hash (32 bytes)
  uint8View.set(hash, 16);

  // Write encrypted data
  uint8View.set(new Uint8Array(encryptedData), HEADER_SIZE);

  return packet;
}

/**
 * Parse a received binary packet from the data channel.
 * 
 * @param {ArrayBuffer} packet
 * @returns {{ chunkIndex: number, iv: Uint8Array, hash: Uint8Array, encryptedData: ArrayBuffer }}
 */
export function parseChunkPacket(packet) {
  const HEADER_SIZE = 48;
  const view = new DataView(packet);
  const uint8View = new Uint8Array(packet);

  const chunkIndex = view.getUint32(0, false);
  const iv = uint8View.slice(4, 16);
  const hash = uint8View.slice(16, 48);
  const encryptedData = packet.slice(HEADER_SIZE);

  return { chunkIndex, iv, hash, encryptedData };
}

/**
 * Reassemble verified chunks into a complete file and trigger download.
 * 
 * @param {ArrayBuffer[]} chunks - Ordered array of decrypted chunks
 * @param {string} fileName - Original file name
 * @param {string} mimeType - Original MIME type
 */
export function reassembleAndDownload(chunks, fileName, mimeType) {
  const blob = new Blob(chunks, { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Format file size to human-readable string.
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1);
  return `${size} ${units[i]}`;
}

/**
 * Format seconds to human-readable duration.
 */
export function formatDuration(seconds) {
  if (!seconds || seconds === Infinity) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

/**
 * Get an icon emoji for a file type.
 */
export function getFileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '📦';
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html')) return '💻';
  return '📄';
}
