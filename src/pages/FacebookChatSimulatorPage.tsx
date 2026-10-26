import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, RotateCcw, Send, UserRound } from "lucide-react";
import { geminiApi } from "../api/gemini";

type ChatTurn = {
  id: number;
  sender: "user" | "model";
  text: string;
  contextMatches?: number;
  knowledgeSources?: string[];
  mode?: "trained" | "default";
};

const suggestions = [
  "Tôi đang tìm sản phẩm phù hợp, bạn tư vấn giúp?",
  "Tôi cần cung cấp gì để nhận báo giá?",
  "Tôi muốn đặt hàng, bước tiếp theo là gì?",
];

export default function FacebookChatSimulatorPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isSending]);

  async function sendMessage(event?: FormEvent, suggestedText?: string) {
    event?.preventDefault();
    const text = (suggestedText ?? draft).trim();
    if (!text || isSending) return;

    const history = turns.slice(-30).map(({ sender, text: turnText }) => ({ sender, text: turnText }));
    setDraft("");
    setError("");
    setIsSending(true);
    const messageId = ++nextId.current;
    setTurns((current) => [...current, { id: messageId, sender: "user", text }]);

    try {
      const result = await geminiApi.testReply(text, { channel: "facebook", history });
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
    setTurns([]);
    setDraft("");
    setError("");
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-[560px] max-w-5xl flex-col gap-4">
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
          <RotateCcw size={16} /> Bắt đầu lại
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Đây là bản xem trước câu trả lời AI. Mỗi lượt thử có thể trừ chi phí AI trong ví. Tin nhắn không gửi lên Facebook, không tạo hội thoại thật và không chạy webhook hay quy trình đặt hàng tự động.
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Bot size={21} /></div>
          <div>
            <p className="font-semibold text-slate-900">Trợ lý AI Facebook</p>
            <p className="text-xs text-slate-500">Hội thoại thử · chỉ hiển thị trong phiên này</p>
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
        <form onSubmit={sendMessage} className="flex items-end gap-3 border-t border-slate-100 bg-white p-4">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
            placeholder="Nhập tin nhắn của khách hàng..." aria-label="Tin nhắn của khách hàng"
            className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
          <button type="submit" disabled={!draft.trim() || isSending}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Gửi tin nhắn thử"><Send size={19} /></button>
        </form>
      </div>
    </div>
  );
}
