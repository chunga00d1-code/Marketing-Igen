import type { FormEvent } from "react";
import { Building2, Lock, Mail, RefreshCw, User, X } from "lucide-react";
import { CompanyHeyGenConfig } from "../../types";
import { CompanyEditFormState, CompanyFormState } from "./types";

interface Props {
  mode: "create" | "edit";
  open: boolean;
  form: CompanyFormState | CompanyEditFormState;
  submitting: boolean;
  heygenLibrary?: { avatars: any[]; voices: any[]; counts?: { avatars: number; voices: number } } | null;
  heygenLoading?: boolean;
  onClose: () => void;
  onChange: (field: string, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onTestHeyGen?: () => void;
  onSyncHeyGen?: () => void;
}

export function CompanyModal({
  mode,
  open,
  form,
  submitting,
  heygenLibrary,
  heygenLoading,
  onClose,
  onChange,
  onSubmit,
  onTestHeyGen,
  onSyncHeyGen,
}: Props) {
  if (!open) return null;

  const isEdit = mode === "edit";
  const editForm = form as CompanyEditFormState;
  const heygenConfig = (editForm.heygenConfig || {}) as CompanyHeyGenConfig;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="relative flex items-center justify-between bg-slate-900 p-6 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-indigo-600 p-2 shadow-lg shadow-indigo-500/20">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-sans text-sm font-bold uppercase tracking-wider">
                {isEdit ? "Chinh sua doanh nghiep" : "Dang ky doanh nghiep moi"}
              </h3>
              <p className="mt-0.5 font-mono text-[10px] text-slate-300">
                {isEdit ? "Cap nhat thong tin doanh nghiep va tai khoan HeyGen cong ty" : "Khoi tao moi truong SaaS multi-tenant"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5 text-left">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Ten doanh nghiep *</label>
              <input
                type="text"
                required
                placeholder="Vi du: Cong ty TNHH ABC"
                value={(form as any).companyName ?? (form as any).name}
                onChange={(e) => onChange(isEdit ? "name" : "companyName", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="col-span-2 space-y-1.5 text-left">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Ma doanh nghiep *</label>
              <input
                type="text"
                required
                placeholder="Vi du: ABC"
                value={(form as any).companyCode ?? (form as any).code}
                onChange={(e) => onChange(isEdit ? "code" : "companyCode", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs uppercase outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isEdit ? (
            <div className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Email chu doanh nghiep *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    placeholder="owner@company.com"
                    value={editForm.ownerEmail}
                    onChange={(e) => onChange("ownerEmail", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3.5 text-xs font-mono outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-left">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Cau hinh HeyGen theo cong ty</p>
                  <p className="mt-1 text-[11px] text-cyan-900/80">
                    Moi cong ty dung 1 account HeyGen rieng. Thu vien avatar se lay tu My Avatar cua account nay.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">HeyGen API Key</label>
                  <input
                    type="text"
                    placeholder="Nhap khoa API HeyGen cua cong ty"
                    value={heygenConfig.apiKey || ""}
                    onChange={(e) => onChange("heygenConfig.apiKey", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-mono outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Avatar mac dinh</label>
                    <select
                      value={heygenConfig.defaultAvatarId || ""}
                      onChange={(e) => onChange("heygenConfig.defaultAvatarId", e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Chon avatar mac dinh</option>
                      {(heygenLibrary?.avatars || []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Voice mac dinh</label>
                    <select
                      value={heygenConfig.defaultVoiceId || ""}
                      onChange={(e) => onChange("heygenConfig.defaultVoiceId", e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Chon voice mac dinh</option>
                      {(heygenLibrary?.voices || []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1 rounded-xl border border-cyan-100 bg-white px-3 py-3 text-[11px] text-slate-600">
                  <p>Trang thai: <span className="font-semibold">{heygenConfig.isConnected ? "Da ket noi" : "Chua ket noi"}</span></p>
                  <p>My Avatar: <span className="font-semibold">{heygenLibrary?.counts?.avatars ?? 0}</span></p>
                  <p>Voices: <span className="font-semibold">{heygenLibrary?.counts?.voices ?? 0}</span></p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onTestHeyGen}
                    disabled={heygenLoading}
                    className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-xs font-bold text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-50"
                  >
                    {heygenLoading ? "Dang xu ly..." : "Kiem tra ket noi"}
                  </button>
                  <button
                    type="button"
                    onClick={onSyncHeyGen}
                    disabled={heygenLoading}
                    className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {heygenLoading ? "Dang dong bo..." : "Dong bo My Avatar"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="my-4 space-y-4 border-t border-gray-100 pt-4">
              <div className="text-left">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-700">Tai khoan chu doanh nghiep (Admin Owner)</span>
              </div>
              <div className="space-y-1.5 text-left">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Ten chu so huu *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Vi du: Nguyen Van A"
                    value={(form as CompanyFormState).ownerName}
                    onChange={(e) => onChange("ownerName", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3.5 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5 text-left">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Dia chi email *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    placeholder="owner@company.com"
                    value={(form as CompanyFormState).ownerEmail}
                    onChange={(e) => onChange("ownerEmail", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3.5 text-xs font-mono outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5 text-left">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Mat khau *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    required
                    placeholder="Toi thieu 6 ky tu"
                    value={(form as CompanyFormState).ownerPassword}
                    onChange={(e) => onChange("ownerPassword", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3.5 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-500 transition hover:bg-gray-50">
              Huy bo
            </button>
            <button type="submit" disabled={submitting} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Dang xu ly...
                </>
              ) : isEdit ? "Luu doanh nghiep" : "Khoi tao doanh nghiep"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
