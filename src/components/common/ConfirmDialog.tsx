import React from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  tone?: "danger" | "warning";
};

const toneStyles = {
  danger: {
    accent: "bg-red-50 text-red-600",
    button: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
  },
  warning: {
    accent: "bg-orange-50 text-orange-600",
    button: "bg-orange-500 hover:bg-orange-600 focus:ring-orange-500",
  },
};

export function ConfirmDialog({
  cancelLabel = "Hủy",
  confirmLabel = "Xác nhận",
  description,
  isOpen,
  isSubmitting = false,
  onClose,
  onConfirm,
  title,
  tone = "danger",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const styles = toneStyles[tone];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200/70 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 bg-gray-50 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 rounded-2xl p-2.5 ${styles.accent}`}>
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-800">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${styles.button}`}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
