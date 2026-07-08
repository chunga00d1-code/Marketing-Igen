import React from "react";
import { AudioLines, Check, ExternalLink, LoaderCircle, MicVocal, Play, Sparkles, X } from "lucide-react";
import type { HeyGenLibraryItem } from "../../api/heygen";
import type { ElevenLabsAudioRecord } from "./HeyGenPopovers";
import { HEYGEN_THEME } from "./heygenTheme";

type VoiceSourceTab = "third-party" | "personal";

interface VoiceSourcePopoverProps {
  title: string;
  activeTab: VoiceSourceTab;
  onTabChange: (tab: VoiceSourceTab) => void;
  thirdPartyItems: ElevenLabsAudioRecord[];
  selectedThirdPartyId: string;
  isLoadingThirdParty: boolean;
  onRefreshThirdParty: () => void;
  onSelectThirdParty: (item: ElevenLabsAudioRecord) => void;
  personalItems: HeyGenLibraryItem[];
  selectedPersonalId: string;
  onSelectPersonal: (item: HeyGenLibraryItem) => void;
  personalHint?: string;
  onClose: () => void;
}

export function VoiceSourcePopover({
  title,
  activeTab,
  onTabChange,
  thirdPartyItems,
  selectedThirdPartyId,
  isLoadingThirdParty,
  onRefreshThirdParty,
  onSelectThirdParty,
  personalItems,
  selectedPersonalId,
  onSelectPersonal,
  personalHint,
  onClose,
}: VoiceSourcePopoverProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-[min(92vw,760px)] rounded-[28px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} p-4 shadow-2xl`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className={`text-xs ${HEYGEN_THEME.textMuted}`}>
              Tách riêng nguồn giọng nói để dễ kiểm tra và debug từng luồng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "third-party" ? (
              <button
                type="button"
                onClick={onRefreshThirdParty}
                className={`inline-flex h-8 items-center rounded-full border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-3 text-xs font-semibold text-slate-600 transition hover:text-slate-900`}
              >
                Làm mới
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={`flex h-8 w-8 items-center justify-center rounded-full border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} text-slate-500 transition hover:text-slate-900`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`mb-4 grid grid-cols-2 gap-2 rounded-[20px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} p-1`}>
          <TabButton
            active={activeTab === "third-party"}
            icon={<AudioLines className="h-4 w-4" />}
            label="Giọng nói bên thứ 3"
            onClick={() => onTabChange("third-party")}
          />
          <TabButton
            active={activeTab === "personal"}
            icon={<MicVocal className="h-4 w-4" />}
            label="Giọng nói cá nhân"
            onClick={() => onTabChange("personal")}
          />
        </div>

        {activeTab === "third-party" ? (
          <ThirdPartyVoiceList
            items={thirdPartyItems}
            selectedId={selectedThirdPartyId}
            isLoading={isLoadingThirdParty}
            onSelect={onSelectThirdParty}
          />
        ) : (
          <PersonalHeyGenVoiceList
            items={personalItems}
            selectedId={selectedPersonalId}
            hint={personalHint}
            onSelect={onSelectPersonal}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
        active ? "bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-100" : "text-slate-500 hover:bg-white hover:text-slate-900"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ThirdPartyVoiceList({
  items,
  selectedId,
  isLoading,
  onSelect,
}: {
  items: ElevenLabsAudioRecord[];
  selectedId: string;
  isLoading: boolean;
  onSelect: (item: ElevenLabsAudioRecord) => void;
}) {
  if (isLoading) {
    return (
      <div className={`flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} text-sm ${HEYGEN_THEME.textMuted}`}>
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Đang tải audio...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-4 py-6 text-center text-sm ${HEYGEN_THEME.textMuted}`}>
        Chưa có audio ElevenLabs trong lịch sử.
      </div>
    );
  }

  return (
    <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1">
      {items.map((item) => {
        const isSelected = item._id === selectedId;
        return (
          <button
            key={item._id}
            type="button"
            onClick={() => onSelect(item)}
            className={`rounded-[18px] border p-3 text-left transition ${
              isSelected ? `${HEYGEN_THEME.accentBorder} ${HEYGEN_THEME.accentBg}` : `${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} hover:bg-slate-50`
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                  <AudioLines className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.metadata?.title || item.metadata?.voiceName || "Audio ElevenLabs"}</p>
                  <p className={`line-clamp-2 text-xs ${HEYGEN_THEME.textMuted}`}>{item.prompt || "Không có mô tả"}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "Mới tạo"}</p>
                </div>
              </div>
              {isSelected ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border ${HEYGEN_THEME.border} bg-white px-3 text-xs font-semibold text-slate-600 transition hover:text-slate-900`}
              >
                <Play className="h-3.5 w-3.5" />
                Nghe
              </a>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border ${HEYGEN_THEME.border} bg-white px-3 text-xs font-semibold text-slate-600 transition hover:text-slate-900`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Mở file
              </a>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PersonalHeyGenVoiceList({
  items,
  selectedId,
  hint,
  onSelect,
}: {
  items: HeyGenLibraryItem[];
  selectedId: string;
  hint?: string;
  onSelect: (item: HeyGenLibraryItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-4 py-6 text-center text-sm ${HEYGEN_THEME.textMuted}`}>
        Chưa tìm thấy `My Voice` nào từ HeyGen cho tài khoản này.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-[18px] border ${HEYGEN_THEME.border} bg-cyan-50/70 px-4 py-3 text-xs text-cyan-800`}>
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Nguồn giọng cá nhân lấy trực tiếp từ thư viện `My Voice` của HeyGen.</p>
            {hint ? <p className="mt-1 text-cyan-700">{hint}</p> : null}
          </div>
        </div>
      </div>
      <div className="grid max-h-[64vh] grid-cols-1 gap-3 overflow-y-auto pr-1">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          const hasPreviewAudio = Boolean(item.previewAudioUrl);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`rounded-[18px] border p-3 text-left transition ${
                isSelected ? `${HEYGEN_THEME.accentBorder} ${HEYGEN_THEME.accentBg}` : `${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} hover:bg-slate-50`
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                    <MicVocal className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name || item.id}</p>
                    <p className={`text-xs ${HEYGEN_THEME.textMuted}`}>
                      {[item.language, item.accent, item.gender].filter(Boolean).join(" • ") || "My Voice từ HeyGen"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">Voice ID: {item.id}</p>
                  </div>
                </div>
                {isSelected ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={hasPreviewAudio ? item.previewAudioUrl : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!hasPreviewAudio}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!hasPreviewAudio) {
                      event.preventDefault();
                    }
                  }}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${HEYGEN_THEME.border} bg-white text-slate-600 transition ${
                    hasPreviewAudio ? "hover:text-slate-900" : "cursor-not-allowed opacity-40"
                  }`}
                  title={hasPreviewAudio ? "Nghe thử voice" : "Voice này chưa có file nghe thử"}
                >
                  <Play className="h-3.5 w-3.5" />
                </a>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
