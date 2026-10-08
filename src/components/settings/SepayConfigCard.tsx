import { useEffect, useState } from "react";
import { Copy, Landmark, Save } from "lucide-react";
import { authService } from "../../services/authService";
import { CompanySepayConfig, UserProfile } from "../../types";
import { toast } from "../../pages/Toast";

export default function SepayConfigCard({ userProfile }: { userProfile: UserProfile | null }) {
  const [config, setConfig] = useState<CompanySepayConfig | null>(null);
  const [secret, setSecret] = useState("");
  const [accounts, setAccounts] = useState("");
  const [prefix, setPrefix] = useState("DH");
  const [qrBankId, setQrBankId] = useState("");
  const [qrAccountNumber, setQrAccountNumber] = useState("");
  const [qrAccountName, setQrAccountName] = useState("");
  const [busy, setBusy] = useState(true);
  const canEdit = userProfile?.role === "admin" || userProfile?.role === "superadmin";

  const applyConfig = (value: CompanySepayConfig) => {
    setConfig(value);
    setAccounts(value.accountNumbers.join("\n"));
    setPrefix(value.paymentCodePrefix || "DH");
    setQrBankId(value.qrBankId || "");
    setQrAccountNumber(value.qrAccountNumber || "");
    setQrAccountName(value.qrAccountName || "");
    setSecret("");
  };

  useEffect(() => {
    authService.getCompanySepayConfig()
      .then(applyConfig)
      .catch((error) => toast.error(error.message || "Không thể tải cấu hình SePay."))
      .finally(() => setBusy(false));
  }, []);

  const save = async () => {
    if (!config) return;
    setBusy(true);
    try {
      const accountNumbers = accounts.split(/[\n,]+/).map((value) => value.replace(/\s+/g, "").trim()).filter(Boolean);
      applyConfig(await authService.updateCompanySepayConfig({
        enabled: config.enabled,
        webhookSecret: secret.trim() || undefined,
        accountNumbers,
        paymentCodePrefix: prefix.trim().toUpperCase(),
        qrBankId: qrBankId.trim(),
        qrAccountNumber: qrAccountNumber.replace(/\s+/g, "").trim(),
        qrAccountName: qrAccountName.trim(),
      }));
      toast.success("Đã lưu cấu hình webhook SePay cho doanh nghiệp.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!config?.webhookUrl) return;
    await navigator.clipboard.writeText(config.webhookUrl);
    toast.success("Đã sao chép URL webhook SePay.");
  };

  if (busy && !config) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Đang tải cấu hình SePay...</div>;
  if (!config) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 text-left">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><Landmark className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">SePay xác nhận tiền cọc</h3>
            <p className="mt-1 text-[11px] text-slate-500">Webhook và tài khoản ngân hàng dùng riêng cho <b>{config.companyName}</b>.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={config.enabled} disabled={!canEdit} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />
          Bật
        </label>
      </div>

      <div className="space-y-1 text-left text-[11px] font-semibold text-slate-600">
        URL webhook nhập trên SePay
        <div className="flex gap-2">
          <input readOnly value={config.webhookUrl} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[10px]" />
          <button type="button" onClick={copyUrl} className="rounded-xl border border-emerald-200 px-3 text-emerald-700"><Copy className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left md:grid-cols-2">
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Secret HMAC-SHA256
          <input type="password" value={secret} disabled={!canEdit} onChange={(event) => setSecret(event.target.value)} placeholder={config.hasWebhookSecret ? "Đã lưu - để trống nếu không thay đổi" : "Secret cấu hình trên SePay"} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Tiền tố mã thanh toán
          <input value={prefix} maxLength={5} disabled={!canEdit} onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="DH" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs uppercase outline-none focus:border-emerald-500" />
        </label>
      </div>

      <label className="block space-y-1 text-left text-[11px] font-semibold text-slate-600">
        Số tài khoản nhận tiền (mỗi dòng một số)
        <textarea rows={3} value={accounts} disabled={!canEdit} onChange={(event) => setAccounts(event.target.value)} placeholder={"1017588888\n0123456789"} className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-emerald-500" />
      </label>

      <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-left">
        <div>
          <p className="text-xs font-bold text-slate-700">Thông tin gửi VietQR cho khách</p>
          <p className="mt-1 text-[10px] text-slate-500">Ảnh QR sẽ tự điền tiền cọc và mã thanh toán của từng đơn.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-[11px] font-semibold text-slate-600">
            Mã ngân hàng / BIN
            <input value={qrBankId} disabled={!canEdit} onChange={(event) => setQrBankId(event.target.value.replace(/[^a-zA-Z0-9]/g, ""))} placeholder="970422 hoặc MBBank" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-500" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-slate-600">
            Số tài khoản gửi trên QR
            <input value={qrAccountNumber} disabled={!canEdit} onChange={(event) => setQrAccountNumber(event.target.value.replace(/\s+/g, ""))} placeholder="1017588888" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-emerald-500" />
          </label>
        </div>
        <label className="block space-y-1 text-[11px] font-semibold text-slate-600">
          Tên chủ tài khoản
          <input value={qrAccountName} disabled={!canEdit} onChange={(event) => setQrAccountName(event.target.value)} placeholder="NGUYEN VAN A" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs uppercase outline-none focus:border-emerald-500" />
        </label>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[10px] leading-4 text-amber-800">
        Trên SePay chọn sự kiện <b>Có tiền vào</b>, xác thực <b>HMAC-SHA256</b>, bật chỉ gửi khi có mã thanh toán và cấu hình cùng tiền tố ở trên. Phần hậu tố chọn <b>12 ký tự chữ và số</b>. Hệ thống chỉ xác nhận khi đúng tài khoản, mã đơn và đúng số tiền cọc.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className={`text-[11px] font-semibold ${config.lastWebhookStatus === "success" ? "text-emerald-600" : config.lastWebhookStatus === "failed" ? "text-red-600" : "text-slate-400"}`}>
          {config.lastWebhookStatus === "success" ? "Webhook gần nhất hợp lệ" : config.lastWebhookStatus === "failed" ? config.lastWebhookError : "Chưa nhận webhook thử"}
        </span>
        {canEdit && <button type="button" onClick={save} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{busy ? "Đang lưu..." : "Lưu cấu hình"}</button>}
      </div>
    </div>
  );
}
