import { useEffect, useState } from "react";
import { FolderOpen, Save, ScanSearch } from "lucide-react";
import { authService } from "../../services/authService";
import { CompanyProductCatalogConfig, UserProfile } from "../../types";
import { toast } from "../../pages/Toast";

function aliasesToText(value: Record<string, string[]>) {
  return Object.entries(value || {}).map(([category, aliases]) => `${category}: ${aliases.join(", ")}`).join("\n");
}

function parseAliases(value: string) {
  const result: Record<string, string[]> = {};
  for (const line of value.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const category = line.slice(0, separator).trim();
    const aliases = line.slice(separator + 1).split(",").map((alias) => alias.trim()).filter(Boolean);
    if (category && aliases.length) result[category] = aliases;
  }
  return result;
}

export default function ProductCatalogConfigCard({ userProfile }: { userProfile: UserProfile | null }) {
  const [config, setConfig] = useState<CompanyProductCatalogConfig | null>(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [maxImages, setMaxImages] = useState(5);
  const [catalogName, setCatalogName] = useState("Thư viện sản phẩm");
  const [itemLabel, setItemLabel] = useState("sản phẩm");
  const [selectionMessage, setSelectionMessage] = useState("Bạn chọn mẫu phù hợp rồi gửi lại ảnh giúp shop nhé.");
  const [businessDescription, setBusinessDescription] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [scannedCategories, setScannedCategories] = useState<Array<{ name: string; imageCount: number }>>([]);
  const [busy, setBusy] = useState<"load" | "save" | "test" | "">("load");
  const [scanResult, setScanResult] = useState("");
  const canEdit = userProfile?.role === "admin" || userProfile?.role === "superadmin";

  const applyConfig = (value: CompanyProductCatalogConfig) => {
    setConfig(value);
    setFolderUrl(value.rootFolderUrl || "");
    setMaxImages(value.maxImagesPerReply || 5);
    setCatalogName(value.catalogName || "Thư viện sản phẩm");
    setItemLabel(value.itemLabel || "sản phẩm");
    setSelectionMessage(value.selectionMessage || "Bạn chọn mẫu phù hợp rồi gửi lại ảnh giúp shop nhé.");
    setBusinessDescription(value.businessDescription || "");
    setAliasesText(aliasesToText(value.categoryAliases || {}));
  };

  useEffect(() => {
    authService.getCompanyProductCatalogConfig()
      .then(applyConfig)
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(""));
  }, []);

  const save = async () => {
    if (!config) return;
    setBusy("save");
    try {
      applyConfig(await authService.updateCompanyProductCatalogConfig({
        enabled: config.enabled,
        rootFolderUrl: folderUrl.trim(),
        maxImagesPerReply: Math.min(10, Math.max(1, Number(maxImages || 5))),
        catalogName: catalogName.trim(),
        itemLabel: itemLabel.trim(),
        selectionMessage: selectionMessage.trim(),
        businessDescription: businessDescription.trim(),
        categoryAliases: parseAliases(aliasesText),
      }));
      toast.success("Đã lưu thư viện ảnh sản phẩm.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setScanResult("");
    setPreviewImageUrl("");
    setScannedCategories([]);
    try {
      const result = await authService.testCompanyProductCatalogConfig({
        rootFolderUrl: folderUrl.trim(),
        catalogName: catalogName.trim(),
      });
      setScanResult(`${result.categoryCount} danh mục, ${result.imageCount} ảnh`);
      setPreviewImageUrl(result.previewImageUrl || "");
      setScannedCategories(result.categories || []);
      toast.success(`Đã đọc ${result.categoryCount} danh mục và ${result.imageCount} ảnh.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  if (busy === "load") return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Đang tải thư viện ảnh sản phẩm...</div>;
  if (!config) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 text-left">
          <div className="rounded-xl bg-amber-50 p-2 text-amber-600"><FolderOpen className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Thư viện ảnh sản phẩm</h3>
            <p className="mt-1 text-[11px] text-slate-500">Dùng cho bánh, trái cây, vật liệu và các ngành hàng khác.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={config.enabled} disabled={!canEdit} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />
          Bật
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left md:grid-cols-2">
        <label className="space-y-1 text-[11px] font-semibold text-slate-600 md:col-span-2">
          Link thư mục Google Drive gốc
          <input value={folderUrl} disabled={!canEdit} onChange={(event) => setFolderUrl(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Tên thư viện
          <input value={catalogName} disabled={!canEdit} onChange={(event) => setCatalogName(event.target.value)} placeholder="Thư viện trái cây" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Cách gọi sản phẩm
          <input value={itemLabel} disabled={!canEdit} onChange={(event) => setItemLabel(event.target.value)} placeholder="trái cây, vật liệu, bánh..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Số ảnh gửi mỗi lần
          <input type="number" min="1" max="10" value={maxImages} disabled={!canEdit} onChange={(event) => setMaxImages(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600">
          Mô tả ngành hàng
          <input value={businessDescription} disabled={!canEdit} onChange={(event) => setBusinessDescription(event.target.value)} placeholder="Cửa hàng trái cây nhập khẩu và giỏ quà" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600 md:col-span-2">
          Tin nhắn sau khi gửi ảnh
          <input value={selectionMessage} disabled={!canEdit} onChange={(event) => setSelectionMessage(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-slate-600 md:col-span-2">
          Từ đồng nghĩa danh mục (không bắt buộc)
          <textarea value={aliasesText} disabled={!canEdit} onChange={(event) => setAliasesText(event.target.value)} rows={3} placeholder={"Táo nhập khẩu: táo Mỹ, apple\nĐá marble: đá cẩm thạch, marble"} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-amber-500" />
        </label>
      </div>

      <p className="rounded-xl bg-amber-50 px-3 py-2 text-left text-[11px] leading-relaxed text-amber-800">
        Chia sẻ thư mục với quyền Người xem cho <b>{config.serviceAccountEmail}</b>. Mỗi thư mục con là một danh mục sản phẩm; hệ thống tải ảnh qua Service Account và gửi bản Cloudinary cho khách.
      </p>

      {previewImageUrl && <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left"><img src={previewImageUrl} alt="Ảnh kiểm tra thư viện" className="h-16 w-16 rounded-lg object-cover" /><span className="text-[11px] font-semibold text-emerald-700">Ảnh kiểm tra đã tải thành công qua Cloudinary.</span></div>}

      {scannedCategories.length > 0 && <div className="flex flex-wrap gap-2">{scannedCategories.map((category) => <span key={category.name} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{category.name}: {category.imageCount} ảnh</span>)}</div>}

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
