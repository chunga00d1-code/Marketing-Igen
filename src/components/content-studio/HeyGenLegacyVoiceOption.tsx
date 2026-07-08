import { ChevronRight, Volume2 } from "lucide-react";
import { HEYGEN_THEME } from "./heygenTheme";

interface HeyGenLegacyVoiceOptionProps {
  selectedVoiceName?: string;
  selectedVoiceLanguage?: string;
  onClick: () => void;
}

export function HeyGenLegacyVoiceOption({
  selectedVoiceName,
  selectedVoiceLanguage,
  onClick,
}: HeyGenLegacyVoiceOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-[20px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} p-3 text-left transition-all duration-200 hover:border-cyan-400 hover:bg-cyan-50/40 hover:shadow-sm`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600">
          <Volume2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{selectedVoiceName || "Chọn giọng nói HeyGen"}</p>
          <p className="text-xs text-slate-500">{selectedVoiceLanguage || "Thư viện giọng đọc HeyGen AI"}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}
