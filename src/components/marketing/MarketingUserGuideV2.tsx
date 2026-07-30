import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleHelp,
  FileSpreadsheet,
  FolderOpen,
  HelpCircle,
  Layers,
  MessageSquare,
  Palette,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

interface QuickStep {
  number: number;
  title: string;
  description: string;
  path: string;
}

interface GuideSection {
  id: string;
  menuLabel: string;
  title: string;
  icon: LucideIcon;
  path?: string;
  intro: string;
  bullets: Array<{ title: string; description: string }>;
  note?: string;
}

const QUICK_STEPS: QuickStep[] = [
  { number: 1, title: "Kết nối kênh", description: "Facebook Page hoặc TikTok", path: "/cai-dat" },
  { number: 2, title: "Tạo chiến dịch", description: "Nhập brief, chọn lịch và media", path: "/marketing" },
  { number: 3, title: "Theo dõi AI", description: "Research, viết bài và tạo brief", path: "/marketing" },
  { number: 4, title: "Đưa media vào", description: "Nhập Drive trong Content Calendar", path: "/marketing" },
  { number: 5, title: "Duyệt & đăng", description: "Xem trước từng bài trước khi đăng", path: "/marketing" },
  { number: 6, title: "Đo hiệu quả", description: "Theo dõi lịch và báo cáo", path: "/marketing" },
];

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "setup",
    menuLabel: "1. Chuẩn bị tài khoản",
    title: "Chuẩn bị tài khoản trước khi tạo chiến dịch",
    icon: Settings,
    path: "/cai-dat",
    intro: "Hoàn tất kết nối và ngân sách trước để worker có thể chuẩn bị, kiểm tra và đăng bài đúng lịch.",
    bullets: [
      {
        title: "Kết nối kênh đăng",
        description: "Vào Cài đặt hệ thống để kết nối Facebook Page hoặc tài khoản TikTok sẽ nhận nội dung.",
      },
      {
        title: "Kiểm tra quyền TikTok",
        description: "Tài khoản phải trả về được creator info, quyền riêng tư và giới hạn thời lượng video trước khi đăng.",
      },
      {
        title: "Kiểm tra số dư Ví",
        description: "AI Research, viết nội dung và tạo media sử dụng Ví. Thiếu số dư có thể khiến slot dừng ở trạng thái cần chú ý hoặc thất bại.",
      },
      {
        title: "Chuẩn bị dữ liệu doanh nghiệp",
        description: "Đưa thông tin sản phẩm, chính sách, bảng giá và nội dung tham chiếu vào brief hoặc Kho tri thức để AI không tự suy đoán.",
      },
    ],
  },
  {
    id: "campaign",
    menuLabel: "2. Tạo chiến dịch",
    title: "Tạo một bài hoặc chiến dịch nhiều bài",
    icon: Sparkles,
    path: "/marketing",
    intro: "Trong Marketing → Tạo chiến dịch, trình hướng dẫn gồm bốn bước và hỗ trợ riêng cho Facebook, TikTok.",
    bullets: [
      {
        title: "Bước 1 — Ý tưởng và brief",
        description: "Mô tả sản phẩm, khách hàng, mục tiêu, ưu đãi và yêu cầu bắt buộc. Brief càng rõ thì Content Pillar và nội dung càng sát.",
      },
      {
        title: "Bước 2 — Nền tảng và hình thức",
        description: "Chọn Facebook hoặc TikTok, sau đó chọn Một bài đăng để xử lý ngay hoặc Chiến dịch nhiều bài để chạy theo lịch.",
      },
      {
        title: "Bước 3 — Media và nghiên cứu",
        description: "Facebook có thể dùng ảnh AI hoặc Order ảnh. TikTok bắt buộc dùng video. Hệ thống tra cứu Google, Facebook và TikTok để bổ sung bối cảnh.",
      },
      {
        title: "Bước 4 — Lịch chạy",
        description: "Chọn tài khoản đăng, ngày bắt đầu/kết thúc, số bài mỗi ngày và giờ đăng. Kiểm tra phần tóm tắt trước khi tạo.",
      },
      {
        title: "Một bài TikTok",
        description: "Có thể tải trực tiếp một video MP4, MOV hoặc WebM tối đa 100MB. Nếu chưa có video, tạo content trước rồi nhập video sau trong Content Calendar.",
      },
    ],
    note: "Tạo campaign chỉ sinh chiến lược và các slot. Nội dung cuối cùng được worker chuẩn bị theo lịch, vì vậy đóng trình duyệt không làm dừng chiến dịch.",
  },
  {
    id: "detail",
    menuLabel: "3. Chi tiết chiến dịch",
    title: "Đọc Research, chiến lược và Content Pillar",
    icon: Layers,
    path: "/marketing",
    intro: "Mở một campaign trong danh sách để xem toàn bộ dữ liệu và trạng thái thực tế của chiến dịch.",
    bullets: [
      {
        title: "Research & Xu hướng",
        description: "Xem bản tổng hợp AI và nguồn công khai từ Google, Facebook, TikTok. Nguồn có thể được tái sử dụng theo cache hoặc bỏ qua khi chạm giới hạn ngân sách.",
      },
      {
        title: "Chiến lược tổng",
        description: "Xem brief gốc, khoảng thời gian, tần suất, số bài đã xuất bản và tình trạng vận hành.",
      },
      {
        title: "Content Pillar",
        description: "Xem các trụ cột nội dung, hướng triển khai, tỷ trọng và phân bổ góc tiếp cận theo TOFU, MOFU, BOFU.",
      },
      {
        title: "Làm mới dữ liệu",
        description: "Campaign đang hoạt động tự cập nhật định kỳ. Có thể đóng cửa sổ và mở lại để tải trạng thái mới nhất.",
      },
    ],
  },
  {
    id: "calendar-media",
    menuLabel: "4. Content Calendar & Drive",
    title: "Quản lý bài và nhập media trong Content Calendar",
    icon: Calendar,
    path: "/marketing",
    intro: "Content Calendar là nơi chính để biết media được đưa vào bài nào, xem preview và xử lý từng slot.",
    bullets: [
      {
        title: "Facebook — nhập ảnh từ Drive",
        description: "Dùng 1.jpg, 2.png… theo thứ tự bài. Album của bài số 3 dùng 3_1.jpg, 3_2.jpg… Hệ thống không tự dồn số khi thiếu file.",
      },
      {
        title: "TikTok — nhập video từ Drive",
        description: "Dùng 1.mp4, 2.mov, 3.webm… hoặc tên 1, 2, 3 nếu Google Drive nhận diện đúng MIME video. TikTok không nhận ảnh hoặc AVI.",
      },
      {
        title: "Quét và xem trước",
        description: "Dán link thư mục Drive công khai, bấm Quét và xem trước, kiểm tra số bài đã ghép, file thiếu và file không khớp trước khi xác nhận.",
      },
      {
        title: "Xem từng slot",
        description: "Chọn một dòng để mở panel bên phải, xem nội dung, media thực tế, lỗi gần nhất và các hành động Duyệt, Đăng ngay hoặc Thử lại.",
      },
      {
        title: "Sau khi xác nhận nhập",
        description: "Lịch tự tải lại. Worker ingest media lên Cloudinary, kiểm tra định dạng và chỉ chuyển bài sang sẵn sàng khi media hoàn tất.",
      },
    ],
    note: "Link Drive phải truy cập được công khai. Hãy kiểm tra mapping trước khi xác nhận vì file được ghép theo số thứ tự slot trong lịch.",
  },
  {
    id: "orders",
    menuLabel: "5. Order media",
    title: "Chuẩn bị brief sản xuất trong Order media",
    icon: FileSpreadsheet,
    path: "/marketing",
    intro: "Order media dùng để mô tả yêu cầu sản xuất cho từng bài; thao tác nhập file Drive đã được đặt tại Content Calendar.",
    bullets: [
      {
        title: "Một dòng cho mỗi bài",
        description: "Mỗi slot có một Order gồm nhóm nội dung, nội dung quay/chụp, yêu cầu sản xuất, headline, visual brief và video script.",
      },
      {
        title: "AI điền Order",
        description: "Có thể để AI điền từng dòng hoặc điền các ô còn trống cho toàn bộ bảng. Kiểm tra lại trước khi đội media thực hiện.",
      },
      {
        title: "Chỉnh sửa trực tiếp",
        description: "Sửa từng ô rồi rời ô để lưu. Dòng đã hoàn tất hoặc hủy sẽ bị giới hạn chỉnh sửa nhằm bảo toàn lịch sử.",
      },
      {
        title: "Cột tùy chỉnh",
        description: "Thêm các trường nội bộ cần thiết cho quy trình sản xuất mà không làm thay đổi lịch đăng hoặc trạng thái xuất bản.",
      },
    ],
  },
  {
    id: "approval",
    menuLabel: "6. Duyệt & xuất bản",
    title: "Xem trước, duyệt và xuất bản đúng nền tảng",
    icon: ShieldCheck,
    path: "/marketing",
    intro: "Chỉ duyệt khi caption, media, tài khoản nhận bài và thời điểm đăng đều đã chính xác.",
    bullets: [
      {
        title: "Facebook",
        description: "Có thể chỉnh nội dung, thay ảnh, duyệt theo lịch hoặc đăng ngay. Bài lỗi có thể sửa thủ công hoặc bấm Thử lại để worker chạy lại.",
      },
      {
        title: "TikTok bắt buộc có video",
        description: "Nút duyệt/đăng chỉ khả dụng khi video HTTPS hoàn chỉnh và preview phát được. Caption TikTok không phải storyboard hoặc lời chỉ dẫn cảnh.",
      },
      {
        title: "Xác nhận TikTok",
        description: "Chọn quyền riêng tư, Comment/Duet/Stitch, khai báo nội dung thương mại, nhãn nội dung AI và chấp nhận điều khoản trước khi gửi.",
      },
      {
        title: "TikTok xử lý bất đồng bộ",
        description: "Sau khi gửi, slot có thể ở trạng thái Đang đăng trong vài phút. Chỉ khi TikTok báo hoàn tất thì hệ thống mới đánh dấu Đã đăng.",
      },
      {
        title: "Tránh đăng trùng",
        description: "Không bấm gửi lặp lại khi slot đang Đăng hoặc Đang xử lý. Hệ thống lưu publish ID để theo dõi kết quả từ TikTok.",
      },
    ],
  },
  {
    id: "status",
    menuLabel: "7. Trạng thái & xử lý lỗi",
    title: "Hiểu trạng thái slot và cách xử lý",
    icon: CheckCircle2,
    path: "/marketing",
    intro: "Trạng thái cho biết worker đang làm gì; không phải trạng thái nào cũng cần thao tác thủ công.",
    bullets: [
      {
        title: "Đang chuẩn bị / Nghiên cứu / Viết / Tạo media",
        description: "Worker đang chạy nền. Chờ hoàn tất và dùng Làm mới nếu muốn kiểm tra ngay.",
      },
      {
        title: "Chờ ảnh hoặc video",
        description: "Mở Content Calendar và nhập thư mục Drive đúng quy tắc. Sau khi xác nhận, worker sẽ tiếp tục xử lý.",
      },
      {
        title: "Chờ duyệt",
        description: "Mở bài, xem nội dung và media rồi chọn Duyệt theo lịch hoặc Đăng ngay.",
      },
      {
        title: "Cần chú ý / Thất bại",
        description: "Đọc lỗi gần nhất. Sửa brief, nội dung hoặc media nếu lỗi validation; kết nối lại tài khoản nếu lỗi quyền; sau đó bấm Thử lại.",
      },
      {
        title: "Đang đăng",
        description: "Yêu cầu đã gửi sang nền tảng và đang chờ callback. Không retry khi chưa có kết quả cuối cùng.",
      },
    ],
  },
  {
    id: "calendar-report",
    menuLabel: "8. Lịch đăng & Báo cáo",
    title: "Theo dõi lịch tổng và hiệu quả nội dung",
    icon: BarChart3,
    path: "/marketing",
    intro: "Dùng hai tab cấp cao để theo dõi toàn bộ bài từ nhiều campaign.",
    bullets: [
      {
        title: "Lịch đăng Content",
        description: "Xem bài theo tháng/ngày, gồm slot campaign và nội dung đã lên lịch. Chọn ngày để xem danh sách chi tiết.",
      },
      {
        title: "Báo cáo",
        description: "Theo dõi số bài, trạng thái xuất bản và các chỉ số hiệu quả đã đồng bộ từ nền tảng.",
      },
      {
        title: "Link bài đã đăng",
        description: "Khi nền tảng trả về post ID và URL, hệ thống lưu vào slot để phục vụ đối soát và báo cáo.",
      },
    ],
  },
  {
    id: "studios",
    menuLabel: "9. Xưởng nội dung & Video",
    title: "Các công cụ tạo media độc lập",
    icon: Palette,
    intro: "Ngoài campaign, hệ thống có các studio chuyên biệt cho thiết kế và video.",
    bullets: [
      {
        title: "Xưởng nội dung",
        description: "Tạo ảnh, thiết kế hàng loạt và chuẩn bị tài nguyên hình ảnh phục vụ bài đăng.",
      },
      {
        title: "Video Studio",
        description: "Tạo video AI, video người dẫn, chuyển động từ ảnh, chỉnh sửa video và cắt video dài thành clip ngắn.",
      },
      {
        title: "Giọng đọc và phụ đề",
        description: "Tạo voice, nhận diện lời nói, chỉnh timeline phụ đề và kết xuất video caption.",
      },
      {
        title: "Kho tri thức",
        description: "Quản lý tài liệu doanh nghiệp dùng làm nguồn tham chiếu cho nội dung, caption và trợ lý AI.",
      },
    ],
  },
  {
    id: "crm",
    menuLabel: "10. CRM & Omni-Inbox",
    title: "Quản lý khách hàng và hội thoại",
    icon: MessageSquare,
    path: "/sales-crm",
    intro: "Theo dõi lead và trao đổi với khách hàng sau khi nội dung tạo ra tương tác.",
    bullets: [
      {
        title: "Phễu khách hàng",
        description: "Quản lý lead theo giai đoạn và theo dõi lịch sử chăm sóc.",
      },
      {
        title: "Omni-Inbox",
        description: "Tập trung hội thoại được tích hợp vào một màn hình để đội ngũ phản hồi nhanh hơn.",
      },
      {
        title: "AI hỗ trợ trả lời",
        description: "AI dùng dữ liệu được cấp quyền và Kho tri thức; vẫn cần kiểm tra các thông tin nhạy cảm như giá, chính sách và cam kết.",
      },
    ],
  },
];

