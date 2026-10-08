import { useEffect, useState } from "react";
import { FolderOpen, Save, ScanSearch } from "lucide-react";
import { authService } from "../../services/authService";
import { CompanyCakeCatalogConfig, UserProfile } from "../../types";
import { toast } from "../../pages/Toast";

export default function CakeCatalogConfigCard({ userProfile }: { userProfile: UserProfile | null }) {
  const [config, setConfig] = useState<CompanyCakeCatalogConfig | null>(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [maxImages, setMaxImages] = useState(5);
  const [busy, setBusy] = useState<"load" | "save" | "test" | "">("load");
  const [scanResult, setScanResult] = useState("");
  const canEdit = userProfile?.role === "admin" || userProfile?.role === "superadmin";

  const applyConfig = (value: CompanyCakeCatalogConfig) => {
    setConfig(value);
    setFolderUrl(value.rootFolderUrl || "");
    setMaxImages(value.maxImagesPerReply || 5);
  };

  useEffect(() => {
    authService.getCompanyCakeCatalogConfig()
      .then(applyConfig)
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(""));
  }, []);

  const save = async () => {
    if (!config) return;
    setBusy("save");
    try {
      applyConfig(await authService.updateCompanyCakeCatalogConfig({
        enabled: config.enabled,
        rootFolderUrl: folderUrl.trim(),
        maxImagesPerReply: Math.min(10, Math.max(1, Number(maxImages || 5))),
      }));
      toast.success("Đã lưu thư viện ảnh bánh.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setScanResult("");
    try {
      const result = await authService.testCompanyCakeCatalogConfig(folderUrl.trim());
      setScanResult(`${result.categoryCount} loại bánh, ${result.imageCount} ảnh`);
      toast.success(`Đã đọc ${result.categoryCount} loại bánh và ${result.imageCount} ảnh.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  if (busy === "load") return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Đang tải thư viện ảnh bánh...</div>;
  if (!config) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 text-left">
          <div className="rounded-xl bg-amber-50 p-2 text-amber-600"><FolderOpen className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Thư viện ảnh mẫu bánh</h3>
            <p className="mt-1 text-[11px] text-slate-500">Bot gửi ảnh theo tên thư mục con mà khách nhắc tới.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={config.enabled} disabled={!canEdit} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />
          Bật
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left md:grid-cols-[1fr_160px]">
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Link thư mục Google Drive gốc
          <input value={folderUrl} disabled={!canEdit} onChange={(event) => setFolderUrl(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Số ảnh gửi mỗi lần
          <input type="number" min="1" max="10" value={maxImages} disabled={!canEdit} onChange={(event) => setMaxImages(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
      </div>

      <p className="rounded-xl bg-amber-50 px-3 py-2 text-left text-[11px] leading-relaxed text-amber-800">
        Chia sẻ thư mục với quyền Người xem cho <b>{config.serviceAccountEmail}</b>. Hệ thống sẽ tải ảnh an toàn qua Service Account và gửi bản Cloudinary cho khách. Mỗi thư mục con nên đặt đúng tên loại bánh, ví dụ “Bánh sinh nhật”, “Bánh cưới”.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className="text-[11px] font-semibold text-emerald-600">{scanResult}</span>
        {canEdit && <div className="flex gap-2">
          <button type="button" onClick={test} disabled={Boolean(busy) || !folderUrl.trim()} className="flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50"><ScanSearch className="h-3.5 w-3.5" />{busy === "test" ? "Đang đọc..." : "Kiểm tra Drive"}</button>
          <button type="button" onClick={save} disabled={Boolean(busy)} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{busy === "save" ? "Đang lưu..." : "Lưu cấu hình"}</button>
        </div>}
      </div>
    </div>
  );
}
