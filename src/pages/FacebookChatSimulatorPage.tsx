import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, MessageSquareText, Plus, RotateCcw, Send, UserRound } from "lucide-react";
import { geminiApi } from "../api/gemini";

type ChatTurn = {
  id: number;
  sender: "user" | "model";
  text: string;
  contextMatches?: number;
  knowledgeSources?: string[];
  mode?: "trained" | "default";
};

type TestReplyLog = Awaited<ReturnType<typeof geminiApi.fetchTestReplyLogs>>[number];

type TestConversation = {
  id: string;
  title: string;
  updatedAt: string;
  logs: TestReplyLog[];
  isLegacy: boolean;
};

const savedSessionsKey = "facebook-chat-simulator-log-sessions";
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readSavedSessionIds(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(savedSessionsKey) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([logId, sessionId]) =>
      /^[0-9a-f]{24}$/i.test(logId) && typeof sessionId === "string" && sessionIdPattern.test(sessionId)
    )) as Record<string, string>;
  } catch {
    return {};
  }
}

function groupTestConversations(logs: TestReplyLog[], savedSessionIds: Record<string, string>): TestConversation[] {
  const conversations = new Map<string, TestConversation>();
  for (const log of [...logs].reverse()) {
    const loggedSessionId = log.conversationId || "";
    const sessionId = sessionIdPattern.test(loggedSessionId) ? loggedSessionId : savedSessionIds[log._id] || "";
    const id = sessionId || `log:${log._id}`;
    const existing = conversations.get(id);
    if (existing) {
      existing.logs.push(log);
      existing.updatedAt = log.createdAt;
    } else {
      conversations.set(id, {
        id,
        title: log.customerMessage,
        updatedAt: log.createdAt,
        logs: [log],
        isLegacy: !sessionId,
      });
    }
  }
  return [...conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function turnsFromLogs(logs: TestReplyLog[]): ChatTurn[] {
  return logs.flatMap((log, index) => [
    { id: index * 2 + 1, sender: "user" as const, text: log.customerMessage },
    {
      id: index * 2 + 2,
      sender: "model" as const,
      text: log.aiResponse,
      contextMatches: log.contextMatches,
      mode: log.mode,
    },
  ]);
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

const suggestions = [
  "Tôi đang tìm sản phẩm phù hợp, bạn tư vấn giúp?",
  "Tôi cần cung cấp gì để nhận báo giá?",
  "Tôi muốn đặt hàng, bước tiếp theo là gì?",
];

export default function FacebookChatSimulatorPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [testLogs, setTestLogs] = useState<TestReplyLog[]>([]);
  const [savedSessionIds, setSavedSessionIds] = useState(readSavedSessionIds);
  const [selectedConversationId, setSelectedConversationId] = useState<string>(() => crypto.randomUUID());
  const [historyView, setHistoryView] = useState<"conversations" | "single">("conversations");
  const [historySearch, setHistorySearch] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isSending]);

  useEffect(() => {
    let mounted = true;
    geminiApi.fetchTestReplyLogs().then((logs) => {
      if (mounted) setTestLogs(logs);
    }).catch(() => {
      if (mounted) setHistoryError("Không thể tải lịch sử trò chuyện thử.");
    }).finally(() => {
      if (mounted) setIsLoadingHistory(false);
    });
    return () => { mounted = false; };
  }, []);

  const conversations = groupTestConversations(testLogs, savedSessionIds);
  const conversationCount = conversations.filter((conversation) => !conversation.isLegacy).length;
  const singleTestCount = conversations.length - conversationCount;
  const filteredConversations = conversations.filter((conversation) =>
    (historyView === "conversations" ? !conversation.isLegacy : conversation.isLegacy) &&
    conversation.logs.some((log) =>
      `${log.customerMessage} ${log.aiResponse}`.toLocaleLowerCase("vi").includes(historySearch.toLocaleLowerCase("vi").trim())
    )
  );
  const isLegacySelection = selectedConversationId.startsWith("log:");

  async function refreshHistory() {
    setHistoryError("");
    setIsLoadingHistory(true);
    try {
      setTestLogs(await geminiApi.fetchTestReplyLogs());
    } catch {
      setHistoryError("Không thể tải lịch sử trò chuyện thử.");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function sendMessage(event?: FormEvent, suggestedText?: string) {
    event?.preventDefault();
    const text = (suggestedText ?? draft).trim();
    if (!text || isSending || isLegacySelection) return;

    const history = turns.slice(-30).map(({ sender, text: turnText }) => ({ sender, text: turnText }));
    setDraft("");
    setError("");
    setIsSending(true);
    const messageId = ++nextId.current;
    setTurns((current) => [...current, { id: messageId, sender: "user", text }]);

    try {
      const result = await geminiApi.testReply(text, { channel: "facebook", history, testSessionId: selectedConversationId });
      const reply = typeof result?.text === "string" ? result.text.trim() : "";
      if (!reply) throw new Error("AI chưa trả về nội dung. Vui lòng thử lại.");
      setTurns((current) => [...current, {
        id: ++nextId.current,
        sender: "model",
        text: reply,
        contextMatches: Number(result.contextMatches) || 0,
        knowledgeSources: Array.isArray(result.knowledgeSources) ? result.knowledgeSources : [],
        mode: result.mode === "trained" ? "trained" : "default",
      }]);
      if (typeof result.logId === "string" && /^[0-9a-f]{24}$/i.test(result.logId)) {
        setSavedSessionIds((current) => {
          const updated = { ...current, [result.logId]: selectedConversationId };
          try { localStorage.setItem(savedSessionsKey, JSON.stringify(updated)); } catch { /* Storage can be unavailable. */ }
          return updated;
        });
      }
      setHistoryView("conversations");
      void refreshHistory();
    } catch (cause) {
      setTurns((current) => current.filter((turn) => turn.id !== messageId));
      setDraft(text);
      setError(cause instanceof Error ? cause.message : "Không thể tạo câu trả lời thử.");
    } finally {
      setIsSending(false);
    }
  }

  function resetChat() {
    if (isSending) return;
    setSelectedConversationId(crypto.randomUUID());
    setHistoryView("conversations");
    setTurns([]);
    nextId.current = 0;
    setDraft("");
    setError("");
  }

  function openConversation(conversation: TestConversation) {
    if (isSending) return;
    const savedTurns = turnsFromLogs(conversation.logs);
    setSelectedConversationId(conversation.id);
    setTurns(savedTurns);
    nextId.current = savedTurns.length;
    setDraft("");
    setError("");
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-[560px] max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-600">Facebook Messenger · Demo</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Mô phỏng nhắn tin</h1>
          <p className="mt-1 text-sm text-slate-600">
            Thử AI với cấu hình và kho tri thức hiện tại, không cần kết nối Facebook.
          </p>
        </div>
        <button type="button" onClick={resetChat} disabled={isSending || turns.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Plus size={16} /> Cuộc trò chuyện mới
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Đây là bản xem trước câu trả lời AI. Mỗi lượt thử có thể trừ chi phí AI trong ví. Tin nhắn không gửi lên Facebook, không tạo hội thoại thật và không chạy webhook hay quy trình đặt hàng tự động.
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="flex max-h-60 min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:max-h-none" aria-label="Lịch sử trò chuyện thử">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">Lịch sử mô phỏng</p>
              <p className="text-xs text-slate-500">Trong 100 lượt thử gần nhất</p>
            </div>
            <button type="button" onClick={() => void refreshHistory()} disabled={isLoadingHistory}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Tải lại lịch sử">
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 border-b border-slate-100 p-2" role="tablist" aria-label="Loại lịch sử mô phỏng">
            <button type="button" role="tab" aria-selected={historyView === "conversations"}
              onClick={() => setHistoryView("conversations")}
              className={`rounded-lg px-2 py-2 text-xs font-medium ${historyView === "conversations" ? "bg-sky-100 text-sky-800" : "text-slate-500 hover:bg-slate-50"}`}>
              Hội thoại ({conversationCount})
            </button>
            <button type="button" role="tab" aria-selected={historyView === "single"}
              onClick={() => setHistoryView("single")}
              className={`rounded-lg px-2 py-2 text-xs font-medium ${historyView === "single" ? "bg-sky-100 text-sky-800" : "text-slate-500 hover:bg-slate-50"}`}>
              Thử đơn ({singleTestCount})
            </button>
          </div>
          <div className="border-b border-slate-100 p-3">
            <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Tìm trong lịch sử..." aria-label="Tìm trong lịch sử trò chuyện thử"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoadingHistory && <p className="px-2 py-3 text-sm text-slate-500">Đang tải lịch sử...</p>}
            {historyError && <p role="alert" className="px-2 py-3 text-sm text-red-700">{historyError}</p>}
            {!isLoadingHistory && !historyError && filteredConversations.length === 0 && (
              <p className="px-2 py-3 text-sm text-slate-500">
                {historyView === "conversations" ? "Chưa có hội thoại nhiều lượt phù hợp." : "Chưa có lượt thử đơn phù hợp."}
              </p>
            )}
            {filteredConversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} disabled={isSending}
                aria-current={selectedConversationId === conversation.id ? "true" : undefined}
                className={`mb-1 w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50 ${selectedConversationId === conversation.id ? "bg-sky-50 ring-1 ring-sky-200" : ""}`}>
                <span className="flex items-start gap-2">
                  <MessageSquareText size={17} className="mt-0.5 shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{conversation.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {conversation.isLegacy ? "Lượt thử cũ" : `${conversation.logs.length} lượt trao đổi`} · {formatConversationDate(conversation.updatedAt)}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Bot size={21} /></div>
          <div>
            <p className="font-semibold text-slate-900">Trợ lý AI Facebook</p>
            <p className="text-xs text-slate-500">{isLegacySelection ? "Lượt thử cũ · chỉ xem" : "Hội thoại thử · được lưu trong lịch sử"}</p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-5" aria-live="polite">
          {turns.length === 0 && (
            <div className="mx-auto max-w-md py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Bot size={27} /></div>
              <p className="font-semibold text-slate-800">Bắt đầu một cuộc trò chuyện thử</p>
              <p className="mt-1 text-sm text-slate-500">Nhập tin nhắn như một khách hàng nhắn vào Fanpage. Để thử tài liệu đã nạp, hãy hỏi đúng chủ đề của tài liệu.</p>
              <div className="mt-5 space-y-2">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => void sendMessage(undefined, suggestion)}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-sm text-slate-600 hover:border-sky-300 hover:text-sky-700">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((turn) => (
            <div key={turn.id} className={`flex gap-2 ${turn.sender === "user" ? "justify-end" : "justify-start"}`}>
              {turn.sender === "model" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Bot size={17} /></div>}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${turn.sender === "user" ? "bg-sky-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                <p className="whitespace-pre-wrap break-words">{turn.text}</p>
                {turn.sender === "model" && <p className="mt-2 text-xs text-slate-500">
                  {turn.knowledgeSources?.length
                    ? `Ngữ cảnh từ: ${turn.knowledgeSources.join(", ")} (${turn.contextMatches} đoạn phù hợp)`
                    : turn.mode === "trained" ? "Có ngữ cảnh hỗ trợ, chưa có chi tiết nguồn" : "Chưa tìm thấy tài liệu phù hợp"}
                </p>}
              </div>
              {turn.sender === "user" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"><UserRound size={17} /></div>}
            </div>
          ))}
          {isSending && <p className="pl-10 text-sm text-slate-500">AI đang soạn câu trả lời...</p>}
          <div ref={bottomRef} />
        </div>

        {error && <div role="alert" className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>}
        {isLegacySelection && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Lượt thử cũ chưa có mã phiên để tiếp tục. Hãy tạo cuộc trò chuyện mới để thử tiếp.</p>}
        <form onSubmit={sendMessage} className="flex items-end gap-3 border-t border-slate-100 bg-white p-4">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} disabled={isLegacySelection}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
            placeholder="Nhập tin nhắn của khách hàng..." aria-label="Tin nhắn của khách hàng"
            className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
          <button type="submit" disabled={!draft.trim() || isSending || isLegacySelection}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Gửi tin nhắn thử"><Send size={19} /></button>
        </form>
      </div>
      </div>
    </div>
  );
}