const FAQ_ITEMS = [
  {
    question: "Đóng trình duyệt thì campaign có tiếp tục chạy không?",
    answer: "Có. Worker chạy ở backend; trình duyệt chỉ dùng để tạo, theo dõi và duyệt.",
  },
  {
    question: "Vì sao chưa thấy đủ run Google, Facebook và TikTok?",
    answer: "Nguồn có thể được dùng lại theo cache, bị bỏ qua khi hết giới hạn ngân sách hoặc campaign cũ chỉ lưu một số nguồn. Xem Research của campaign để biết evidence thực tế.",
  },
  {
    question: "Vì sao bài Facebook/TikTok chưa có media?",
    answer: "Kiểm tra trạng thái Chờ ảnh/video, link Drive công khai, tên file theo số thứ tự và định dạng được hỗ trợ.",
  },
  {
    question: "Vì sao TikTok vẫn hiển thị Đang đăng?",
    answer: "TikTok xử lý video bất đồng bộ. Hãy chờ callback hoặc worker đối soát; không gửi lại khi đã có publish ID.",
  },
  {
    question: "Có thể đăng TikTok chỉ với ảnh không?",
    answer: "Không. Mỗi slot TikTok bắt buộc có một video MP4, MOV hoặc WebM hoàn chỉnh.",
  },
  {
    question: "Khi nào nên bấm Thử lại?",
    answer: "Chỉ retry sau khi đã sửa nguyên nhân lỗi. Không retry slot đang tạo media, đang đăng hoặc đang chờ nền tảng xử lý.",
  },
];

