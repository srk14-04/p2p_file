/**
 * P2P Web Share — Crypto Utilities
 * 
 * Zero-Knowledge Encryption using the Web Crypto API.
 * - AES-GCM 256-bit encryption for file chunks
 * - SHA-256 hashing for chunk integrity verification
 * - Key generation and import/export for URL hash sharing
 * 
 * The encryption key is generated in the sender's browser and shared
 * ONLY via the URL hash fragment (#key=...), which is never sent to
 * the server — ensuring true zero-knowledge encryption.
 */

/**
 * Generate a new AES-GCM 256-bit encryption key.
 * Returns both the CryptoKey and its base64-encoded raw form for URL sharing.
 */
export async function generateEncryptionKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed to export for URL hash
    ['encrypt', 'decrypt']
  );

  const rawKey = await crypto.subtle.exportKey('raw', key);
  const base64Key = arrayBufferToBase64(rawKey);

  return { key, base64Key };
}

/**
 * Import an AES-GCM key from a base64-encoded string (from URL hash).
 */
export async function importKeyFromBase64(base64Key) {
  const rawKey = base64ToArrayBuffer(base64Key);

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false, // no need to re-export
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a single chunk using AES-GCM.
 * Each chunk gets a unique random 12-byte IV (as required by AES-GCM security).
 * 
 * @param {ArrayBuffer} chunk - The plaintext chunk data
 * @param {CryptoKey} key - The AES-GCM encryption key
 * @returns {{ iv: Uint8Array, encrypted: ArrayBuffer }}
 */
export async function encryptChunk(chunk, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  );

  return { iv, encrypted };
}

/**
 * Decrypt a single chunk using AES-GCM.
 * 
 * @param {ArrayBuffer} encrypted - The encrypted chunk data (includes auth tag)
 * @param {Uint8Array} iv - The 12-byte IV used during encryption
 * @param {CryptoKey} key - The AES-GCM decryption key
 * @returns {ArrayBuffer} The decrypted chunk
 */
export async function decryptChunk(encrypted, iv, key) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
}

/**
 * Compute SHA-256 hash of an ArrayBuffer.
 * Returns the hash as a Uint8Array (32 bytes).
 */
export async function hashChunk(chunk) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', chunk);
  return new Uint8Array(hashBuffer);
}

/**
 * Compute SHA-256 hash of an entire file by reading it in 1MB blocks.
 * Returns the hash as a hex string.
 */
export async function hashFile(file) {
  const BLOCK_SIZE = 1024 * 1024; // 1MB
  const chunks = [];

  for (let offset = 0; offset < file.size; offset += BLOCK_SIZE) {
    const slice = file.slice(offset, offset + BLOCK_SIZE);
    const buffer = await slice.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    chunks.push(new Uint8Array(hash));
  }

  // Hash all the block hashes together for the final file hash
  const combined = new Uint8Array(chunks.length * 32);
  chunks.forEach((h, i) => combined.set(h, i * 32));

  const finalHash = await crypto.subtle.digest('SHA-256', combined);
  return arrayBufferToHex(finalHash);
}

// ------------------------------------------------------------------
// Encoding Helpers
// ------------------------------------------------------------------

/**
 * Convert ArrayBuffer to URL-safe base64 string.
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Convert URL-safe base64 string to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64) {
  // Restore standard base64
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (standardBase64.length % 4 !== 0) {
    standardBase64 += '=';
  }

  const binary = atob(standardBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to hex string (for display).
 */
export function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare two Uint8Arrays for equality.
 */
export function hashesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
