/**
 * P2P Web Share — Signaling Server
 * 
 * A lightweight Node.js + Express + Socket.io server that coordinates
 * WebRTC handshakes between peers. This server NEVER reads, processes,
 * or stores any file data — it only relays SDP offers/answers and
 * ICE candidates, plus tracks room state for auto-resume capability.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const ROOM_CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Allow one or more client origins. Set CLIENT_URL to a comma-separated list
// to permit several (e.g. "http://localhost:5173,https://your-app.vercel.app")
// so you can test locally and from the deployed site against the same server.
const allowedOrigins = CLIENT_URL.split(',').map((o) => o.trim()).filter(Boolean);

// ------------------------------------------------------------------
// CORS & Socket.io Setup
// ------------------------------------------------------------------
app.use(cors({ origin: allowedOrigins }));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

// ------------------------------------------------------------------
// In-memory room state
// ------------------------------------------------------------------
// rooms Map<roomId, RoomState>
// RoomState = {
//   senderId: string | null,
//   receiverId: string | null,
//   fileMetadata: { name, size, type, totalChunks, fileHash } | null,
//   lastVerifiedChunk: number,       // for auto-resume
//   cleanupTimer: NodeJS.Timeout | null,
//   createdAt: number
// }
const rooms = new Map();

/**
 * Generate a short, URL-safe room ID (8 chars)
 */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ------------------------------------------------------------------
// Health check endpoint
// ------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'P2P Web Share Signaling Server',
    rooms: rooms.size,
    uptime: process.uptime(),
  });
});

