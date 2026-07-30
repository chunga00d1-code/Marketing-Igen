import React from 'react';
import { Paperclip, Image as ImageIcon, FileText, Trash2, X, Loader2 } from 'lucide-react';

interface CampaignPromptBoxProps {
  prompt: string;
  setPrompt: (value: string) => void;
  uploadedDocName: string;
  uploadedImageBase64: string;
  loadingDoc: boolean;
  isDragging: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDocumentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveDocument: () => void;
  onClearAll: () => void;
}

export default function CampaignPromptBox({
  prompt,
  setPrompt,
  uploadedDocName,
  uploadedImageBase64,
  loadingDoc,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDocumentUpload,
  handleRemoveDocument,
  onClearAll,
}: CampaignPromptBoxProps) {
  return (
    <div
      className={`relative flex flex-col bg-white border rounded-2xl transition-all overflow-hidden mb-4 ${
        isDragging
          ? "border-indigo-400 ring-2 ring-indigo-400/20 shadow-md"
          : "border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/15 hover:border-gray-300"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        placeholder="Ví dụ: Tạo chiến dịch 7 ngày ra mắt sản phẩm mới, tập trung vào khách hàng 25–35 tuổi, giọng văn gần gũi, mục tiêu tăng inbox..."
        className="w-full text-left min-h-[80px] p-3 pb-1.5 bg-transparent text-xs outline-none resize-none"
      />

      {/* Attached file chip */}
      {uploadedDocName && (
        <div className="px-3 pb-1.5">
          <div className="inline-flex items-center gap-2 pl-1.5 pr-1 py-1 bg-slate-50 border border-slate-200 rounded-lg max-w-xs group">
            <div className="h-7 w-7 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 overflow-hidden">
              {uploadedImageBase64 ? (
                <img src={uploadedImageBase64} alt="Preview" className="h-full w-full object-cover rounded-sm" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-indigo-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-gray-700 truncate leading-tight">{uploadedDocName}</p>
              <p className="text-[9px] text-gray-400 font-mono leading-tight">
                {loadingDoc
                  ? "Đang đọc để AI hiểu brief..."
                  : uploadedImageBase64
                  ? "Hình ảnh"
                  : "Tài liệu"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemoveDocument}
              className="p-0.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              title="Gỡ tập đính kèm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loadingDoc && (
        <div className="flex items-center gap-1.5 px-3.5 pb-1.5 text-indigo-600 text-[10px] font-bold font-mono select-none">
          <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />
          <span>Đang đọc tài liệu để AI phân tích...</span>
        </div>
      )}

      {/* Bottom toolbar with attachment icons */}
      <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-t border-gray-100 bg-gray-50/40">
        {/* Attach document */}
        <label
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer group relative"
          title="Đính kèm tài liệu (PDF, DOCX, TXT, MD)"
        >
          <Paperclip className="h-4 w-4" />
          <input
            type="file"
            accept=".txt,.md,.pdf,.docx"
            onChange={handleDocumentUpload}
            className="hidden"
            disabled={loadingDoc}
          />
        </label>

        {/* Attach image */}
        <label
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer group relative"
          title="Đính kèm ảnh"
        >
          <ImageIcon className="h-4 w-4" />
          <input
            type="file"
            accept="image/*"
            onChange={handleDocumentUpload}
            className="hidden"
            disabled={loadingDoc}
          />
        </label>

        <div className="flex-1" />

        {(prompt || uploadedDocName) && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10px] font-bold font-mono text-red-600 hover:text-red-750 transition-colors flex items-center gap-1 cursor-pointer bg-red-50 hover:bg-red-100/80 px-2.5 py-1 rounded-md border border-red-200/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa tất cả
          </button>
        )}
      </div>
    </div>
  );
}
