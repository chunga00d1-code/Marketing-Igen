import React, { useEffect, useState } from "react";
import { CheckCircle, ExternalLink, FileSpreadsheet, Loader2, Save } from "lucide-react";
import { toast } from "../../pages/Toast";
import { getAccessToken } from "../../services/authService";
import {
  OrderSheetConfig,
  SocialIntegration,
  socialIntegrationService,
} from "../../services/socialIntegrationService";

const DEFAULT_CONFIG: OrderSheetConfig = {
  enabled: false,
  spreadsheetUrl: "",
  ordersSheetName: "Orders",
  itemsSheetName: "OrderItems",
  writeTrigger: "customer_confirmed",
};

interface OrderSheetConfigCardProps {
  integration: SocialIntegration;
  onSaved: () => void | Promise<void>;
}

export default function OrderSheetConfigCard({ integration, onSaved }: OrderSheetConfigCardProps) {
  const [config, setConfig] = useState<OrderSheetConfig>({ ...DEFAULT_CONFIG, ...integration.orderSheetConfig });
  const [serviceAccountEmail, setServiceAccountEmail] = useState("");
  const [busyAction, setBusyAction] = useState<"save" | "test" | "template" | "">("");

  useEffect(() => {
    setConfig({ ...DEFAULT_CONFIG, ...integration.orderSheetConfig });
  }, [integration.orderSheetConfig]);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/order-sheets/service-account", {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "Không thể tải email Service Account.");
        if (active) setServiceAccountEmail(result.data?.serviceAccountEmail || "");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function save(showToast = true) {
    if (!integration._id || integration._id.startsWith("facebook-oauth-")) {
      throw new Error("Fanpage cần được lưu thành liên kết doanh nghiệp trước khi cấu hình Sheet.");
    }
    if (config.enabled && !/\/spreadsheets\/d\/[a-zA-Z0-9_-]+/.test(config.spreadsheetUrl)) {
      throw new Error("Vui lòng nhập link Google Sheet hợp lệ.");
    }
    const nextConfig: OrderSheetConfig = {
      ...config,
      spreadsheetId: "",
      spreadsheetUrl: config.spreadsheetUrl.trim(),
      ordersSheetName: config.ordersSheetName.trim() || "Orders",
      itemsSheetName: config.itemsSheetName.trim() || "OrderItems",
      writeTrigger: "customer_confirmed",
      updatedAt: new Date().toISOString(),
    };
    await socialIntegrationService.updateIntegration(integration._id, { orderSheetConfig: nextConfig });
    setConfig(nextConfig);
    await onSaved();
    if (showToast) toast.success("Đã lưu cấu hình Google Sheet cho Fanpage.");
    return integration._id;
  }

  async function run(action: "save" | "test" | "template") {
    setBusyAction(action);
    try {
      const integrationId = await save(action === "save");
      if (action === "test") {
        const result = await socialIntegrationService.testOrderSheet(integrationId);
        toast.success(`Kết nối thành công: ${result.title}`);
      }
      if (action === "template") {
        await socialIntegrationService.initializeOrderSheet(integrationId);
        toast.success("Đã tạo/cập nhật hai tab Orders và OrderItems.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật Google Sheet.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Lưu đơn Messenger vào Google Sheets
          </div>
          <p className="mt-1 text-[10px] leading-4 text-gray-500">Chỉ ghi khi khách xác nhận chốt và đơn có đủ tên, số điện thoại, địa chỉ, sản phẩm.</p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={config.enabled}
            onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <span className="h-5 w-9 rounded-full bg-gray-300 transition peer-checked:bg-emerald-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
        </label>
      </div>

      {serviceAccountEmail && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">
          Chia sẻ Sheet quyền <b>Editor</b> cho: <span className="break-all font-mono">{serviceAccountEmail}</span>
        </div>
      )}

      <input
        value={config.spreadsheetUrl}
        onChange={(event) => setConfig((current) => ({ ...current, spreadsheetUrl: event.target.value, spreadsheetId: "" }))}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-emerald-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={config.ordersSheetName}
          onChange={(event) => setConfig((current) => ({ ...current, ordersSheetName: event.target.value }))}
          placeholder="Orders"
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-emerald-500"
        />
        <input
          value={config.itemsSheetName}
          onChange={(event) => setConfig((current) => ({ ...current, itemsSheetName: event.target.value }))}
          placeholder="OrderItems"
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-emerald-500"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => void run("save")} disabled={!!busyAction} className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-[10px] font-bold text-gray-700 disabled:opacity-50">
          {busyAction === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Lưu
        </button>
        <button type="button" onClick={() => void run("test")} disabled={!!busyAction || !config.spreadsheetUrl} className="flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-[10px] font-bold text-blue-700 disabled:opacity-50">
          {busyAction === "test" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />} Kiểm tra
        </button>
        <button type="button" onClick={() => void run("template")} disabled={!!busyAction || !config.spreadsheetUrl} className="flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-50">
          {busyAction === "template" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} Tạo mẫu
        </button>
      </div>
      {config.spreadsheetUrl && (
        <a href={config.spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:underline">
          Mở Google Sheet <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