// ------------------------------------------------------------------
// Socket.io Connection Handling
// ------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ----------------------------------------------------------------
  // CREATE ROOM — Sender creates a new share room
  // ----------------------------------------------------------------
  socket.on('create-room', (callback) => {
    // Rate limit: one room per socket
    for (const [, room] of rooms) {
      if (room.senderId === socket.id) {
        return callback({ error: 'You already have an active room' });
      }
    }

    const roomId = generateRoomId();
    rooms.set(roomId, {
      senderId: socket.id,
      receiverId: null,
      fileMetadata: null,
      lastVerifiedChunk: -1,
      cleanupTimer: null,
      createdAt: Date.now(),
    });

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'sender';

    console.log(`[create-room] ${socket.id} created room ${roomId}`);
    callback({ roomId });
  });

  // ----------------------------------------------------------------
  // JOIN ROOM — Receiver joins an existing room
  // ----------------------------------------------------------------
  socket.on('join-room', (roomId, callback) => {
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ error: 'room-not-found' });
    }

    if (room.receiverId && room.receiverId !== socket.id) {
      // Check if the existing receiver is still connected
      const existingReceiver = io.sockets.sockets.get(room.receiverId);
      if (existingReceiver) {
        return callback({ error: 'room-full' });
      }
      // Old receiver disconnected without cleanup — allow new one
    }

    // Clear any cleanup timer (reconnection scenario)
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    room.receiverId = socket.id;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'receiver';

    console.log(`[join-room] ${socket.id} joined room ${roomId}`);

    // Notify the sender that a peer joined
    if (room.senderId) {
      io.to(room.senderId).emit('peer-joined', { peerId: socket.id });
    }

    // Send resume state if we have previous transfer progress
    const resumeState = {
      fileMetadata: room.fileMetadata,
      lastVerifiedChunk: room.lastVerifiedChunk,
    };

    callback({ success: true, resumeState });
  });

  // ----------------------------------------------------------------
  // RECLAIM ROOM — A peer that briefly dropped re-attaches to its SAME
  // room (by id) instead of creating/joining a fresh one. This is what
  // makes auto-resume across a dropped connection actually work.
  // ----------------------------------------------------------------
  socket.on('reclaim-room', ({ roomId, role }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: 'room-not-found' });
    }

    // The peer is back — cancel any pending room cleanup.
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = role;

    if (role === 'sender') {
      room.senderId = socket.id;
    } else {
      room.receiverId = socket.id;
    }

    console.log(`[reclaim-room] ${socket.id} reclaimed ${role} of room ${roomId}`);

    // Once both peers are present again, ask the SENDER to (re)create the
    // WebRTC offer so the data channel — and the transfer — can resume.
    if (room.senderId && room.receiverId) {
      io.to(room.senderId).emit('peer-joined', { peerId: room.receiverId });
    }

    callback({
      success: true,
      resumeState: {
        fileMetadata: room.fileMetadata,
        lastVerifiedChunk: room.lastVerifiedChunk,
      },
    });
  });

  // ----------------------------------------------------------------
  // FILE METADATA — Sender shares file info for the room
  // ----------------------------------------------------------------
  socket.on('file-metadata', (metadata) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || room.senderId !== socket.id) return;

    room.fileMetadata = metadata;
    console.log(`[file-metadata] Room ${roomId}: ${metadata.name} (${metadata.size} bytes, ${metadata.totalChunks} chunks)`);

    // Forward metadata to receiver if present
    if (room.receiverId) {
      io.to(room.receiverId).emit('file-metadata', metadata);
    }
  });

  // ----------------------------------------------------------------
  // WEBRTC SIGNALING — Relay SDP offers, answers, and ICE candidates
  // ----------------------------------------------------------------
  socket.on('offer', (offer) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const targetId = socket.id === room.senderId ? room.receiverId : room.senderId;
    if (targetId) {
      io.to(targetId).emit('offer', offer);
    }
  });

  socket.on('answer', (answer) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const targetId = socket.id === room.senderId ? room.receiverId : room.senderId;
    if (targetId) {
      io.to(targetId).emit('answer', answer);
    }
  });

  socket.on('ice-candidate', (candidate) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const targetId = socket.id === room.senderId ? room.receiverId : room.senderId;
    if (targetId) {
      io.to(targetId).emit('ice-candidate', candidate);
    }
  });

  // ----------------------------------------------------------------
  // CHUNK ACKNOWLEDGMENT — Receiver confirms chunk receipt (for resume)
  // ----------------------------------------------------------------
  socket.on('chunk-ack', (chunkIndex) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    if (typeof chunkIndex === 'number' && chunkIndex > room.lastVerifiedChunk) {
      room.lastVerifiedChunk = chunkIndex;
    }
  });

  // ----------------------------------------------------------------
  // TRANSFER COMPLETE — Mark room transfer as finished
  // ----------------------------------------------------------------
  socket.on('transfer-complete', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    console.log(`[transfer-complete] Room ${roomId}`);

    // Notify the other peer
    const targetId = socket.id === room.senderId ? room.receiverId : room.senderId;
    if (targetId) {
      io.to(targetId).emit('transfer-complete');
    }
  });

  // ----------------------------------------------------------------
  // DISCONNECT — Handle peer leaving
  // ----------------------------------------------------------------
  socket.on('disconnect', (reason) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    console.log(`[disconnect] ${socket.id} (${reason})`);

    if (!room) return;

    // Notify the remaining peer
    const targetId = socket.id === room.senderId ? room.receiverId : room.senderId;
    if (targetId) {
      io.to(targetId).emit('peer-disconnected', { reason });
    }

    // Mark the disconnected peer slot as empty
    if (socket.id === room.senderId) {
      room.senderId = null;
    } else if (socket.id === room.receiverId) {
      room.receiverId = null;
    }

    // If both peers are gone, start cleanup timer
    if (!room.senderId && !room.receiverId) {
      room.cleanupTimer = setTimeout(() => {
        rooms.delete(roomId);
        console.log(`[cleanup] Room ${roomId} removed after timeout`);
      }, ROOM_CLEANUP_TIMEOUT);
    }
  });
});

// ------------------------------------------------------------------
// Periodic stale room cleanup (every 30 minutes)
// ------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 60 * 60 * 1000; // 1 hour

  for (const [roomId, room] of rooms) {
    if (now - room.createdAt > staleThreshold && !room.senderId && !room.receiverId) {
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
      rooms.delete(roomId);
      console.log(`[cleanup] Stale room ${roomId} removed`);
    }
  }
}, 30 * 60 * 1000);

// ------------------------------------------------------------------
// Start Server
// ------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   P2P Web Share — Signaling Server            ║
  ║   Running on port ${PORT}                        ║
  ║   Accepting clients from ${CLIENT_URL}  ║
  ╚═══════════════════════════════════════════════╝
  `);
});
