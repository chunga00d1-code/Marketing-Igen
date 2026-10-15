import { useEffect, useState } from "react";
import { Eye, EyeOff, Save, Send, Workflow } from "lucide-react";
import { authService } from "../../services/authService";
import { CompanyOrderAutomationConfig, UserProfile } from "../../types";
import { toast } from "../../pages/Toast";

export default function OrderAutomationConfigCard({ userProfile }: { userProfile: UserProfile | null }) {
  const [config, setConfig] = useState<CompanyOrderAutomationConfig | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | "test" | "">("load");
  const canEdit = userProfile?.role === "admin" || userProfile?.role === "superadmin";

  const applyConfig = (value: CompanyOrderAutomationConfig) => {
    setConfig(value);
    setWebhookUrl(value.webhookUrl || "");
    setWebhookSecret("");
  };

  useEffect(() => {
    authService.getCompanyOrderAutomationConfig()
      .then(applyConfig)
      .catch((error) => toast.error(error.message || "Không thể tải cấu hình n8n."))
      .finally(() => setBusy(""));
  }, []);

  const payload = () => ({
    webhookUrl: webhookUrl.trim(),
    webhookSecret: webhookSecret.trim() || undefined,
  });

  const save = async () => {
    if (!config) return;
    setBusy("save");
    try {
      applyConfig(await authService.updateCompanyOrderAutomationConfig({
        ...payload(),
        enabled: config.enabled,
      }));
      toast.success("Đã lưu workflow n8n riêng của doanh nghiệp.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const result = await authService.testCompanyOrderAutomationConfig(payload());
      toast.success(`Webhook n8n phản hồi HTTP ${result.statusCode} trong ${result.responseTimeMs} ms.`);
      setConfig((current) => current ? {
        ...current,
        lastDeliveryAt: new Date().toISOString(),
        lastDeliveryStatus: "success",
        lastDeliveryError: "",
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      setConfig((current) => current ? {
        ...current,
        lastDeliveryAt: new Date().toISOString(),
        lastDeliveryStatus: "failed",
        lastDeliveryError: message,
      } : current);
    } finally {
      setBusy("");
    }
  };

  if (busy === "load") {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Đang tải cấu hình n8n...</div>;
  }
  if (!config) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 text-left">
          <div className="rounded-xl bg-violet-50 p-2 text-violet-600"><Workflow className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">n8n tự động hóa đơn hàng</h3>
            <p className="mt-1 text-[11px] text-slate-500">Workflow và secret dùng riêng cho doanh nghiệp <b>{config.companyName}</b>.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={config.enabled} disabled={!canEdit} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />
          Bật
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left md:grid-cols-2">
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Production webhook URL
          <input type="url" value={webhookUrl} disabled={!canEdit} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://n8n.example.com/webhook/marketing-cake-order" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-violet-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Secret của workflow
          <div className="relative">
            <input type={showSecret ? "text" : "password"} value={webhookSecret} disabled={!canEdit} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={config.hasWebhookSecret ? "Đã lưu - để trống nếu không thay đổi" : "Tối thiểu 24 ký tự"} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-9 text-xs outline-none focus:border-violet-500" />
            <button type="button" onClick={() => setShowSecret((value) => !value)} disabled={!canEdit} aria-label={showSecret ? "Ẩn secret" : "Hiện secret"} className="absolute right-2 top-2 text-slate-400 disabled:opacity-50">{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </label>
      </div>

      <p className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-left text-[10px] leading-4 text-violet-800">
        Import workflow mẫu trong <b>docs/n8n/cake-order-marketing-bridge.workflow.json</b>, bật Production webhook rồi dán URL và secret tại đây. Mỗi doanh nghiệp có cấu hình tách biệt theo mã công ty.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className={`text-[11px] font-semibold ${config.lastDeliveryStatus === "success" ? "text-emerald-600" : config.lastDeliveryStatus === "failed" ? "text-red-600" : "text-slate-400"}`}>
          {config.lastDeliveryStatus === "success" ? "Webhook gần nhất phản hồi thành công" : config.lastDeliveryStatus === "failed" ? config.lastDeliveryError : "Chưa kiểm tra kết nối"}
        </span>
        {canEdit && <div className="flex gap-2">
          <button type="button" onClick={test} disabled={Boolean(busy) || !webhookUrl.trim()} className="flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{busy === "test" ? "Đang kiểm tra..." : "Kiểm tra"}</button>
          <button type="button" onClick={save} disabled={Boolean(busy)} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{busy === "save" ? "Đang lưu..." : "Lưu cấu hình"}</button>
        </div>}
      </div>
    </div>
  );
}
