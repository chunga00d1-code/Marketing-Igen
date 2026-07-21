import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl my-4 text-center max-w-lg mx-auto shadow-xs">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl mb-3">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {this.props.fallbackLabel || "Đã xảy ra lỗi khi tải giao diện"}
          </h3>
          <p className="text-xs text-slate-500 mb-4 max-w-sm">
            {this.state.error?.message || "Không thể hiển thị thành phần này. Vui lòng tải lại trang."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tải lại trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
