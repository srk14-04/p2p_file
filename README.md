# P2P Web Share

A lightweight, decentralized peer-to-peer file sharing web application built with WebRTC. Send files directly from your browser to another without the data ever touching a central server.

## Features

*   **Direct P2P Transfer:** Files stream directly between browsers using WebRTC Data Channels.
*   **Zero-Knowledge Encryption:** Files are chunked and encrypted locally with AES-GCM 256-bit encryption. The decryption key is shared via the URL hash and is never seen by the signaling server.
*   **Auto-Resume:** If the connection drops mid-transfer, it will automatically pause and resume from the last verified chunk once reconnected.
*   **Data Integrity Check:** Every chunk is verified with a SHA-256 hash before and after transfer to guarantee zero data corruption.
*   **No File Size Limit (Soft Limit 50MB):** Files are streamed in 64KB chunks to manage browser memory effectively.

## Tech Stack

*   **Frontend:** React.js, Vite, Tailwind CSS v3, React Router
*   **Backend (Signaling):** Node.js, Express, Socket.io
*   **P2P Protocol:** WebRTC Data Channels
*   **Cryptography:** Web Crypto API (AES-GCM, SHA-256)

## Setup Instructions

### 1. Start the Signaling Server

```bash
cd server
npm install
npm run dev
```
The server will start on `http://localhost:3001`.

### 2. Start the Frontend Application

```bash
cd client
npm install
npm run dev
```
The application will start on `http://localhost:5173`.

## How It Works

1.  **Selection & Encryption Key:** The sender selects a file. A local AES-GCM encryption key is generated using the Web Crypto API.
2.  **Room Creation:** The sender connects to the Node.js signaling server and creates a room. The encryption key is appended to the share URL as a hash fragment (e.g., `#key=...`).
3.  **Peer Connection:** The receiver opens the link, extracts the key from the hash, and joins the room. The signaling server relays the WebRTC SDP offers/answers and ICE candidates to establish a direct connection.
4.  **Chunking & Encryption:** The sender reads the file in 64KB chunks. Each chunk is hashed (SHA-256), encrypted with the AES-GCM key, and sent over the WebRTC Data Channel.
5.  **Decryption & Verification:** The receiver decrypts incoming chunks, verifies the SHA-256 hash to ensure integrity, and acknowledges receipt (for auto-resume support).
6.  **Reassembly:** Once all chunks are verified, the receiver reassembles them and triggers an automatic browser download.
