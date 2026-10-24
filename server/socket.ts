/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { SocialIntegrationModel } from "./model/social-integration.model";
import { UserModel } from "./model/user.model";

let io: SocketIOServer | null = null;

type MessengerChannel = "facebook" | "zalo" | "tiktok";

function normalizeRoomId(value: unknown) {
  return String(value || "").trim();
}

function messengerRoomName(channel: MessengerChannel, accountId: string) {
  return `messenger:${channel}:${encodeURIComponent(accountId)}`;
}

async function canAccessMessengerAccount(
  userId: string,
  companyCode: string,
  channel: MessengerChannel,
  accountId: string,
) {
  const user = await UserModel.findById(userId)
    .select("companyCode facebookIntegration zaloIntegration tiktokIntegration")
    .lean();
  if (!user) return false;

  const personalIntegration = channel === "facebook"
    ? user.facebookIntegration
    : channel === "zalo"
      ? user.zaloIntegration
      : user.tiktokIntegration;
  const personalAccountId = channel === "facebook"
    ? user.facebookIntegration?.pageId
    : channel === "zalo"
      ? user.zaloIntegration?.oaId
      : user.tiktokIntegration?.username;

  if (personalIntegration?.isConnected && personalAccountId === accountId) return true;
  if (!companyCode || user.companyCode !== companyCode) return false;

  const platform = channel === "facebook" ? "Facebook" : channel === "zalo" ? "Zalo" : "TikTok";
  return !!(await SocialIntegrationModel.exists({
    companyCode,
    platform,
    username: accountId,
    isConnected: true,
  }));
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

  io.use(async (socket, next) => {
    try {
      const token = normalizeRoomId(socket.handshake.auth?.token);
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key",
      ) as jwt.JwtPayload;
      const userId = normalizeRoomId(decoded.id);
      if (!userId) return next(new Error("Invalid authentication token"));

      const user = await UserModel.findById(userId).select("companyCode").lean();
      if (!user) return next(new Error("User not found"));

      socket.data.userId = userId;
      socket.data.companyCode = String(user.companyCode || "");
      return next();
    } catch {
      return next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket) => {
    let scopeRequestVersion = 0;
    socket.on("set_messenger_scopes", async (requestedScopes: unknown) => {
      const requestVersion = ++scopeRequestVersion;
      for (const room of socket.rooms) {
        if (room.startsWith("messenger:")) socket.leave(room);
      }

      if (!Array.isArray(requestedScopes)) return;
      const validScopes = requestedScopes.slice(0, 30) as Array<Record<string, unknown>>;
      for (const requested of validScopes) {
        if (requestVersion !== scopeRequestVersion) return;
        const channel = requested?.channel;
        const accountId = normalizeRoomId(requested?.accountId);
        if (
          (channel !== "facebook" && channel !== "zalo" && channel !== "tiktok") ||
          !accountId || accountId.length > 200
        ) continue;

        try {
          const authorized = await canAccessMessengerAccount(
            socket.data.userId,
            socket.data.companyCode,
            channel,
            accountId,
          );
          if (requestVersion !== scopeRequestVersion) return;
          if (authorized) socket.join(messengerRoomName(channel, accountId));
        } catch (error) {
          console.error("[Socket] Failed to authorize messenger scope:", error);
        }
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

export function emitToMessengerAccount(
  channel: MessengerChannel,
  accountId: string,
  event: string,
  payload: any,
) {
  if (!io) {
    return;
  }

  const normalizedAccountId = normalizeRoomId(accountId);
  if (!normalizedAccountId) return;

  const serializablePayload = payload && typeof payload.toObject === "function"
    ? payload.toObject()
    : payload;
  const scopedPayload = serializablePayload && typeof serializablePayload === "object" && !Array.isArray(serializablePayload)
    ? { ...serializablePayload, channel, accountId: normalizedAccountId }
    : { data: serializablePayload, channel, accountId: normalizedAccountId };

  io.to(messengerRoomName(channel, normalizedAccountId)).emit(event, scopedPayload);
}

// Keep legacy platform services buildable while account-scoped callers are migrated.
// Legacy rooms are no longer joined by authenticated clients, so this cannot broadcast chat data globally.
export function emitToPage(pageId: string, event: string, payload: any) {
  if (!io) return;
  const roomId = normalizeRoomId(pageId);
  if (roomId) io.to(`page:${roomId}`).emit(event, payload);
}
