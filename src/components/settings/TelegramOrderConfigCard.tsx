import { useEffect, useState } from "react";
import { Bot, Eye, EyeOff, Save, Send } from "lucide-react";
import { authService } from "../../services/authService";
import { CompanyTelegramOrderConfig, UserProfile } from "../../types";
import { toast } from "../../pages/Toast";

export default function TelegramOrderConfigCard({ userProfile }: { userProfile: UserProfile | null }) {
  const [config, setConfig] = useState<CompanyTelegramOrderConfig | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | "test" | "">("load");
  const canEdit = userProfile?.role === "admin" || userProfile?.role === "superadmin";

  const applyConfig = (value: CompanyTelegramOrderConfig) => {
    setConfig(value);
    setChatId(value.groupChatId || "");
    setThreadId(value.messageThreadId ? String(value.messageThreadId) : "");
    setToken("");
  };

  useEffect(() => {
    authService.getCompanyTelegramOrderConfig()
      .then(applyConfig)
      .catch((error) => toast.error(error.message || "Khong the tai cau hinh Telegram."))
      .finally(() => setBusy(""));
  }, []);

  const payload = () => ({
    botToken: token.trim() || undefined,
    groupChatId: chatId.trim(),
    messageThreadId: threadId ? Number(threadId) : null,
  });

  const save = async () => {
    if (!config) return;
    setBusy("save");
    try {
      applyConfig(await authService.updateCompanyTelegramOrderConfig({
        ...payload(),
        enabled: config.enabled,
        notifyNewOrder: config.notifyNewOrder,
      }));
      toast.success("Da luu cau hinh Telegram doanh nghiep.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const result = await authService.testCompanyTelegramOrderConfig(payload());
      toast.success(`Da gui tin nhan thu den ${result.chatTitle}.`);
      setConfig((current) => current ? {
        ...current,
        botUsername: result.botUsername,
        lastTestStatus: "success",
        lastTestError: "",
        lastTestedAt: new Date().toISOString(),
      } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  if (busy === "load") return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Dang tai cau hinh Telegram...</div>;
  if (!config) return null;

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 text-left">
          <div className="rounded-xl bg-sky-50 p-2 text-sky-600"><Bot className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{"Telegram nh\u1eadn \u0111\u01a1n h\u00e0ng"}</h3>
            <p className="mt-1 text-[11px] text-slate-500">{"Bot v\u00e0 nh\u00f3m d\u00f9ng ri\u00eang cho doanh nghi\u1ec7p "}<b>{config.companyName}</b>.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={config.enabled} disabled={!canEdit} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />
          {"B\u1eadt"}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-left">
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Bot Token
          <div className="relative">
            <input type={showToken ? "text" : "password"} value={token} disabled={!canEdit} onChange={(event) => setToken(event.target.value)} placeholder={config.hasBotToken ? "Da luu - de trong neu khong thay doi" : "123456789:AA..."} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-9 text-xs outline-none focus:border-sky-500" />
            <button type="button" onClick={() => setShowToken((value) => !value)} className="absolute right-2 top-2 text-slate-400">{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Group Chat ID
          <input value={chatId} disabled={!canEdit} onChange={(event) => setChatId(event.target.value)} placeholder="-1001234567890" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-sky-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Topic ID ({"t\u00f9y ch\u1ecdn"})
          <input type="number" min="1" value={threadId} disabled={!canEdit} onChange={(event) => setThreadId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-sky-500" />
        </label>
        <label className="flex items-center gap-2 self-end rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={config.notifyNewOrder} disabled={!canEdit} onChange={(event) => setConfig({ ...config, notifyNewOrder: event.target.checked })} />
          {"G\u1eedi khi c\u00f3 \u0111\u01a1n h\u00e0ng m\u1edbi"}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className={`text-[11px] font-semibold ${config.lastTestStatus === "success" ? "text-emerald-600" : config.lastTestStatus === "failed" ? "text-red-600" : "text-slate-400"}`}>
          {config.lastTestStatus === "success" ? `Da ket noi @${config.botUsername}` : config.lastTestStatus === "failed" ? config.lastTestError : "Chua kiem tra ket noi"}
        </span>
        {canEdit && <div className="flex gap-2">
          <button type="button" onClick={test} disabled={Boolean(busy)} className="flex items-center gap-1.5 rounded-xl border border-sky-200 px-3 py-2 text-xs font-bold text-sky-700 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{busy === "test" ? "Dang gui..." : "Gui thu"}</button>
          <button type="button" onClick={save} disabled={Boolean(busy)} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{busy === "save" ? "Dang luu..." : "Luu cau hinh"}</button>
        </div>}
      </div>
    </div>
  );
}
