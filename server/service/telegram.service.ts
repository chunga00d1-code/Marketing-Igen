import { ICRMTicket } from "../interface/crm-ticket.interface";
import { geminiService } from "./gemini.service";
import { cloudinaryService } from "./cloudinary.service";
import { TelegramProcessedUpdateModel } from "../model/telegram-processed-update.model";
import { TelegramSessionModel } from "../model/telegram-session.model";
import { TelegramLinkTokenModel } from "../model/telegram-link-token.model";
import { UserModel } from "../model/user.model";
import { CRMTicketModel } from "../model/crm-ticket.model";
import { TransactionModel } from "../model/transaction.model";
import { ProductModel } from "../model/product.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { facebookPostService } from "./facebook-post.service";
import { tiktokService } from "./tiktok.service";
import mongoose from "mongoose";

const TELEGRAM_API_BASE_URL = process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org";

let pollingActive = false;
let lastOffset = 0;

/** Danh sách role được phép sử dụng lệnh quản trị */
const ADMIN_ROLES = ["admin", "superadmin"];
const TELEGRAM_QUEUE_LIMIT = 5;
const TELEGRAM_DEBUG_PREFIX = `[Telegram Debug][instance=${process.env.INSTANCE_ID || process.env.HOSTNAME || "local"}][pid=${process.pid}]`;