export default function MarketingUserGuideV2() {
  const [activeMenuId, setActiveMenuId] = useState("quick-start");
  const [searchTerm, setSearchTerm] = useState("");

  const navigateTo = (path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new Event("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    setActiveMenuId(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const menuItems = useMemo(
    () => [
      { id: "quick-start", label: "Quy trình nhanh", icon: Rocket },
      ...GUIDE_SECTIONS.map((section) => ({
        id: section.id,
        label: section.menuLabel,
        icon: section.icon,
      })),
      { id: "faq", label: "Hỏi đáp thường gặp", icon: HelpCircle },
    ],
    [],
  );

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("vi");
  const filteredMenuItems = menuItems.filter((item) => {
    if (!normalizedSearch) return true;
    const section = GUIDE_SECTIONS.find((candidate) => candidate.id === item.id);
    return [
      item.label,
      section?.title,
      section?.intro,
      ...(section?.bullets.flatMap((bullet) => [bullet.title, bullet.description]) || []),
    ].join(" ").toLocaleLowerCase("vi").includes(normalizedSearch);
  });

  return (
    <div
      className="mx-auto flex max-w-7xl flex-col gap-6 pb-20 font-sans text-slate-800 lg:flex-row"
      id="user_guide_layout"
    >
      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <div className="sticky top-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Danh mục hướng dẫn
            </span>
            <BookOpen className="h-4 w-4 text-slate-400" />
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tính năng hoặc thao tác..."
              aria-label="Tìm trong hướng dẫn sử dụng"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <nav className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
            {filteredMenuItems.map((item) => {
              const isActive = activeMenuId === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                    isActive
                      ? "border border-cyan-200 bg-cyan-50 font-bold text-cyan-800 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-cyan-600" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            {filteredMenuItems.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">
                Không tìm thấy mục phù hợp.
              </p>
            )}
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-5">
        <section
          id="section-quick-start"
          className="scroll-mt-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-cyan-600" />
                <h1 className="text-base font-extrabold text-slate-900">
                  Hướng dẫn vận hành Marketing Workspace
                </h1>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Quy trình khuyến nghị từ kết nối tài khoản đến theo dõi bài đã đăng.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-extrabold text-emerald-700">
              Cập nhật theo giao diện hiện tại
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {QUICK_STEPS.map((item) => (
              <button
                key={item.number}
                type="button"
                onClick={() => navigateTo(item.path)}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/30 hover:shadow-sm"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-extrabold text-white">
                  {item.number}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold text-slate-850">{item.title}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {GUIDE_SECTIONS.map((section, index) => {
          const Icon = section.icon;
          return (
            <section
              key={section.id}
              id={`section-${section.id}`}
              className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-700">
                      Phần {index + 1}
                    </span>
                    <h2 className="text-sm font-extrabold text-slate-850">{section.title}</h2>
                  </div>
                </div>
                {section.path && (
                  <button
                    type="button"
                    onClick={() => navigateTo(section.path)}
                    className="flex cursor-pointer items-center gap-1 text-xs font-bold text-cyan-700 hover:underline"
                  >
                    Mở trang <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="space-y-4 p-4 text-xs text-slate-600">
                <p className="leading-5">{section.intro}</p>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <div key={bullet.title} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <div>
                          <h3 className="font-extrabold text-slate-800">{bullet.title}</h3>
                          <p className="mt-1 leading-5 text-slate-600">{bullet.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {section.note && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="leading-5">{section.note}</p>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <section
          id="section-faq"
          className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
        >
          <div className="flex items-center gap-2.5 border-b border-slate-100 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <HelpCircle className="h-4 w-4" />
            </span>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">
                Tra cứu nhanh
              </span>
              <h2 className="text-sm font-extrabold text-slate-850">Hỏi đáp thường gặp</h2>
            </div>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question} className="rounded-xl border border-slate-150 p-3.5">
                <h3 className="flex items-start gap-2 text-xs font-extrabold text-slate-800">
                  <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
                  {item.question}
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 text-xs text-cyan-950">
          <FolderOpen className="h-5 w-5 shrink-0 text-cyan-700" />
          <p className="leading-5">
            Khi cần kiểm tra một bài cụ thể, hãy mở <strong>Marketing → Tạo chiến dịch → Chi tiết campaign → Content Calendar</strong>. Đây là nơi hiển thị trạng thái, media, lỗi gần nhất và hành động phù hợp cho từng slot.
          </p>
        </div>
      </main>
    </div>
  );
}
