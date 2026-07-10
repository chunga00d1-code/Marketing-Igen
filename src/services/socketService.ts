import { io, Socket } from "socket.io-client";

type SocketConversation = Record<string, unknown>;
type SocketMessage = {
  _id?: string;
  messageId?: string;
  direction?: "inbound" | "outbound";
  text?: string;
  timestamp?: string | Date;
  attachments?: unknown[];
  conversationId?: string | Record<string, string>;
  senderId?: string;
  recipientId?: string;
} & Record<string, unknown>;
type SocketVideoUpdate = {
  _id?: string;
  id?: string;
  url?: string;
  metadata?: {
    status?: string;
    progress?: number;
    renderLogs?: string[];
    error?: string;
    title?: string;
  } & Record<string, unknown>;
} & Record<string, unknown>;
type NewMessagePayload = { message: SocketMessage; conversation: SocketConversation };
type VideoStatusPayload = { videoId: string; status: string; updates: SocketVideoUpdate[] };

class SocketService {
  private socket: Socket | null = null;
  private messageCallbacks: Array<(data: NewMessagePayload) => void> = [];
  private conversationCallbacks: Array<(conversation: SocketConversation) => void> = [];
  private statusCallbacks: Array<(connected: boolean) => void> = [];
  private videoCallbacks: Array<(data: VideoStatusPayload) => void> = [];

  connect(token: string) {
    if (this.socket) {
      console.log("[SocketService] Socket already exists, skipping duplicate connect.");
      return;
    }

    // Determine the socket server URL (same host in local/production)
    const socketUrl = window.location.origin;
    console.log(`[SocketService] Connecting to ${socketUrl}...`);

    this.socket = io(socketUrl, {
      auth: {
        token,
      },
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log(`[SocketService] Connected successfully (Socket ID: ${this.socket?.id})`);
      this.statusCallbacks.forEach((cb) => cb(true));
    });

    this.socket.on("connect_error", (error) => {
      console.error("[SocketService] Connection error:", error.message);
    });

    this.socket.on("disconnect", (reason) => {
      console.warn("[SocketService] Disconnected:", reason);
      this.statusCallbacks.forEach((cb) => cb(false));
    });

    // Listen to incoming messages
    this.socket.on("new_message", (data: NewMessagePayload) => {
      console.log("[SocketService] Received 'new_message' event:", data);
      this.messageCallbacks.forEach((cb) => cb(data));
    });

    // Listen to conversation updates
    this.socket.on("conversation_updated", (conversation: SocketConversation) => {
      console.log("[SocketService] Received 'conversation_updated' event:", conversation);
      this.conversationCallbacks.forEach((cb) => cb(conversation));
    });

    // Listen to video status updates
    this.socket.on("video_status_updated", (data: VideoStatusPayload) => {
      console.log("[SocketService] Received 'video_status_updated' event:", data);
      this.videoCallbacks.forEach((cb) => cb(data));
    });
  }

  disconnect() {
    if (this.socket) {
      console.log("[SocketService] Disconnecting...");
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.statusCallbacks.forEach((cb) => cb(false));
    }
  }

  isConnected() {
    return !!this.socket?.connected;
  }

  onNewMessage(callback: (data: NewMessagePayload) => void) {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter((cb) => cb !== callback);
    };
  }

  onConversationUpdated(callback: (conversation: SocketConversation) => void) {
    this.conversationCallbacks.push(callback);
    return () => {
      this.conversationCallbacks = this.conversationCallbacks.filter((cb) => cb !== callback);
    };
  }

  onVideoStatusUpdated(callback: (data: VideoStatusPayload) => void) {
    this.videoCallbacks.push(callback);
    return () => {
      this.videoCallbacks = this.videoCallbacks.filter((cb) => cb !== callback);
    };
  }

  onStatusChange(callback: (connected: boolean) => void) {
    this.statusCallbacks.push(callback);
    callback(this.isConnected());
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback);
    };
  }

  on(event: string, callback: (data: unknown) => void) {
    const checkAndListen = () => {
      if (this.socket) {
        this.socket.on(event, callback);
      }
    };

    checkAndListen();
    
    // Nếu chưa connect hoặc bị reconnect, tự đăng ký lại
    if (this.socket) {
      this.socket.on("connect", checkAndListen);
    }

    return () => {
      if (this.socket) {
        this.socket.off(event, callback);
        this.socket.off("connect", checkAndListen);
      }
    };
  }
}

export const socketService = new SocketService();
