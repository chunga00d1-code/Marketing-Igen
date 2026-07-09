/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

function normalizeRoomId(value: string) {
  return String(value || "").trim();
}

export function initSocketServer(httpServer: HttpServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    const pageId = normalizeRoomId(String(socket.handshake.query?.pageId || ""));
    const businessAccountId = normalizeRoomId(String(socket.handshake.query?.businessAccountId || ""));

    if (pageId) {
      socket.join(`page:${pageId}`);
    }

    if (businessAccountId) {
      socket.join(`page:${businessAccountId}`);
    }

    socket.on("join_page", (id: string) => {
      const roomId = normalizeRoomId(id);
      if (roomId) {
        socket.join(`page:${roomId}`);
      }
    });

    socket.on("leave_page", (id: string) => {
      const roomId = normalizeRoomId(id);
      if (roomId) {
        socket.leave(`page:${roomId}`);
      }
    });
  });

  return io;
}

export function broadcastEvent(event: string, payload: any) {
  if (!io) {
    return;
  }

  io.emit(event, payload);
}

export function emitToPage(pageId: string, event: string, payload: any) {
  if (!io) {
    return;
  }

  const roomId = normalizeRoomId(pageId);
  if (roomId) {
    io.to(`page:${roomId}`).emit(event, payload);
  }

  io.emit(event, payload);
}
