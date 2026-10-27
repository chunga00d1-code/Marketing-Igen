import { useEffect, useState } from "react";
import { CheckCircle, FileSpreadsheet, Loader2, Save } from "lucide-react";
import { getAccessToken } from "../../services/authService";

type Config = {
  chatSaveMode: "inherit" | "both" | "lead" | "order";
  leadSheetMode?: "inherit" | "custom";
  effectiveChatSaveMode?: "both" | "lead" | "order";
  inheritedSheet?: { enabled: boolean; spreadsheetUrl: string; sheetName: string };
  enabled: boolean;
  spreadsheetUrl: string;
  sheetName: string;
  serviceAccountEmail: string;
};

const emptyConfig: Config = { chatSaveMode: "both", enabled: false, spreadsheetUrl: "", sheetName: "Leads", serviceAccountEmail: "" };

async function request(path: string, method = "GET", body?: object) {
  const response = await fetch(`/api/v1/company-lead-sheet${path}`, {
    method,
    headers: { Authorization: `Bearer ${getAccessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Không thể kết nối Google Sheet lead.");
  return result.data;
}

export default function LeadSheetConfigCard({ canEdit, integrationId }: { canEdit: boolean; integrationId?: string }) {
  const basePath = integrationId ? `/pages/${encodeURIComponent(integrationId)}` : "";
  const [config, setConfig] = useState<Config>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "test" | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    request(basePath).then((data: Config) => { if (active) setConfig(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [basePath]);

  const inheritsSheet = Boolean(integrationId && config.leadSheetMode !== "custom");
  const sheetDisabled = !canEdit || loading || !!busy || inheritsSheet;

  async function run(action: "save" | "test") {
    setBusy(action);
    setNotice("");
    setError("");
    try {
      if (action === "test") {
        const result = await request(`${basePath}/test`, "POST", {
          ...(integrationId ? { leadSheetMode: config.leadSheetMode || "inherit" } : {}),
          spreadsheetUrl: config.spreadsheetUrl.trim(), sheetName: config.sheetName.trim() || "Leads",
        }) as { title: string; sheetNames: string[] };
        const testedTab = inheritsSheet ? config.inheritedSheet?.sheetName || "Leads" : config.sheetName.trim() || "Leads";
        setNotice(`Đã đọc được Sheet "${result.title}". ${result.sheetNames.includes(testedTab) ? "Tab lead đã tồn tại." : "Tab lead sẽ được tạo khi bật và lưu cấu hình."}`);
      } else {
        const data = await request(basePath, "PUT", {
          ...(integrationId ? { leadSheetMode: config.leadSheetMode || "inherit" } : {}),
          chatSaveMode: config.chatSaveMode,
          enabled: config.enabled, spreadsheetUrl: config.spreadsheetUrl.trim(),
          sheetName: config.sheetName.trim() || "Leads",
        }) as Config;
        setConfig(data);
        setNotice(data.chatSaveMode === "order" ? "Đã chọn chỉ tạo đơn hàng. Cấu hình Sheet lead vẫn được giữ để dùng lại khi cần."
          : data.enabled ? "Đã lưu kiểu hội thoại và kết nối Sheet lead." : "Đã lưu kiểu hội thoại Facebook.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900"><FileSpreadsheet size={19} className="text-emerald-700" /> {integrationId ? "Kiểu lưu hội thoại của Page" : "Kiểu lưu hội thoại Facebook"}</h3>
          <p className="mt-1 text-sm text-slate-600">Chọn lưu thông tin khách, tạo đơn hàng hoặc giữ cả hai luồng khi đủ điều kiện.</p>
        </div>
      </div>
      <label className="mt-4 block text-xs font-medium text-slate-700">{integrationId ? "Kiểu lưu của Page" : "Kiểu lưu hội thoại Facebook của doanh nghiệp"}
        <select value={config.chatSaveMode} disabled={!canEdit || loading || !!busy}
          onChange={(event) => setConfig(current => ({ ...current, chatSaveMode: event.target.value as Config["chatSaveMode"] }))}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
          {integrationId && <option value="inherit">Dùng cấu hình doanh nghiệp</option>}
          <option value="both">Tự động — lưu lead và đơn hàng khi đủ điều kiện</option>
          <option value="lead">Chỉ lưu thông tin khách hàng (lead)</option>
          <option value="order">Chỉ tạo đơn hàng</option>
        </select>
      </label>
      <p className="mt-1 text-xs text-slate-500">{integrationId
        ? `Cấu hình riêng được ưu tiên cho Page này. Đang áp dụng sau lần lưu gần nhất: ${config.effectiveChatSaveMode === "lead" ? "chỉ lead" : config.effectiveChatSaveMode === "order" ? "chỉ đơn hàng" : "lead và đơn hàng"}.`
        : "Áp dụng cho các Fanpage đang chọn dùng cấu hình doanh nghiệp. Lưu lead vào Google Sheet chỉ hoạt động khi bật kết nối bên dưới."}</p>
      {integrationId && <label className="mt-4 block text-xs font-medium text-slate-700">Nguồn cấu hình Sheet Leads
        <select value={config.leadSheetMode || "inherit"} disabled={!canEdit || loading || !!busy}
          onChange={event => setConfig(current => ({ ...current, leadSheetMode: event.target.value as "inherit" | "custom" }))}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="inherit">Dùng Sheet chung của doanh nghiệp</option>
          <option value="custom">Cấu hình Sheet riêng cho Page</option>
        </select>
      </label>}
      {inheritsSheet && <p className="mt-2 break-all text-xs text-slate-600">
        Sheet chung: {config.inheritedSheet?.enabled ? "Đã bật" : "Đang tắt"} — {config.inheritedSheet?.spreadsheetUrl || "Chưa có link"} (tab {config.inheritedSheet?.sheetName || "Leads"}).
      </p>}
      <fieldset disabled={sheetDisabled} className={inheritsSheet ? "opacity-50" : ""}>
      <div className="mt-5 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-800">Google Sheet cho thông tin khách hàng</h4>
        <label className="flex shrink-0 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={config.enabled} disabled={sheetDisabled}
            onChange={(event) => setConfig(current => ({ ...current, enabled: event.target.checked }))} /> Bật
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">Khi bật, hệ thống ghi tên, SĐT và tóm tắt hội thoại vào Sheet lead riêng. Sheet đơn hàng vẫn dùng cấu hình hiện có.</p>
      {config.serviceAccountEmail && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Chia sẻ Google Sheet với quyền Editor cho <span className="break-all font-mono">{config.serviceAccountEmail}</span>.
      </p>}
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="text-xs font-medium text-slate-700">Link Google Sheet
          <input value={config.spreadsheetUrl} disabled={!canEdit || loading || !!busy}
            onChange={(event) => setConfig(current => ({ ...current, spreadsheetUrl: event.target.value }))}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        </label>
        <label className="text-xs font-medium text-slate-700">Tên tab lưu lead
          <input value={config.sheetName} disabled={!canEdit || loading || !!busy}
            onChange={(event) => setConfig(current => ({ ...current, sheetName: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Hệ thống tự tạo tab và ba cột hiển thị khi lưu cấu hình đã bật. Mã hội thoại được giữ ở cột ẩn để cập nhật đúng dòng.</p>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {canEdit && <div className="mt-4 flex gap-2">
        <button type="button" disabled={loading || !!busy || !(inheritsSheet ? config.inheritedSheet?.spreadsheetUrl : config.spreadsheetUrl)?.trim()} onClick={() => void run("test")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
          {busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Kiểm tra
        </button>
        <button type="button" disabled={loading || !!busy} onClick={() => void run("save")}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lưu cấu hình
        </button>
      </div>}
    </section>
  );
}
