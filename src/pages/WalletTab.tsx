import React, { useEffect, useState } from "react";
import {
  CreditCard,
  History,
  RefreshCw,
  TrendingUp,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  QrCode,
  DollarSign,
  AlertTriangle
} from "lucide-react";
import { walletService, TransactionInfo } from "../services/walletService";
import { toast } from "./Toast";
import { Pagination } from "../components/common/Pagination";

const formatNumberWithDots = (val: string) => {
  const clean = val.replace(/\D/g, "");
  if (!clean) return "";
  return parseInt(clean, 10).toLocaleString("vi-VN");
};

export default function WalletTab() {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<TransactionInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 10;

  // Tham số URL để xử lý callback PayOS & Mock Mode
  const [urlParams, setUrlParams] = useState<URLSearchParams>(new URLSearchParams());
  const isMockPayment = urlParams.get("mock") === "1";
  const statusParam = urlParams.get("status");
  const orderCodeParam = urlParams.get("orderCode");
  const amountParam = urlParams.get("amount");
  const amountVNDParam = urlParams.get("amountVND");

  useEffect(() => {
    setUrlParams(new URLSearchParams(window.location.search));
  }, [window.location.search]);

  // Tải dữ liệu ban đầu
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const balPromise = walletService.getWalletBalance()
        .then(bal => setBalance(bal))
        .catch(err => {
          console.error("Lỗi tải số dư:", err);
          toast.error("Không thể tải số dư ví.");
        });

      const txsPromise = walletService.getTransactionHistory()
        .then(txs => {
          setTransactions(txs);
          setCurrentPage(1);
        })
        .catch(err => {
          console.error("Lỗi tải lịch sử giao dịch:", err);
          toast.error("Không thể tải lịch sử giao dịch.");
        });

      await Promise.all([balPromise, txsPromise]);
    } catch (err: any) {
      toast.error(err.message || "Không thể tải thông tin ví.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Xử lý callback trạng thái giao dịch từ URL
  useEffect(() => {
    const handleUrlCallback = async () => {
      if (statusParam && orderCodeParam) {
        const orderCode = parseInt(orderCodeParam, 10);
        if (isNaN(orderCode)) return;

        if (statusParam === "success") {
          toast.success(`Đang xác nhận giao dịch #${orderCode}...`);
          try {
            await walletService.checkTransactionStatus(orderCode);
            toast.success("Nạp tiền thành công! Số dư đã được cập nhật.");
          } catch (err) {
            console.error("Lỗi xác minh giao dịch:", err);
          }
        } else if (statusParam === "cancelled") {
          toast.warning(`Giao dịch #${orderCode} đã bị hủy bỏ.`);
        }

        // Xóa các query parameter trên thanh địa chỉ để tránh lặp lại thông báo khi F5
        window.history.replaceState(null, "", window.location.pathname);
        loadData(true);
      }
    };

    handleUrlCallback();
  }, [statusParam, orderCodeParam]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    toast.success("Cập nhật số dư thành công!");
  };

  // Tạo liên kết nạp tiền
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVND = parseFloat(depositAmount.replace(/\D/g, ""));

    if (isNaN(amountVND) || amountVND < 2000) {
      toast.error("Vui lòng nhập số tiền hợp lệ (tối thiểu 2,000 VND).");
      return;
    }

    setSubmitting(true);
    try {
      const result = await walletService.createDepositLink(amountVND);
      toast.success("Đang chuyển hướng tới trang thanh toán...");
      
      // Chuyển hướng tới link thanh toán của PayOS (hoặc trang mock)
      window.location.href = result.checkoutUrl;
    } catch (err: any) {
      toast.error(err.message || "Không thể khởi tạo liên kết nạp tiền.");
    } finally {
      setSubmitting(false);
    }
  };

  // Giả lập thanh toán thành công (cho Mock Mode)
  const handleMockPayConfirm = async () => {
    if (!orderCodeParam) return;
    const orderCode = parseInt(orderCodeParam, 10);

    setSubmitting(true);
    try {
      await walletService.confirmMockPayment(orderCode);
      // Chuyển hướng về trang ví kèm trạng thái thành công
      window.location.href = `${window.location.pathname}?status=success&orderCode=${orderCode}`;
    } catch (err: any) {
      toast.error(err.message || "Xác nhận giả lập thanh toán thất bại.");
      setSubmitting(false);
    }
  };

  const formatCredit = (value: number) => {
    return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value) + " Credit";
  };

  const formatVND = (value: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5" /> Thành công
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-100">
            <XCircle className="h-3.5 w-3.5" /> Thất bại
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-100 animate-pulse">
            <Clock className="h-3.5 w-3.5" /> Chờ xử lý
          </span>
        );
    }
  };

  const totalPages = Math.ceil(transactions.length / PAGE_SIZE);
  const activePage = Math.min(Math.max(1, currentPage), totalPages || 1);
  const startIndex = (activePage - 1) * PAGE_SIZE;
  const paginatedTransactions = transactions.slice(startIndex, startIndex + PAGE_SIZE);

  // 1. GIAO DIỆN GIẢ LẬP THANH TOÁN (MOCK CHECKOUT SCREEN)
  if (isMockPayment) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-gray-50/50 p-4 font-sans">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl transition-all">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-8 text-center text-white relative">
            <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-200" /> Giả Lập
            </div>
            <Wallet className="mx-auto h-12 w-12 text-blue-100 mb-3 animate-bounce" />
            <h2 className="text-xl font-bold tracking-tight">CỔNG THANH TOÁN iGEN PAYOS</h2>
            <p className="text-xs text-blue-150 mt-1 opacity-90">Mô phỏng VietQR Chuyển Khoản Ngân Hàng</p>
          </div>

          {/* Details */}
          <div className="p-6 space-y-6">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 text-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Số tiền thanh toán</span>
              <span className="text-3xl font-black text-slate-800">{formatCredit(parseFloat(amountParam || "0"))}</span>
              <span className="text-xs text-gray-500 font-bold block mt-1">~ {formatVND(parseInt(amountVNDParam || "0", 10))}</span>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2.5">
                <span className="text-gray-400 font-medium">Mã đơn hàng:</span>
                <span className="font-bold text-gray-800 font-mono">#{orderCodeParam}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2.5">
                <span className="text-gray-400 font-medium">Nội dung chuyển khoản:</span>
                <span className="font-bold text-gray-800 font-mono">Nap {orderCodeParam}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2.5">
                <span className="text-gray-400 font-medium">Ngân hàng thụ hưởng:</span>
                <span className="font-bold text-gray-800">VietinBank (Demo)</span>
              </div>
            </div>

            {/* QR Mock */}
            <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <QrCode className="h-40 w-40 text-slate-700" />
              <p className="text-[11px] text-gray-400 font-medium mt-2">Dùng ứng dụng ngân hàng quét mã VietQR để thanh toán</p>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3.5 pt-2">
              <button
                onClick={() => {
                  window.location.href = `${window.location.pathname}?status=cancelled&orderCode=${orderCodeParam}`;
                }}
                disabled={submitting}
                className="w-full rounded-2xl border border-gray-200 py-3.5 text-center text-xs font-bold text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700 active:scale-97 disabled:opacity-50"
              >
                Hủy thanh toán
              </button>
              <button
                onClick={handleMockPayConfirm}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-3.5 text-center text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-97 disabled:opacity-50"
              >
                {submitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>Xác nhận đã chuyển</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. GIAO DIỆN QUẢN LÝ VÍ CHÍNH (MAIN WALLET PANEL)
  return (
    <div className="h-full flex flex-col space-y-6 overflow-y-auto pr-1 font-sans" id="wallet_tab_root">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Ví Tài Khoản & Nạp Tiền</h1>
          <p className="text-xs text-gray-500 mt-1">Quản lý ngân sách cá nhân, nạp tiền trực tuyến VietQR nhanh chóng.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-xs font-bold text-gray-700 shadow-xs transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-gray-500 ${refreshing ? "animate-spin" : ""}`} />
          <span>Làm mới ví</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Đang tải thông tin ví...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CỘT TRÁI - CHI TIẾT SỐ DƯ & FORM NẠP */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Balance Warning Banner if low balance */}
            {balance < 10 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-xs text-amber-800 leading-normal flex items-start gap-2.5 shadow-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold">Số dư ví sắp hết!</span>
                  <p className="mt-0.5 text-amber-700 leading-relaxed font-medium">Vui lòng nạp thêm tiền để tránh gián đoạn các dịch vụ Trợ lý AI, sinh ảnh/video và nhân bản giọng nói.</p>
                </div>
              </div>
            )}

            {/* Balance Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-blue-600/10">
              <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-48 w-48 rounded-full bg-white/10 blur-xl" />
              <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-48 w-48 rounded-full bg-black/10 blur-xl" />
              
              <div className="relative z-10 flex flex-col justify-between h-40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-white/10 px-3.5 py-1.5 rounded-2xl backdrop-blur-md">
                    <Wallet className="h-4 w-4 text-blue-200" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ví cá nhân</span>
                  </div>
                  <CreditCard className="h-7 w-7 text-white/80" />
                </div>
                
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Số dư hiện tại</p>
                  <p className="text-3xl font-black mt-1.5 tracking-tight">{formatCredit(balance)}</p>
                </div>
                
                <div className="flex justify-between items-center text-[10px] text-white/75 font-mono">
                  <span>ACTIVE WALLET</span>
                  <span>iGEN ERP</span>
                </div>
              </div>
            </div>

            {/* Deposit Box */}
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-800">Nạp tiền vào ví</h3>
              </div>

              <form onSubmit={handleDeposit} className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-sm">VND</span>
                  <input
                    type="text"
                    required
                    placeholder="Nhập số tiền nạp (VND)..."
                    value={depositAmount}
                    onChange={(e) => {
                      const formatted = formatNumberWithDots(e.target.value);
                      setDepositAmount(formatted);
                    }}
                    className="block h-12 w-full rounded-2xl border border-gray-200 bg-white pl-16 pr-4 text-sm font-bold text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                {depositAmount.replace(/\D/g, "") && (
                  <div className="text-[11px] text-emerald-600 font-bold mt-1.5 ml-1">
                    Quy đổi: ~ {Math.floor(parseFloat(depositAmount.replace(/\D/g, "")) / 100).toLocaleString("vi-VN")} Credit
                  </div>
                )}

                {/* Quick select presets */}
                <div className="grid grid-cols-3 gap-2">
                  {["20000", "50000", "100000", "200000", "500000", "1000000"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDepositAmount(formatNumberWithDots(preset))}
                      className={`rounded-xl border py-2 text-center text-[10px] font-bold transition-all active:scale-95 ${
                        depositAmount.replace(/\D/g, "") === preset
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-100 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      +{parseInt(preset).toLocaleString("vi-VN")}đ
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-600/15 transition-all hover:bg-blue-700 active:scale-97 disabled:opacity-50"
                >
                  {submitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      <span>Nạp tiền trực tuyến (PayOS)</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3 text-[10px] text-gray-400 leading-normal">
                <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" />
                <span>Bảo mật giao dịch VietQR 24/7. Các khoản tiền sẽ được ghi nhận tự động vào số dư ví của bạn ngay sau khi hoàn tất chuyển khoản.</span>
              </div>
            </div>

          </div>

          {/* CỘT PHẢI - LỊCH SỬ GIAO DỊCH */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs h-full flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                    <History className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-800">Lịch sử giao dịch</h3>
                </div>
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-55 px-2.5 py-1 rounded-full border border-gray-100">
                  Tổng {transactions.length} giao dịch
                </span>
              </div>

              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center flex-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-3">
                    <History className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Chưa có giao dịch nào</p>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-[250px] leading-relaxed">Khi bạn thực hiện nạp tiền, thông tin giao dịch sẽ hiển thị chi tiết tại đây.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full border-collapse text-left font-sans text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          <th className="pb-3.5 font-medium">Mã đơn hàng</th>
                          <th className="pb-3.5 font-medium">Thời gian</th>
                          <th className="pb-3.5 font-medium">Loại</th>
                          <th className="pb-3.5 font-medium">Mô tả / Mục đích</th>
                          <th className="pb-3.5 font-medium text-right">Số tiền</th>
                          <th className="pb-3.5 font-medium">Trạng thái</th>
                          <th className="pb-3.5 font-medium text-center">Liên kết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700">
                        {paginatedTransactions.map((tx) => (
                          <tr key={tx._id} className="hover:bg-slate-50/40 transition-colors">
                            <td className="py-3.5 font-mono font-bold text-slate-800">#{tx.orderCode}</td>
                            <td className="py-3.5 text-gray-400">
                              {new Date(tx.createdAt).toLocaleString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "2-digit"
                              })}
                            </td>
                            <td className="py-3.5 font-semibold">
                              {tx.type === "deposit" ? (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <ArrowDownLeft className="h-3.5 w-3.5" /> Nạp tiền
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <ArrowUpRight className="h-3.5 w-3.5" /> Trừ phí API
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-slate-600 font-medium max-w-[220px] truncate" title={tx.description}>
                              {tx.description || "-"}
                            </td>
                            <td className={`py-3.5 text-right font-bold text-sm ${tx.type === "deposit" ? "text-emerald-600" : "text-slate-850"}`}>
                              {tx.type === "deposit" ? "+" : "-"}
                              {formatCredit(tx.amount)}
                            </td>
                            <td className="py-3.5">{getStatusBadge(tx.status)}</td>
                            <td className="py-3.5 text-center">
                              {tx.status === "pending" && tx.checkoutUrl ? (
                                <a
                                  href={tx.checkoutUrl}
                                  target="_self"
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100/70"
                                >
                                  <span>Thanh toán</span> <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <Pagination
                        currentPage={activePage}
                        totalPages={totalPages}
                        onPageChange={(page) => setCurrentPage(page)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
