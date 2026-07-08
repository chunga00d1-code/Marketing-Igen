import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Info, XCircle, X, Wallet } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

const TOAST_EVENT = 'igen-toast-trigger';

/**
 * Trình phát sự kiện Toast thông minh sử dụng CustomEvent
 */
export const toast = {
  success: (message: string, duration = 4000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'success', duration } }));
  },
  error: (message: string, duration = 5000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'error', duration } }));
  },
  warning: (message: string, duration = 4000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'warning', duration } }));
  },
  info: (message: string, duration = 4000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'info', duration } }));
  },
};

/**
 * Hộp chứa Toast hiển thị ở góc màn hình
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: ToastType; duration?: number }>;
      const { message, type, duration = 4000 } = customEvent.detail;
      
      const newId = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      setToasts((prev) => {
        // Prevent identical messages from appearing multiple times concurrently
        const isDuplicate = prev.some((t) => t.message === message);
        if (isDuplicate) return prev;

        const newToast: ToastItem = {
          id: newId,
          message,
          type,
          duration,
        };

        // Tự động đóng sau khoảng thời gian duration
        setTimeout(() => {
          removeToast(newId);
        }, duration);

        return [...prev, newToast];
      });
    };

    window.addEventListener(TOAST_EVENT, handleToastEvent);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToastEvent);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-100 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        let bgColor = 'bg-white';
        let borderColor = 'border-slate-200';
        let textColor = 'text-slate-800';
        let icon = <Info className="h-5 w-5 text-blue-500 shrink-0" />;

        switch (t.type) {
          case 'success':
            bgColor = 'bg-emerald-50/95';
            borderColor = 'border-emerald-200';
            textColor = 'text-emerald-900';
            icon = <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />;
            break;
          case 'error':
            if (t.message.includes("Số dư ví không đủ")) {
              bgColor = 'bg-amber-50/98';
              borderColor = 'border-amber-300';
              textColor = 'text-amber-950';
              icon = <AlertTriangle className="h-5.5 w-5.5 text-amber-600 shrink-0 animate-bounce" />;
            } else {
              bgColor = 'bg-rose-50/95';
              borderColor = 'border-rose-200';
              textColor = 'text-rose-900';
              icon = <XCircle className="h-5 w-5 text-rose-600 shrink-0" />;
            }
            break;
          case 'warning':
            bgColor = 'bg-amber-50/95';
            borderColor = 'border-amber-200';
            textColor = 'text-amber-900';
            icon = <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />;
            break;
          case 'info':
            bgColor = 'bg-sky-50/95';
            borderColor = 'border-sky-200';
            textColor = 'text-sky-900';
            icon = <Info className="h-5 w-5 text-sky-600 shrink-0" />;
            break;
        }
 
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-4 rounded-xl border ${borderColor} ${bgColor} ${textColor} shadow-lg backdrop-blur-md animate-slide-in pointer-events-auto transition-all duration-350`}
            role="alert"
          >
            {icon}
            <div className="flex-1 text-xs font-semibold leading-relaxed font-sans select-none">
              {t.message}
              {t.message.includes("Số dư ví không đủ") && (
                <button 
                  onClick={() => {
                    document.getElementById("sidebar_menu_VÍ_&_NẠP_TIỀN")?.click();
                  }}
                  className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-[10px] font-bold shadow-md cursor-pointer transition-all active:scale-95 pointer-events-auto font-sans"
                >
                  <Wallet className="h-3 w-3" /> Nạp tiền ngay
                </button>
              )}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-650 transition-colors cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