function getTelegramDebugContext(extra?: Record<string, unknown>) {
  const dbName = mongoose.connection?.name || "unknown";
  const base = { db: dbName, ...extra };
  return Object.entries(base)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

function logTelegramDebug(message: string, extra?: Record<string, unknown>) {
  console.log(`${TELEGRAM_DEBUG_PREFIX} ${message}${extra ? ` | ${getTelegramDebugContext(extra)}` : ""}`);
}

function buildSessionScope(session: any) {
  const companyCode = String(session?.companyCode || "").trim();
  const userId = String(session?.userId || "").trim();
  const isAdmin = ADMIN_ROLES.includes(session?.role);

  return {
    companyCode,
    userId,
    isAdmin,
  };
}

async function findTelegramSession(chatId: number, telegramUserId?: number) {
  const conditions: Array<Record<string, unknown>> = [{ telegramChatId: chatId }];
  if (telegramUserId) {
    conditions.push({ telegramUserId });
  }

  return TelegramSessionModel.findOne({ $or: conditions }).lean();
}

async function hydrateLinkedSession(session: any) {
  if (!session?.userId) {
    return session;
  }

  const user = await UserModel.findById(session.userId)
    .select("email displayName role companyCode")
    .lean();

  if (!user) {
    await TelegramSessionModel.deleteOne({ _id: session._id }).catch(() => undefined);
    return null;
  }

  const nextSession = {
    ...session,
    email: user.email,
    displayName: user.displayName || user.email,
    role: user.role || "user",
    companyCode: user.companyCode || "",
  };

  const hasDrift =
    session.email !== nextSession.email ||
    session.displayName !== nextSession.displayName ||
    session.role !== nextSession.role ||
    session.companyCode !== nextSession.companyCode;

  if (hasDrift) {
    await TelegramSessionModel.updateOne(
      { _id: session._id },
      {
        $set: {
          email: nextSession.email,
          displayName: nextSession.displayName,
          role: nextSession.role,
          companyCode: nextSession.companyCode,
        },
      }
    );
    logTelegramDebug("session:hydratedFromUser", {
      sessionUserId: String(session.userId),
      email: nextSession.email,
      role: nextSession.role,
      companyCode: nextSession.companyCode || "-",
    });
  }

  return nextSession;
}

function truncateTelegramText(value: string, maxLength: number): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function normalizeTelegramCommand(rawText: string): { command: string; args: string } {
  const text = String(rawText || "").trim();
  const spaceIndex = text.indexOf(" ");
  const rawCommand = spaceIndex === -1 ? text : text.substring(0, spaceIndex);
  const args = spaceIndex === -1 ? "" : text.substring(spaceIndex + 1).trim();
  const command = rawCommand.replace(/@[^@\s]+$/, "").toLowerCase();

  return { command, args };
}

function buildGuestHelpMessage(): string {
  return [
    "🤖 <b>Chào mừng bạn đến với iGEN ERP Bot!</b>",
    "Để sử dụng bot, bạn hãy liên kết Telegram từ web ERP.",
    "",
    "📌 <b>Cách dùng nhanh:</b>",
    "Web ERP > menu tài khoản > Telegram > mở bot từ link.",
  ].join("\n");
}

function buildSessionHelpMessage(session: any): string {
  const isAdmin = ADMIN_ROLES.includes(session.role);
  const helpLines = [
    `🤖 <b>Xin chào, ${session.displayName}!</b>`,
    `📧 ${session.email} | 🔑 ${session.role}`,
    "",
    "📌 <b>Danh sách câu lệnh:</b>",
    "• <code>/help</code> hoặc <code>/menu</code> - Hiển thị hướng dẫn sử dụng bot.",
    "• <code>/image [mô tả]</code> - Sinh ảnh nghệ thuật AI.",
    "• <code>/video [mô tả]</code> - Sinh video ngắn AI.",
  ];

  if (isAdmin) {
    helpLines.push("• <code>/stats</code> hoặc <code>/report</code> - Báo cáo thống kê CRM và giao dịch.");
    helpLines.push("• <code>/warning_stock</code> hoặc <code>/lowstock</code> - Kiểm tra sản phẩm sắp hết hàng.");
    helpLines.push("• <code>/queue</code> - Xem nhanh các bài marketing đang chờ đăng của công ty.");
    helpLines.push("• <code>/publish_fb [cardId]</code> - Đăng ngay 1 card Facebook đã duyệt.");
    helpLines.push("• <code>/publish_tt [cardId]</code> - Đăng ngay 1 card TikTok đã duyệt.");
  }

  helpLines.push("• <code>/logout</code> - Đăng xuất khỏi bot.");
  return helpLines.join("\n");
}

export const telegramService = {
  /**
   * Gửi thông báo chốt đơn thành công sang Telegram
   */
  async sendLeadWonNotification(lead: ICRMTicket): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn("[TelegramService] TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa được cấu hình trong file .env");
      return;
    }

    try {
      // 1. Xây dựng danh sách sản phẩm chi tiết kèm số lượng và đơn giá
      let productsText = "";
      if (Array.isArray(lead.selectedProducts) && lead.selectedProducts.length > 0) {
        productsText = lead.selectedProducts
          .map((prod) => {
            const price = prod.price || 0;
            const quantity = prod.quantity || 1;
            const subtotal = price * quantity;
            return `• <b>${prod.name}</b>\n  Số lượng: <code>${quantity}</code> x <code>${price.toLocaleString("vi-VN")} đ</code>\n  Thành tiền: <b>${subtotal.toLocaleString("vi-VN")} đ</b>`;
          })
          .join("\n\n");
      } else if (lead.productOfChoice) {
        productsText = `• <b>${lead.productOfChoice}</b>`;
      } else {
        productsText = "• Không có thông tin sản phẩm cụ thể.";
      }

      // 2. Định dạng thông điệp HTML gửi tới Telegram
      const message = [
        "🎉 <b>THÔNG BÁO CHỐT ĐƠN THÀNH CÔNG!</b> 🎉",
        "=============================",
        `👤 <b>Khách hàng:</b> ${lead.customerName}`,
        `🏢 <b>Công ty:</b> ${lead.company || "Cá nhân"}`,
        `📞 <b>Số điện thoại:</b> ${lead.phone || "Chưa bổ sung"}`,
        `✉️ <b>Email:</b> ${lead.email || "Chưa bổ sung"}`,
        "-----------------------------",
        "📦 <b>Chi tiết đơn hàng:</b>",
        productsText,
        "-----------------------------",
        `💰 <b>Tổng giá trị đơn hàng:</b> <code>${(lead.value || 0).toLocaleString("vi-VN")} đ</code>`,
        "=============================",
      ].join("\n");

      await this.sendMessage(chatId, message);
    } catch (error) {
      console.error("[TelegramService] Gặp lỗi khi gửi thông báo tới Telegram:", error);
    }
  },

  /**
   * Helper gửi tin nhắn văn bản định dạng HTML
   */
  async sendMessage(chatId: string | number, text: string): Promise<any> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    try {
      const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Telegram Bot] sendMessage error: ${response.status} - ${errText}`);
      }
      return response.json();
    } catch (err) {
      console.error("[Telegram Bot] Failed to execute sendMessage request:", err);
    }
  },

  /**
   * Helper gửi ảnh lên Telegram qua URL
   */
  async sendPhoto(chatId: string | number, photoUrl: string, caption: string): Promise<any> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    try {
      const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/sendPhoto`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: "HTML",
        }),
      });
      return response.json();
    } catch (err) {
      console.error("[Telegram Bot] Failed to execute sendPhoto request:", err);
    }
  },

  /**
   * Helper gửi video lên Telegram qua URL
   */
  async sendVideo(chatId: string | number, videoUrl: string, caption: string): Promise<any> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    try {
      const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/sendVideo`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          video: videoUrl,
          caption: caption,
          parse_mode: "HTML",
        }),
      });
      return response.json();
    } catch (err) {
      console.error("[Telegram Bot] Failed to execute sendVideo request:", err);
    }
  },

  /**
   * Helper xóa tin nhắn trên Telegram (dùng để xóa tin nhắn chứa mật khẩu)
   */
  async deleteMessage(chatId: string | number, messageId: number): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    try {
      const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/deleteMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Telegram Bot] Không thể xóa tin nhắn ${messageId}: ${errText}`);
      }
    } catch (err) {
      console.warn("[Telegram Bot] Lỗi khi xóa tin nhắn:", err);
    }
  },

  /**
   * Khởi động vòng lặp Polling chạy nền nhận và xử lý lệnh từ người dùng
   */
  async startPolling(): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn("[Telegram Bot] Chưa cấu hình TELEGRAM_BOT_TOKEN trong .env. Bỏ qua chạy Telegram Polling.");
      return;
    }

    if (pollingActive) return;
    pollingActive = true;
    console.log("[Telegram Bot] Đã khởi chạy dịch vụ Telegram Polling nhận tin nhắn.");

    this.pollLoop().catch((err) => {
      console.error("[Telegram Bot] Lỗi nghiêm trọng trong vòng lặp Polling:", err);
      pollingActive = false;
    });
  },

  /**
   * Vòng lặp lấy thông tin tin nhắn liên tục (Long Polling)
   */
  async pollLoop(): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    while (pollingActive) {
      try {
        const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/getUpdates?offset=${lastOffset + 1}&timeout=30`;
        const response = await fetch(url, { method: "GET" });
        if (!response.ok) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        const body: any = await response.json();
        if (body.ok && Array.isArray(body.result)) {
          for (const update of body.result) {
            lastOffset = Math.max(lastOffset, update.update_id);

            // === CHỐNG TRÙNG LẶP: Thử chèn update_id vào MongoDB ===
            try {
              await TelegramProcessedUpdateModel.create({ updateId: update.update_id });
            } catch (dupErr: any) {
              if (dupErr?.code === 11000) {
                // Đã có tiến trình khác xử lý update này rồi → bỏ qua
                continue;
              }
              console.error("[Telegram Bot] Lỗi ghi update_id vào DB:", dupErr);
            }

            if (update.message) {
              const text = (update.message.text || update.message.caption || "").trim();
              const photo = update.message.photo;
              const document = update.message.document;
              const replyToMessage = update.message.reply_to_message;
              const chatId = update.message.chat.id;
              const chatType = String(update.message.chat.type || "private").toLowerCase();
              const telegramUserId = update.message.from?.id;
              const messageId = update.message.message_id;

              if (text.startsWith("/")) {
                // Xử lý tuần tự từng command để tránh race condition giữa /link và lệnh ngay sau đó như /help.
                await this.handleCommand(chatId, chatType, telegramUserId, text, photo, document, replyToMessage, messageId);
              }
            }
          }
        }
      } catch (err: any) {
        const errStr = err?.message || String(err);
        const isTimeout = errStr.includes("ETIMEDOUT") || errStr.includes("fetch failed") || errStr.includes("timeout") || err?.code === "ETIMEDOUT";
        if (isTimeout) {
          console.warn(`[Telegram Bot] Lỗi kết nối API getUpdates (Timeout/Network): ${errStr}. Sẽ thử lại sau 5s...`);
        } else {
          console.error("[Telegram Bot] Lỗi kết nối API getUpdates:", err);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  },

  /**
   * Phân tích và điều phối các câu lệnh được nhập từ Telegram Chat
   */
  async handleCommand(
    chatId: number,
    chatType: string,
    telegramUserId: number | undefined,
    text: string,
    photo?: any[],
    document?: any,
    replyToMessage?: any,
    messageId?: number
  ): Promise<void> {
    const normalizedInput = normalizeTelegramCommand(text);
    const command = normalizedInput.command === "/menu" ? "/help" : normalizedInput.command;
    const args = normalizedInput.args;

    logTelegramDebug("handleCommand:start", {
      chatId,
      chatType,
      telegramUserId: telegramUserId ?? "none",
      command,
      args: args || "-",
      messageId: messageId ?? "none",
    });

    if (chatType !== "private") {
      await this.sendMessage(
        chatId,
        "🔒 Bot này chỉ hỗ trợ chat riêng 1-1. Vui lòng mở bot từ link trong web ERP và sử dụng trong cửa sổ chat riêng."
      );
      return;
    }

    if (command === "/start" && args) {
      await this.handleCommand(chatId, chatType, telegramUserId, `/link ${args}`, photo, document, replyToMessage, messageId);
      return;
    }

    // === XỬ LÝ ĐĂNG NHẬP ===
    if (command === "/link") {
      const normalizedCode = String(args || "").trim().toUpperCase();
      logTelegramDebug("link:attempt", {
        chatId,
        telegramUserId: telegramUserId ?? "none",
        code: normalizedCode || "-",
      });
      if (!normalizedCode) {
        await this.sendMessage(chatId, "⚠️ Vui lòng nhập mã liên kết. Ví dụ: <code>/link ABC123</code>");
        return;
      }

      try {
        const linkToken = await TelegramLinkTokenModel.findOneAndDelete({ code: normalizedCode });
        logTelegramDebug("link:tokenLookup", {
          chatId,
          telegramUserId: telegramUserId ?? "none",
          code: normalizedCode,
          foundToken: !!linkToken,
          tokenUserId: linkToken?.userId ? String(linkToken.userId) : "none",
          tokenExpiresAt: linkToken?.expiresAt ? linkToken.expiresAt.toISOString() : "none",
        });
        if (!linkToken) {
          await this.sendMessage(chatId, "❌ Mã liên kết không hợp lệ hoặc đã hết hạn. Hãy tạo mã mới từ web ERP.");
          return;
        }

        if (linkToken.expiresAt.getTime() <= Date.now()) {
          await this.sendMessage(chatId, "⌛ Mã liên kết đã hết hạn. Hãy tạo mã mới từ web ERP.");
          return;
        }

        const user = await UserModel.findById(linkToken.userId);
        if (!user) {
          await this.sendMessage(chatId, "❌ Không tìm thấy tài khoản ERP tương ứng với mã liên kết.");
          return;
        }

        await TelegramSessionModel.deleteMany({
          $or: [
            { telegramChatId: chatId },
            { userId: user._id },
            ...(telegramUserId ? [{ telegramUserId }] : []),
          ],
        });

        await TelegramSessionModel.create({
          telegramChatId: chatId,
          telegramUserId,
          userId: user._id,
          email: user.email,
          displayName: user.displayName || user.email,
          role: user.role || "user",
          companyCode: user.companyCode || "",
        });

        logTelegramDebug("link:sessionCreated", {
          chatId,
          telegramUserId: telegramUserId ?? "none",
          userId: String(user._id),
          email: user.email,
          companyCode: user.companyCode || "-",
        });

        const linkedSession = {
          telegramChatId: chatId,
          telegramUserId,
          userId: user._id,
          email: user.email,
          displayName: user.displayName || user.email,
          role: user.role || "user",
          companyCode: user.companyCode || "",
        };

        await this.sendMessage(chatId, [
          "✅ <b>Liên kết Telegram thành công!</b>",
          `👤 Xin chào, <b>${user.displayName}</b>`,
          `📧 Email: <code>${user.email}</code>`,
          "Gõ /help để xem danh sách lệnh khả dụng.",
        ].join("\n"));
        await this.sendMessage(chatId, buildSessionHelpMessage(linkedSession));
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi xử lý liên kết Telegram:", err);
        await this.sendMessage(chatId, "❌ Lỗi hệ thống khi liên kết Telegram. Vui lòng thử lại sau.");
      }
      return;
    }

    if (command === "/login") {
      if (messageId) {
        await this.deleteMessage(chatId, messageId);
      }
      await this.sendMessage(
        chatId,
        "🔗 Đăng nhập bằng mật khẩu trên Telegram đã được tắt.\nVui lòng vào web ERP > menu tài khoản > Telegram > mở bot từ link liên kết."
      );
      return;
    }

    // === XỬ LÝ ĐĂNG XUẤT ===
    if (command === "/logout") {
      try {
        const deleted = await TelegramSessionModel.findOneAndDelete({
          $or: [
            { telegramChatId: chatId },
            ...(telegramUserId ? [{ telegramUserId }] : []),
          ],
        });
        if (deleted) {
          await this.sendMessage(chatId, "👋 <b>Đã đăng xuất thành công.</b>\nHãy mở lại link liên kết từ web ERP nếu muốn dùng lại bot.");
        } else {
          await this.sendMessage(chatId, "⚠️ Telegram này chưa được liên kết với tài khoản nào.");
        }
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi xử lý đăng xuất:", err);
        await this.sendMessage(chatId, "❌ Lỗi hệ thống khi đăng xuất.");
      }
      return;
    }

    // === TRA CỨU SESSION HIỆN TẠI ===
    let session: any = null;
    try {
      session = await findTelegramSession(chatId, telegramUserId);
      logTelegramDebug("session:lookup", {
        chatId,
        telegramUserId: telegramUserId ?? "none",
        command,
        foundSession: !!session,
        sessionChatId: session?.telegramChatId ?? "none",
        sessionTelegramUserId: session?.telegramUserId ?? "none",
        sessionUserId: session?.userId ? String(session.userId) : "none",
        sessionEmail: session?.email || "none",
        sessionRole: session?.role || "none",
      });
      if (session && (session.telegramChatId !== chatId || (telegramUserId && session.telegramUserId !== telegramUserId))) {
        await TelegramSessionModel.updateOne(
          { _id: session._id },
          {
            $set: {
              telegramChatId: chatId,
              telegramUserId,
            },
          }
        );
        session.telegramChatId = chatId;
        session.telegramUserId = telegramUserId;
        logTelegramDebug("session:repaired", {
          chatId,
          sessionChatId: session?.telegramChatId ?? "none",
          sessionUserId: session?.userId ? String(session.userId) : "none",
          telegramUserId: telegramUserId ?? "none",
        });
      }
      if (session) {
        session = await hydrateLinkedSession(session);
      }
    } catch (err) {
      console.error("[Telegram Bot] Lỗi tra cứu session:", err);
    }

    // === LỆNH CÔNG KHAI: /start, /help ===
    if (command === "/start" || command === "/help") {
      if (!session) {
        // Chưa liên kết → hiển thị hướng dẫn liên kết
        const guestHelp = [
          "🤖 <b>Chào mừng bạn đến với iGEN ERP Bot!</b>",
          "Để sử dụng bot, bạn hãy liên kết Telegram từ web ERP.",
          "",
          "📌 <b>Cách dùng nhanh:</b>",
          "Web ERP > menu tài khoản > Telegram > mở bot từ link.",
        ].join("\n");
        await this.sendMessage(chatId, buildGuestHelpMessage());
      } else {
        const isAdmin = ADMIN_ROLES.includes(session.role);
        const helpLines = [
          `🤖 <b>Xin chào, ${session.displayName}!</b>`,
          `📧 ${session.email} | 🔑 ${session.role}`,
          "",
          "📌 <b>Danh sách câu lệnh:</b>",
          "• <code>/help</code> - Hiển thị hướng dẫn sử dụng bot.",
          "• <code>/image [mô tả]</code> - Sinh ảnh nghệ thuật AI.",
          "• <code>/video [mô tả]</code> - Sinh video ngắn AI.",
        ];
        if (isAdmin) {
          helpLines.push("• <code>/stats</code> hoặc <code>/report</code> - Báo cáo thống kê CRM và giao dịch.");
          helpLines.push("• <code>/warning_stock</code> hoặc <code>/lowstock</code> - Kiểm tra sản phẩm sắp hết hàng.");
          helpLines.push("• <code>/queue</code> - Xem nhanh các bài marketing đang chờ đăng của công ty.");
          helpLines.push("• <code>/publish_fb [cardId]</code> - Đăng ngay 1 card Facebook đã duyệt.");
          helpLines.push("• <code>/publish_tt [cardId]</code> - Đăng ngay 1 card TikTok đã duyệt.");
        }
        helpLines.push("• <code>/logout</code> - Đăng xuất khỏi bot.");
        await this.sendMessage(chatId, buildSessionHelpMessage(session));
      }
      return;
    }

    // === CÁC LỆNH CÒN LẠI: YÊU CẦU ĐĂNG NHẬP ===
    if (!session) {
      await this.sendMessage(chatId, "🔗 Bạn cần liên kết Telegram từ web ERP trước khi sử dụng lệnh này.");
      return;
    }

    // === KIỂM TRA QUYỀN QUẢN TRỊ CHO LỆNH NHẠY CẢM ===
    const adminCommands = ["/stats", "/report", "/warning_stock", "/lowstock", "/queue", "/publish_fb", "/publish_tt"];
    if (adminCommands.includes(command) && !ADMIN_ROLES.includes(session.role)) {
      await this.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này. Lệnh này chỉ dành cho quản trị viên.");
      return;
    }

    if (command === "/queue") {
      try {
        const scope = buildSessionScope(session);
        if (!scope.companyCode) {
          await this.sendMessage(chatId, "⚠️ Tài khoản của bạn chưa có companyCode nên bot chưa thể đọc hàng chờ đăng một cách an toàn.");
          return;
        }

        const cards = await MarketingContentModel.find({
          companyCode: scope.companyCode,
          status: { $in: ["approved", "scheduled", "processing", "failed"] },
          channel: { $in: ["Facebook", "TikTok"] },
        })
          .sort({ generatedAt: -1 })
          .limit(TELEGRAM_QUEUE_LIMIT)
          .lean();

        if (!cards.length) {
          await this.sendMessage(chatId, "📭 Hiện chưa có card Facebook/TikTok nào đang chờ xử lý trong công ty của bạn.");
          return;
        }

        const lines = [
          "🗂️ <b>HÀNG CHỜ ĐĂNG MARKETING</b>",
          `Hiển thị ${cards.length} card mới nhất trong phạm vi công ty <code>${scope.companyCode}</code>:`,
          "",
        ];

        cards.forEach((card: any, index: number) => {
          lines.push(
            `${index + 1}. <b>${truncateTelegramText(card.title || "Không có tiêu đề", 80)}</b>`,
            `• ID: <code>${card._id}</code>`,
            `• Kênh: <b>${card.channel}</b> | Trạng thái: <b>${card.status}</b>`,
            `• Nội dung: ${truncateTelegramText(card.bodyText || "", 120) || "Chưa có nội dung"}`,
            ""
          );
        });

        lines.push("Dùng <code>/publish_fb [cardId]</code> hoặc <code>/publish_tt [cardId]</code> để đăng ngay.");
        await this.sendMessage(chatId, lines.join("\n"));
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi tải hàng chờ đăng:", err);
        await this.sendMessage(chatId, `❌ Không thể tải hàng chờ đăng: ${err.message || err}`);
      }
      return;
    }

    if (command === "/publish_fb") {
      try {
        const scope = buildSessionScope(session);
        const cardId = String(args || "").trim();

        if (!scope.companyCode) {
          await this.sendMessage(chatId, "⚠️ Tài khoản của bạn chưa có companyCode nên bot không thể đăng bài an toàn.");
          return;
        }
        if (!cardId) {
          await this.sendMessage(chatId, "⚠️ Sử dụng: <code>/publish_fb cardId</code>");
          return;
        }

        const card = await this.getScopedMarketingCard(cardId, scope.companyCode, "Facebook");
        const integration = await this.resolveScopedIntegration(card, scope.companyCode, "Facebook");
        if (!integration.accessToken || !integration.username) {
          throw new Error("Thiếu access token hoặc pageId Facebook trong tài khoản liên kết.");
        }

        await this.sendMessage(
          chatId,
          `🚀 <b>Đang gửi bài Facebook...</b>\nTiêu đề: <b>${truncateTelegramText(card.title || "Không có tiêu đề", 80)}</b>\nCard ID: <code>${card._id}</code>`
        );

        const result = await facebookPostService.publishToPage(
          card.bodyText || "",
          card.imageUrl || "",
          card.videoUrl || "",
          integration.username,
          integration.accessToken,
          String(card._id),
          "immediate",
          undefined,
          card.title || ""
        );

        const fbData = result?.data?.data ?? result?.data ?? {};
        const postId = String(fbData.id || fbData.post_id || "").trim();
        const postUrl = String(fbData.postUrl || fbData.permalink_url || "").trim();

        await MarketingContentModel.findByIdAndUpdate(card._id, {
          status: "published",
          publishedAt: new Date(),
          facebookPostId: postId || card.facebookPostId || "",
          postUrl: postUrl || card.postUrl || "",
          publishError: null,
        });

        await this.sendMessage(
          chatId,
          [
            "✅ <b>Đăng Facebook thành công</b>",
            `Tiêu đề: <b>${truncateTelegramText(card.title || "Không có tiêu đề", 80)}</b>`,
            `Card ID: <code>${card._id}</code>`,
            postId ? `Post ID: <code>${postId}</code>` : "",
            postUrl ? `Link bài đăng: <a href="${postUrl}">${postUrl}</a>` : "",
          ]
            .filter(Boolean)
            .join("\n")
        );
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi đăng Facebook từ Telegram:", err);
        if (args) {
          await MarketingContentModel.findByIdAndUpdate(String(args).trim(), {
            status: "failed",
            publishError: err.message || String(err),
          }).catch(() => undefined);
        }
        await this.sendMessage(chatId, `❌ Đăng Facebook thất bại: ${err.message || err}`);
      }
      return;
    }

    if (command === "/publish_tt") {
      try {
        const scope = buildSessionScope(session);
        const cardId = String(args || "").trim();

        if (!scope.companyCode) {
          await this.sendMessage(chatId, "⚠️ Tài khoản của bạn chưa có companyCode nên bot không thể đăng bài an toàn.");
          return;
        }
        if (!cardId) {
          await this.sendMessage(chatId, "⚠️ Sử dụng: <code>/publish_tt cardId</code>");
          return;
        }

        const card = await this.getScopedMarketingCard(cardId, scope.companyCode, "TikTok");
        if (!card.videoUrl) {
          throw new Error("Card TikTok này chưa có videoUrl nên chưa thể đăng.");
        }

        await this.resolveScopedIntegration(card, scope.companyCode, "TikTok");
        await this.sendMessage(
          chatId,
          `🚀 <b>Đang gửi video TikTok...</b>\nTiêu đề: <b>${truncateTelegramText(card.title || "Không có tiêu đề", 80)}</b>\nCard ID: <code>${card._id}</code>`
        );

        const result = await tiktokService.publishVideo(
          String(card._id),
          card.bodyText || card.title || "",
          card.videoUrl,
          "SELF_ONLY",
          undefined,
          undefined,
          undefined,
          card.integrationId ? String(card.integrationId) : undefined,
          scope.companyCode
        );

        await tiktokService.registerPublishTracking(String(card._id), result);

        const data = (result?.data || {}) as {
          postId?: string;
          shareUrl?: string;
          publishStatus?: string;
        };
        const postId = String(data.postId || "").trim();
        const shareUrl = String(data.shareUrl || "").trim();
        const publishStatus = String(data.publishStatus || result.status || "").trim().toUpperCase();
        const isSuccess = result.status === "success";

        await MarketingContentModel.findByIdAndUpdate(card._id, {
          status: isSuccess ? "published" : "processing",
          publishedAt: isSuccess ? new Date() : card.publishedAt,
          tiktokPostId: postId || card.tiktokPostId || "",
          tiktokShareUrl: shareUrl || card.tiktokShareUrl || "",
          publishError: null,
        });

        await this.sendMessage(
          chatId,
          [
            isSuccess ? "✅ <b>Đăng TikTok thành công</b>" : "⏳ <b>TikTok đang xử lý video</b>",
            `Tiêu đề: <b>${truncateTelegramText(card.title || "Không có tiêu đề", 80)}</b>`,
            `Card ID: <code>${card._id}</code>`,
            publishStatus ? `Trạng thái: <b>${publishStatus}</b>` : "",
            postId ? `Post ID: <code>${postId}</code>` : "",
            shareUrl ? `Link video: <a href="${shareUrl}">${shareUrl}</a>` : "",
          ]
            .filter(Boolean)
            .join("\n")
        );
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi đăng TikTok từ Telegram:", err);
        if (args) {
          await MarketingContentModel.findByIdAndUpdate(String(args).trim(), {
            status: "failed",
            publishError: err.message || String(err),
          }).catch(() => undefined);
        }
        await this.sendMessage(chatId, `❌ Đăng TikTok thất bại: ${err.message || err}`);
      }
      return;
    }

    if (command === "/image") {
      if (!args) {
        await this.sendMessage(chatId, "⚠️ Vui lòng cung cấp mô tả ảnh. Ví dụ: <code>/image chú mèo con bay trên đám mây</code>");
        return;
      }

      let refImageUrl: string | undefined;
      try {
        refImageUrl = await this.resolveTelegramReferenceImage(chatId, photo, document, replyToMessage);
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi tải ảnh tham chiếu:", err);
        await this.sendMessage(chatId, `⚠️ Không thể xử lý ảnh tham chiếu: ${err.message || err}. Hệ thống sẽ tạo ảnh không có ảnh tham chiếu.`);
      }

      await this.sendMessage(chatId, `🎨 <b>Đang gửi yêu cầu tạo ảnh AI...</b>\nMô tả: <i>${args}</i>${refImageUrl ? "\n📎 <i>Có ảnh tham chiếu đi kèm</i>" : ""}\nVui lòng đợi trong giây lát.`);

      try {
        const result = await geminiService.generateImage(
          args,
          refImageUrl ? { existingImageUris: [refImageUrl] } : undefined
        );
        if (result && result.url) {
          const sendRes = await this.sendPhoto(chatId, result.url, `🎨 <b>Ảnh được tạo thành công!</b>\nMô tả: <i>${args}</i>`);
          if (!sendRes || !sendRes.ok) {
            // Gửi tin nhắn dạng văn bản kèm liên kết nếu Telegram không hiển thị được ảnh trực tiếp
            await this.sendMessage(
              chatId,
              `🎨 <b>Ảnh được tạo thành công!</b>\nMô tả: <i>${args}</i>\n\n🔗 <a href="${result.url}">Nhấn vào đây để tải và xem ảnh trực tiếp</a>`
            );
          }
        } else {
          await this.sendMessage(chatId, "❌ Quá trình tạo ảnh không thành công. Hãy thử lại mô tả khác.");
        }
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi tạo ảnh:", err);
        await this.sendMessage(chatId, `❌ Lỗi hệ thống khi tạo ảnh: ${err.message || err}`);
      }
      return;
    }

    if (command === "/video") {
      if (!args) {
        await this.sendMessage(chatId, "⚠️ Vui lòng cung cấp mô tả video. Ví dụ: <code>/video dòng thác đổ trong rừng nguyên sinh</code>");
        return;
      }

      let refImageUrl: string | undefined;
      try {
        refImageUrl = await this.resolveTelegramReferenceImage(chatId, photo, document, replyToMessage);
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi tải ảnh tham chiếu:", err);
        await this.sendMessage(chatId, `⚠️ Không thể xử lý ảnh tham chiếu: ${err.message || err}. Hệ thống sẽ tạo video không có ảnh tham chiếu.`);
      }

      await this.sendMessage(chatId, `🎬 <b>Đã nhận yêu cầu sinh video AI...</b>\nMô tả: <i>${args}</i>${refImageUrl ? "\n📎 <i>Có ảnh tham chiếu đi kèm</i>" : ""}\nBot sẽ xử lý nền và tự gửi kết quả khi hoàn tất.`);

      void (async () => {
        try {
          const result = await geminiService.generateVideo(
            args,
            6,
            refImageUrl ? { referenceImageUris: [refImageUrl] } : undefined
          );
          if (result && result.url) {
            if (result.url.startsWith("pending://piapi/")) {
              const taskId = result.url.replace("pending://piapi/", "");
              await this.sendMessage(chatId, "⏳ <b>Video đang được render trên máy chủ AI...</b>\nBot sẽ tự gửi video khi hoàn tất.");
              const completedVideoUrl = await this.waitForPiapiVideo(taskId);
              const sendRes = await this.sendVideo(chatId, completedVideoUrl, `🎬 <b>Video được tạo thành công!</b>\nMô tả: <i>${args}</i>`);
              if (!sendRes || !sendRes.ok) {
                await this.sendMessage(
                  chatId,
                  `🎬 <b>Video đã render xong!</b>\nMô tả: <i>${args}</i>\n\n🔗 <a href="${completedVideoUrl}">Nhấn vào đây để tải và xem video trực tiếp</a>`
                );
              }
            } else {
              const sendRes = await this.sendVideo(chatId, result.url, `🎬 <b>Video được tạo thành công!</b>\nMô tả: <i>${args}</i>`);
              if (!sendRes || !sendRes.ok) {
                await this.sendMessage(
                  chatId,
                  `🎬 <b>Video được tạo thành công!</b>\nMô tả: <i>${args}</i>\n\n🔗 <a href="${result.url}">Nhấn vào đây để tải và xem video trực tiếp</a>`
                );
              }
            }
          } else {
            await this.sendMessage(chatId, "❌ Quá trình tạo video không thành công. Hãy thử lại sau.");
          }
        } catch (err: any) {
          console.error("[Telegram Bot] Lỗi tạo video:", err);
          await this.sendMessage(chatId, `❌ Lỗi hệ thống khi tạo video: ${err.message || err}`);
        }
      })();
      return;
    }

    if (command === "/report" || command === "/stats") {
      await this.sendMessage(chatId, "📊 <b>Đang truy vấn hệ thống để lập báo cáo, vui lòng đợi...</b>");
      try {
        const scope = buildSessionScope(session);
        if (!scope.companyCode) {
          await this.sendMessage(chatId, "⚠️ Tài khoản của bạn chưa được gắn companyCode nên bot không thể truy xuất dữ liệu an toàn.");
          return;
        }

        const companyUsers = await UserModel.find({ companyCode: scope.companyCode }, { _id: 1 }).lean();
        const companyUserIds = companyUsers.map((item: any) => String(item._id));

        // 1. CRM Stats
        const tickets = await CRMTicketModel.find({ companyCode: scope.companyCode }).lean();
        const totalLeads = tickets.length;
        let cold = 0, warm = 0, hot = 0, won = 0, upsell = 0;
        let totalWonValue = 0;

        for (const t of tickets) {
          if (t.status === "cold") cold++;
          else if (t.status === "warm") warm++;
          else if (t.status === "hot") hot++;
          else if (t.status === "won") {
            won++;
            totalWonValue += Number(t.value || 0);
          } else if (t.status === "upsell") {
            upsell++;
            totalWonValue += Number(t.value || 0);
          }
        }

        // 2. Transaction Stats
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const transactionUserIds = scope.isAdmin ? companyUserIds : [scope.userId];
        const allSuccessTransactions = await TransactionModel.find({
          status: "success",
          userId: { $in: transactionUserIds },
        }).lean();
        const todaySuccessTransactions = await TransactionModel.find({
          status: "success",
          userId: { $in: transactionUserIds },
          createdAt: { $gte: startOfDay },
        }).lean();

        const totalTransactedAmount = allSuccessTransactions.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
        const todayTransactedAmount = todaySuccessTransactions.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);

        // 3. Low stock alert stats
        const allProducts = await ProductModel.find({ companyCode: scope.companyCode }).lean();
        const lowStockProducts = allProducts.filter((p: any) => {
          const stock = typeof p.stock === "number" ? p.stock : 0;
          const minAlert = typeof p.minStockAlert === "number" ? p.minStockAlert : 15;
          return stock <= minAlert;
        });

        const report = [
          "📊 <b>BÁO CÁO THỐNG KÊ DOANH NGHIỆP</b> 📊",
          "=============================",
          "👥 <b>QUẢN LÝ CƠ HỘI CRM (LEADS):</b>",
          `• Tổng số cơ hội: <b>${totalLeads}</b>`,
          `• ❄️ Thụ động (Cold): <b>${cold}</b>`,
          `• 🔥 Tiềm năng (Warm/Hot): <b>${warm + hot}</b>`,
          `• 🎉 Đã chốt đơn (Won/Upsell): <b>${won + upsell}</b>`,
          `• 💰 Tổng giá trị chốt đơn: <b>${totalWonValue.toLocaleString("vi-VN")} VND</b>`,
          "",
          "💳 <b>GIAO DỊCH & THANH TOÁN (PAYMENTS):</b>",
          `• Hôm nay: <b>+${todayTransactedAmount.toLocaleString("vi-VN")} VND</b> (${todaySuccessTransactions.length} GD thành công)`,
          `• Tổng tích lũy: <b>${totalTransactedAmount.toLocaleString("vi-VN")} VND</b> (${allSuccessTransactions.length} GD)`,
          "",
          "📦 <b>CẢNH BÁO TỒN KHO:</b>",
          `• Số sản phẩm dưới định mức: <b>${lowStockProducts.length}</b> sản phẩm`,
        ];

        if (lowStockProducts.length > 0) {
          report.push("");
          report.push("⚠️ <b>Chi tiết sản phẩm sắp hết hàng:</b>");
          lowStockProducts.slice(0, 5).forEach((p: any) => {
            report.push(`- <b>${p.name}</b> (SKU: <code>${p.sku}</code>): Tồn <b>${p.stock}</b> (Định mức: ${p.minStockAlert})`);
          });
          if (lowStockProducts.length > 5) {
            report.push(`<i>...và ${lowStockProducts.length - 5} sản phẩm khác.</i>`);
          }
        } else {
          report.push("✅ Tồn kho tất cả sản phẩm đều ở mức an toàn.");
        }

        report.push("=============================");
        report.push(`🕒 <i>Báo cáo lúc: ${new Date().toLocaleString("vi-VN")}</i>`);

        await this.sendMessage(chatId, report.join("\n"));
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi tạo báo cáo stats:", err);
        await this.sendMessage(chatId, `❌ Lỗi hệ thống khi lập báo cáo: ${err.message || err}`);
      }
      return;
    }

    if (command === "/warning_stock" || command === "/lowstock") {
      await this.sendMessage(chatId, "🔍 <b>Đang quét danh sách tồn kho thấp...</b>");
      try {
        const scope = buildSessionScope(session);
        if (!scope.companyCode) {
          await this.sendMessage(chatId, "⚠️ Tài khoản của bạn chưa được gắn companyCode nên bot không thể truy xuất dữ liệu an toàn.");
          return;
        }

        const allProducts = await ProductModel.find({ companyCode: scope.companyCode }).lean();
        const lowStockProducts = allProducts.filter((p: any) => {
          const stock = typeof p.stock === "number" ? p.stock : 0;
          const minAlert = typeof p.minStockAlert === "number" ? p.minStockAlert : 15;
          return stock <= minAlert;
        });

        if (lowStockProducts.length === 0) {
          await this.sendMessage(chatId, "✅ <b>Tất cả sản phẩm đều có mức tồn kho an toàn!</b>");
          return;
        }

        const msgLines = [
          `⚠️ <b>CÓ ${lowStockProducts.length} SẢN PHẨM SẮP HẾT HÀNG:</b>`,
          "=============================",
        ];

        lowStockProducts.forEach((p: any) => {
          msgLines.push(`• <b>${p.name}</b> (SKU: <code>${p.sku}</code>)`);
          msgLines.push(`  Tồn: <b>${p.stock}</b> / Định mức: ${p.minStockAlert} ${p.unit || "Cái"}`);
        });

        msgLines.push("=============================");
        msgLines.push("👉 <i>Vui lòng lên kế hoạch nhập hàng sớm.</i>");

        await this.sendMessage(chatId, msgLines.join("\n"));
      } catch (err: any) {
        console.error("[Telegram Bot] Lỗi quét tồn kho thấp:", err);
        await this.sendMessage(chatId, `❌ Lỗi hệ thống: ${err.message || err}`);
      }
      return;
    }

    await this.sendMessage(chatId, "⚠️ Câu lệnh không được hỗ trợ. Hãy gõ /help để xem các lệnh khả dụng.");
  },

  async resolveTelegramReferenceImage(
    chatId: number,
    photo?: any[],
    document?: any,
    replyToMessage?: any
  ): Promise<string | undefined> {
    const fileId = this.extractTelegramImageFileId(photo, document)
      || this.extractTelegramImageFileId(replyToMessage?.photo, replyToMessage?.document);

    if (!fileId) {
      return undefined;
    }

    await this.sendMessage(chatId, "📥 <b>Đang tải ảnh tham chiếu từ Telegram...</b>");
    const buffer = await this.downloadTelegramFile(fileId);
    return cloudinaryService.uploadMediaBuffer(buffer, "telegram_refs");
  },

  extractTelegramImageFileId(photo?: any[], document?: any): string | undefined {
    if (photo && photo.length > 0) {
      return photo[photo.length - 1].file_id;
    }

    if (document?.file_id) {
      const mimeType = String(document.mime_type || "").toLowerCase();
      if (mimeType.startsWith("image/")) {
        return document.file_id;
      }
      throw new Error("File đính kèm không phải ảnh hợp lệ. Hãy gửi ảnh dưới dạng photo hoặc file image/*.");
    }

    return undefined;
  },

  async waitForPiapiVideo(taskId: string): Promise<string> {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const result = await geminiService.getPiapiTaskStatus(taskId);
      if (result.status === "completed" && result.url) {
        return result.url;
      }
      if (result.status === "failed") {
        throw new Error(result.error || "Render video thất bại trên PiAPI.");
      }
      attempts++;
    }

    throw new Error("Quá thời gian chờ render video từ PiAPI.");
  },

  /**
   * Tải tệp tin từ Telegram về dưới dạng Buffer
   */
  async downloadTelegramFile(fileId: string): Promise<Buffer> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("Chưa cấu hình TELEGRAM_BOT_TOKEN");

    const getFileUrl = `${TELEGRAM_API_BASE_URL}/bot${botToken}/getFile?file_id=${fileId}`;
    const res = await fetch(getFileUrl);
    if (!res.ok) throw new Error("Không thể truy vấn thông tin tệp tin từ Telegram");

    const body: any = await res.json();
    if (!body.ok || !body.result?.file_path) {
      throw new Error("Không tìm thấy đường dẫn tệp tin trên hệ thống Telegram");
    }

    const filePath = body.result.file_path;
    const downloadUrl = `${TELEGRAM_API_BASE_URL}/file/bot${botToken}/${filePath}`;
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) throw new Error("Không thể tải tệp tin từ Telegram");

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  async getScopedMarketingCard(cardId: string, companyCode: string, expectedChannel: "Facebook" | "TikTok"): Promise<any> {
    const card = await MarketingContentModel.findOne({
      _id: cardId,
      companyCode,
      channel: expectedChannel,
    });

    if (!card) {
      throw new Error(`Không tìm thấy card ${expectedChannel} thuộc công ty của bạn.`);
    }

    if (!["approved", "scheduled", "failed", "processing"].includes(String(card.status || ""))) {
      throw new Error(`Card hiện ở trạng thái "${card.status}" nên chưa phù hợp để đăng lại từ Telegram.`);
    }

    if (expectedChannel === "Facebook" && !card.bodyText) {
      throw new Error("Card Facebook chưa có nội dung bodyText.");
    }

    return card;
  },

  async resolveScopedIntegration(card: any, companyCode: string, platform: "Facebook" | "TikTok"): Promise<any> {
    let integration = null;

    if (card.integrationId) {
      integration = await SocialIntegrationModel.findOne({
        _id: card.integrationId,
        companyCode,
        platform,
        isConnected: true,
      }).lean();
    }

    if (!integration) {
      integration = await SocialIntegrationModel.findOne({
        companyCode,
        platform,
        isConnected: true,
      })
        .sort({ connectedAt: -1, _id: -1 })
        .lean();
    }

    if (!integration) {
      throw new Error(`Chưa có tài khoản ${platform} nào đang kết nối cho công ty này.`);
    }

    return integration;
  },

  /**
   * Gửi cảnh báo khi tồn kho giảm xuống dưới ngưỡng an toàn
   */
  async sendLowStockAlert(product: any): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const message = [
      "⚠️ <b>CẢNH BÁO: TỒN KHO THẤP!</b> ⚠️",
      "=============================",
      `📦 <b>Sản phẩm:</b> ${product.name}`,
      `🏷️ <b>Mã SKU:</b> <code>${product.sku}</code>`,
      `🔴 <b>Tồn kho hiện tại:</b> <b>${product.stock}</b> ${product.unit || "Cái"}`,
      `🛡️ <b>Ngưỡng tối thiểu:</b> ${product.minStockAlert || 15} ${product.unit || "Cái"}`,
      `🏢 <b>Mã công ty:</b> <code>${product.companyCode || "unknown"}</code>`,
      "=============================",
      "👉 <i>Vui lòng lên kế hoạch nhập thêm hàng để tránh gián đoạn kinh doanh.</i>"
    ].join("\n");

    await this.sendMessage(chatId, message).catch((err) => {
      console.error("[Telegram Bot] Lỗi gửi cảnh báo tồn kho thấp:", err);
    });
  },

  /**
   * Gửi cảnh báo mất kết nối liên kết mạng xã hội (Token hết hạn/lỗi)
   */
  async sendIntegrationDisconnectAlert(
    platform: string,
    displayName: string,
    username: string,
    companyCode: string,
    reason: string
  ): Promise<void> {
    // 1. Cập nhật trạng thái isConnected = false trong DB
    try {
      await SocialIntegrationModel.findOneAndUpdate(
        { platform: platform as any, username },
        { isConnected: false }
      );
      console.log(`[Telegram Service] Đã cập nhật trạng thái kết nối tài khoản ${platform} (${username}) thành disconnected.`);
    } catch (dbErr) {
      console.error("[Telegram Service] Lỗi cập nhật trạng thái liên kết trong DB:", dbErr);
    }

    // 2. Gửi tin nhắn cảnh báo tới Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const message = [
      "⚠️ <b>CẢNH BÁO: MẤT KẾT NỐI LIÊN KẾT MẠNG XÃ HỘI!</b> ⚠️",
      "=============================",
      `🌐 <b>Nền tảng:</b> <b>${platform}</b>`,
      `👤 <b>Tài khoản:</b> <b>${displayName}</b> (ID: <code>${username}</code>)`,
      `🏢 <b>Mã công ty:</b> <code>${companyCode || "unknown"}</code>`,
      `🔴 <b>Lý do:</b> <i>${reason}</i>`,
      "=============================",
      "👉 <i>Vui lòng truy cập Cấu hình ERP để kết nối lại tài khoản này, đảm bảo các tính năng tự động đăng bài và phản hồi khách hàng hoạt động bình thường.</i>"
    ].join("\n");

    await this.sendMessage(chatId, message).catch((err) => {
      console.error("[Telegram Bot] Lỗi gửi cảnh báo mất kết nối liên kết:", err);
    });
  },

  /**
   * Gửi cảnh báo khi tài khoản Gemini hết số dư
   */
  async sendGeminiBillingAlert(errorMessage: string): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    // Tránh gửi spam tin nhắn liên tục nếu có nhiều comment/chat lỗi cùng lúc
    const now = Date.now();
    const lastAlertTime = (this as any)._lastGeminiBillingAlertTime || 0;
    if (now - lastAlertTime < 5 * 60 * 1000) { // 5 phút throttle
      return;
    }
    (this as any)._lastGeminiBillingAlertTime = now;

    const message = [
      "⚠️ <b>CẢNH BÁO: HẾT HẠN MỨC/SỐ DƯ GEMINI API!</b> ⚠️",
      "=============================",
      `🔴 <b>Lỗi:</b> <code>RESOURCE_EXHAUSTED</code>`,
      `💬 <b>Chi tiết:</b> <i>Prepayment credits are depleted. Vui lòng nạp tiền vào tài khoản Google AI Studio.</i>`,
      `📋 <b>Nội dung lỗi gốc:</b> <code>${errorMessage.slice(0, 300)}</code>`,
      "=============================",
      "👉 <i>Hệ thống sẽ tự động chuyển sang cấu hình FreeLLM Fallback (nếu có cấu hình) để duy trì trả lời tin nhắn/bình luận tạm thời. Quản trị viên vui lòng kiểm tra và thanh toán hóa đơn sớm.</i>"
    ].join("\n");

    await this.sendMessage(chatId, message).catch((err) => {
      console.error("[Telegram Bot] Lỗi gửi cảnh báo hóa đơn Gemini:", err);
    });
  },
};
