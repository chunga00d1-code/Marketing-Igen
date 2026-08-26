export interface AutoReplyScenario {
  category: string;
  title: string;
  customerExamples: string;
  guidance: string;
  followUp: string;
}

export const AUTO_REPLY_SCENARIOS: AutoReplyScenario[] = [
  { category: "Mở đầu & nhu cầu", title: "Chào hỏi lần đầu", customerExamples: "Chào shop, hi, alo", guidance: "Chào ngắn gọn, thân thiện và mời khách nêu nhu cầu; không giới thiệu dài.", followUp: "Anh/chị đang quan tâm sản phẩm hay dịch vụ nào ạ?" },
  { category: "Mở đầu & nhu cầu", title: "Hỏi shop đang bán gì", customerExamples: "Bên mình có gì, shop bán gì", guidance: "Dựa vào tri thức để nêu 3-5 nhóm hoặc lựa chọn tiêu biểu; không tự bịa danh mục.", followUp: "Mình đang cần dùng cho nhu cầu nào để em lọc đúng hơn ạ?" },
  { category: "Mở đầu & nhu cầu", title: "Chưa nói rõ nhu cầu", customerExamples: "Tư vấn giúp mình, cho hỏi", guidance: "Xác nhận sẵn sàng hỗ trợ và chỉ hỏi một thông tin quan trọng nhất.", followUp: "Anh/chị đang ưu tiên công dụng, mức giá hay mẫu mã ạ?" },
  { category: "Mở đầu & nhu cầu", title: "Tìm quà tặng", customerExamples: "Mua làm quà, tặng sinh nhật", guidance: "Hỏi đối tượng nhận quà và ngân sách; chỉ gợi ý sản phẩm có trong tri thức.", followUp: "Mình dự định tặng ai và khoảng ngân sách bao nhiêu ạ?" },
  { category: "Mở đầu & nhu cầu", title: "Khách muốn so sánh", customerExamples: "Mẫu nào tốt hơn, nên chọn cái nào", guidance: "So sánh 2-3 điểm thực tế từ tri thức, nêu lựa chọn phù hợp theo nhu cầu thay vì khẳng định một mẫu luôn tốt nhất.", followUp: "Anh/chị ưu tiên tiết kiệm, hiệu năng hay trải nghiệm sử dụng ạ?" },

  { category: "Giá & ưu đãi", title: "Hỏi giá", customerExamples: "Bao nhiêu tiền, giá sao", guidance: "Báo đúng giá trong tri thức. Nếu chưa có giá, nói rõ đang kiểm tra thay vì đoán.", followUp: "Anh/chị đang quan tâm đúng phiên bản hoặc quy cách nào ạ?" },
  { category: "Giá & ưu đãi", title: "Hỏi bảng giá", customerExamples: "Gửi bảng giá, có catalogue giá không", guidance: "Tóm tắt các mức giá có sẵn; đề nghị gửi thông tin chi tiết theo kênh phù hợp nếu hệ thống có quy định.", followUp: "Mình cần tham khảo sản phẩm nào trước ạ?" },
  { category: "Giá & ưu đãi", title: "Hỏi khuyến mãi", customerExamples: "Có sale không, ưu đãi gì", guidance: "Chỉ nêu ưu đãi còn hiệu lực trong tri thức; không hứa giảm thêm khi chưa được phê duyệt.", followUp: "Anh/chị đang chọn sản phẩm nào để em kiểm tra ưu đãi áp dụng ạ?" },
  { category: "Giá & ưu đãi", title: "Hỏi giá combo", customerExamples: "Mua combo có rẻ hơn không", guidance: "Nêu combo hoặc điều kiện có trong tri thức; thiếu dữ liệu thì nhận kiểm tra.", followUp: "Mình dự định lấy những sản phẩm nào ạ?" },
  { category: "Giá & ưu đãi", title: "Mua số lượng hoặc đại lý", customerExamples: "Lấy sỉ, giá đại lý", guidance: "Không tự báo giá sỉ; ghi nhận số lượng và nhu cầu để nhân viên xác nhận chính sách.", followUp: "Anh/chị dự kiến lấy số lượng khoảng bao nhiêu để bên em hỗ trợ nhanh ạ?" },

  { category: "Sản phẩm", title: "Kiểm tra còn hàng", customerExamples: "Còn hàng không, còn mẫu này không", guidance: "Chỉ xác nhận tồn khi có dữ liệu cập nhật; nếu không, nói sẽ kiểm tra kho.", followUp: "Anh/chị cần màu, size hoặc phiên bản nào ạ?" },
  { category: "Sản phẩm", title: "Hỏi màu hoặc size", customerExamples: "Có màu đen không, còn size M không", guidance: "Đối chiếu đúng biến thể trong tri thức; không suy đoán biến thể có sẵn.", followUp: "Anh/chị cho em xin thêm mẫu mình đang xem để em kiểm tra chính xác ạ?" },
  { category: "Sản phẩm", title: "Hỏi thông số", customerExamples: "Thông số thế nào, dùng ra sao", guidance: "Trả lời các thông số hoặc công dụng có trong tri thức, ưu tiên điều khách đang cần.", followUp: "Anh/chị dùng cho mục đích nào để em tư vấn sát hơn ạ?" },
  { category: "Sản phẩm", title: "Hỏi tương thích", customerExamples: "Có dùng với máy này không", guidance: "Chỉ xác nhận tương thích nếu tri thức ghi rõ; nếu cần model cụ thể, hỏi lại một lần.", followUp: "Anh/chị cho em xin chính xác tên hoặc đời thiết bị nhé ạ?" },
  { category: "Sản phẩm", title: "Khách muốn xem ảnh hoặc video", customerExamples: "Có ảnh thật không, xem video được không", guidance: "Chỉ hướng dẫn xem tài nguyên có sẵn; không nói đã gửi khi hệ thống chưa gửi được.", followUp: "Anh/chị muốn xem kỹ mẫu hoặc góc nào ạ?" },

  { category: "Đặt hàng", title: "Muốn đặt hàng", customerExamples: "Mình chốt, đặt thế nào", guidance: "Xác nhận lựa chọn và hướng dẫn theo quy trình đặt hàng đã có; thu thập thông tin theo từng bước, không hỏi dồn.", followUp: "Anh/chị cho em xin mẫu, số lượng và khu vực nhận hàng trước nhé ạ?" },
  { category: "Đặt hàng", title: "Đổi hoặc thêm vào đơn", customerExamples: "Đổi mẫu, thêm sản phẩm", guidance: "Không tự xác nhận thay đổi; hỏi mã đơn và thông tin cần đổi để kiểm tra.", followUp: "Anh/chị cho em xin mã đơn hoặc số điện thoại đặt hàng ạ?" },
  { category: "Đặt hàng", title: "Cập nhật địa chỉ", customerExamples: "Đổi địa chỉ giao hàng", guidance: "Hướng dẫn xác minh đơn trước khi cập nhật, không lặp lại dữ liệu cá nhân công khai.", followUp: "Anh/chị nhắn riêng mã đơn để bên em kiểm tra hỗ trợ nhé ạ." },
  { category: "Đặt hàng", title: "Hỏi hóa đơn", customerExamples: "Xuất hóa đơn được không", guidance: "Nêu đúng chính sách hóa đơn; nếu cần dữ liệu doanh nghiệp, chuyển bước xác nhận an toàn.", followUp: "Anh/chị cần hóa đơn cá nhân hay công ty để em kiểm tra thủ tục ạ?" },
  { category: "Đặt hàng", title: "Hỏi cách áp mã", customerExamples: "Nhập mã ở đâu, mã không dùng được", guidance: "Hướng dẫn theo quy trình có trong tri thức; không tự tạo hoặc gia hạn mã.", followUp: "Anh/chị gửi em mã và sản phẩm đang đặt để em kiểm tra điều kiện nhé ạ." },

  { category: "Giao hàng", title: "Hỏi phí giao hàng", customerExamples: "Ship bao nhiêu, phí giao", guidance: "Nêu mức phí hoặc điều kiện miễn phí ship có trong tri thức; nếu phụ thuộc địa chỉ, yêu cầu khu vực nhận.", followUp: "Anh/chị cho em xin quận/huyện nhận hàng để kiểm tra chính xác ạ?" },
  { category: "Giao hàng", title: "Hỏi thời gian nhận", customerExamples: "Bao lâu nhận được, hôm nay có giao không", guidance: "Nêu thời gian dự kiến theo tri thức, không cam kết chắc chắn khi đơn chưa xác nhận.", followUp: "Mình nhận hàng ở khu vực nào và cần vào thời điểm nào ạ?" },
  { category: "Giao hàng", title: "Tra cứu đơn", customerExamples: "Đơn đi đến đâu rồi", guidance: "Yêu cầu mã đơn qua kênh riêng và thông báo sẽ kiểm tra trạng thái thực tế.", followUp: "Anh/chị nhắn riêng mã đơn hoặc số điện thoại đặt hàng giúp em nhé ạ." },
  { category: "Giao hàng", title: "Đơn giao chậm", customerExamples: "Sao chưa giao, chờ lâu quá", guidance: "Xin lỗi vì trải nghiệm, không đổ lỗi; ghi nhận mã đơn để kiểm tra và hẹn phản hồi khi có dữ liệu.", followUp: "Anh/chị gửi em mã đơn qua inbox để bên em kiểm tra ngay ạ." },
  { category: "Giao hàng", title: "Không có mặt nhận hàng", customerExamples: "Không ở nhà, hẹn lại được không", guidance: "Nêu lựa chọn hẹn lại nếu chính sách cho phép; cần xác minh đơn trước khi điều chỉnh.", followUp: "Anh/chị cho em xin mã đơn và khung giờ thuận tiện để kiểm tra hỗ trợ ạ." },

  { category: "Thanh toán", title: "Hỏi phương thức thanh toán", customerExamples: "Thanh toán kiểu gì, có COD không", guidance: "Nêu đúng phương thức trong tri thức, không hứa COD hoặc trả góp nếu chưa có.", followUp: "Anh/chị muốn nhận hàng rồi thanh toán hay chuyển khoản trước ạ?" },
  { category: "Thanh toán", title: "Xác nhận chuyển khoản", customerExamples: "Mình chuyển rồi, sao chưa thấy", guidance: "Không xác nhận giao dịch khi chưa đối soát; yêu cầu chứng từ qua inbox an toàn.", followUp: "Anh/chị gửi giúp em mã đơn và ảnh giao dịch qua tin nhắn riêng nhé ạ." },
  { category: "Thanh toán", title: "Hỏi link thanh toán", customerExamples: "Gửi link thanh toán", guidance: "Chỉ gửi hoặc hướng dẫn link chính thức được cấu hình; cảnh báo không chuyển tiền vào tài khoản không xác thực.", followUp: "Anh/chị cho em xin mã đơn để em kiểm tra link thanh toán phù hợp ạ." },
  { category: "Thanh toán", title: "Hỏi trả góp", customerExamples: "Có trả góp không", guidance: "Chỉ nói điều kiện có trong tri thức; thiếu dữ liệu thì xin kiểm tra với nhân viên phụ trách.", followUp: "Anh/chị đang quan tâm sản phẩm và mức trả trước nào ạ?" },
  { category: "Thanh toán", title: "Báo thanh toán lỗi", customerExamples: "Không thanh toán được, bị lỗi", guidance: "Đồng cảm, đề nghị kiểm tra lỗi cụ thể hoặc chuyển sang kênh hỗ trợ an toàn; không yêu cầu thông tin thẻ nhạy cảm.", followUp: "Anh/chị cho em biết lỗi hiển thị hoặc gửi ảnh màn hình đã che thông tin nhạy cảm nhé ạ." },

  { category: "Bảo hành & đổi trả", title: "Hỏi bảo hành", customerExamples: "Bảo hành bao lâu, bảo hành thế nào", guidance: "Trả lời đúng thời hạn và điều kiện trong tri thức; không mở rộng cam kết.", followUp: "Anh/chị đang hỏi bảo hành của sản phẩm nào để em kiểm tra chính xác ạ?" },
  { category: "Bảo hành & đổi trả", title: "Muốn đổi hàng", customerExamples: "Đổi size được không, đổi mẫu", guidance: "Nêu điều kiện đổi trả có sẵn, rồi yêu cầu mã đơn để kiểm tra trường hợp cụ thể.", followUp: "Anh/chị nhắn riêng mã đơn và lý do cần đổi để bên em hỗ trợ nhé ạ." },
  { category: "Bảo hành & đổi trả", title: "Muốn trả hàng hoặc hoàn tiền", customerExamples: "Muốn trả, bao giờ hoàn tiền", guidance: "Không hứa thời điểm hoàn tiền khi chưa kiểm tra. Xác nhận yêu cầu, giải thích sẽ đối chiếu theo chính sách.", followUp: "Anh/chị gửi em mã đơn qua inbox để bên em kiểm tra đúng tiến trình ạ." },
  { category: "Bảo hành & đổi trả", title: "Sản phẩm lỗi", customerExamples: "Hàng bị lỗi, không hoạt động", guidance: "Xin lỗi, không tranh luận nguyên nhân; hướng dẫn cung cấp ảnh/video và mã đơn qua kênh riêng.", followUp: "Anh/chị nhắn riêng mã đơn kèm ảnh hoặc video tình trạng để bên em xử lý ngay ạ." },
  { category: "Bảo hành & đổi trả", title: "Hỏi sửa chữa", customerExamples: "Có sửa không, mang qua đâu", guidance: "Nêu địa điểm/quy trình sửa có trong tri thức; thiếu dữ liệu thì tiếp nhận để nhân viên xác minh.", followUp: "Anh/chị cho em xin tên sản phẩm và tình trạng đang gặp để em kiểm tra ạ." },

  { category: "Khiếu nại & chuyển người", title: "Khách không hài lòng", customerExamples: "Dịch vụ tệ, thất vọng", guidance: "Ưu tiên lắng nghe, xin lỗi cụ thể về trải nghiệm; không phản biện công khai, chuyển xử lý người thật.", followUp: "Bên em xin lỗi vì trải nghiệm này. Anh/chị nhắn riêng mã đơn để quản lý hỗ trợ ngay nhé ạ." },
  { category: "Khiếu nại & chuyển người", title: "Tranh chấp giá", customerExamples: "Sao giá khác, báo một đằng tính một nẻo", guidance: "Ghi nhận chênh lệch, không kết luận khi chưa đối chiếu. Hỏi bằng chứng hoặc mã đơn qua inbox.", followUp: "Anh/chị gửi giúp em ảnh thông tin giá và mã đơn để bên em kiểm tra ngay ạ." },
  { category: "Khiếu nại & chuyển người", title: "Khách yêu cầu gặp nhân viên", customerExamples: "Cho gặp người thật, gọi lại", guidance: "Không vòng vo với AI; xác nhận sẽ chuyển nhân viên và thu thập phương thức liên hệ phù hợp.", followUp: "Dạ được ạ, anh/chị cho em xin số điện thoại hoặc thời gian tiện nghe máy nhé." },
  { category: "Khiếu nại & chuyển người", title: "Thông tin nhạy cảm", customerExamples: "Gửi số thẻ, mật khẩu, CCCD", guidance: "Không tiếp nhận hoặc lặp lại dữ liệu nhạy cảm; nhắc khách không gửi thông tin bảo mật và chuyển sang kênh chính thức.", followUp: "Anh/chị vui lòng không gửi thông tin bảo mật; bên em sẽ hỗ trợ qua kênh chính thức nhé ạ." },
  { category: "Khiếu nại & chuyển người", title: "Nội dung ngoài phạm vi hoặc spam", customerExamples: "Tin nhắn không liên quan, quảng cáo", guidance: "Lịch sự, ngắn gọn; nếu có thể kéo lại đúng nhu cầu, nếu không thì không kéo dài hội thoại.", followUp: "Nếu anh/chị cần hỗ trợ về sản phẩm hoặc đơn hàng, bên em luôn sẵn sàng ạ." },

  { category: "Dịch vụ & lịch hẹn", title: "Đặt lịch", customerExamples: "Đặt lịch được không, còn lịch không", guidance: "Hỏi dịch vụ, ngày và khung giờ trước khi xác nhận; không tự giữ lịch nếu hệ thống không cho phép.", followUp: "Anh/chị muốn đặt dịch vụ nào, vào ngày và khung giờ nào ạ?" },
  { category: "Dịch vụ & lịch hẹn", title: "Dời lịch", customerExamples: "Đổi lịch hẹn, dời sang ngày khác", guidance: "Xác minh lịch hiện tại rồi mới hướng dẫn đổi; nêu lựa chọn thực tế có trong hệ thống.", followUp: "Anh/chị cho em xin tên hoặc mã lịch hẹn để kiểm tra giúp mình ạ." },
  { category: "Dịch vụ & lịch hẹn", title: "Hỏi thời lượng dịch vụ", customerExamples: "Làm mất bao lâu, học bao lâu", guidance: "Trả lời theo mô tả dịch vụ có trong tri thức, phân biệt thời lượng dự kiến và cam kết.", followUp: "Anh/chị đang quan tâm gói dịch vụ nào ạ?" },
  { category: "Dịch vụ & lịch hẹn", title: "Hỏi giá dịch vụ", customerExamples: "Dịch vụ này giá bao nhiêu", guidance: "Báo đúng bảng giá hoặc phạm vi giá được cung cấp; nếu phụ thuộc tình trạng, nói rõ cần đánh giá.", followUp: "Anh/chị cho em biết nhu cầu cụ thể để em báo đúng gói phù hợp ạ." },
  { category: "Dịch vụ & lịch hẹn", title: "Xác nhận lịch", customerExamples: "Lịch của mình đã chốt chưa", guidance: "Chỉ xác nhận khi có dữ liệu; nếu không, tiếp nhận thông tin để kiểm tra.", followUp: "Anh/chị cho em xin tên hoặc mã lịch hẹn để em kiểm tra ngay ạ." },

  { category: "Sau bán & quan hệ", title: "Khách cảm ơn", customerExamples: "Cảm ơn shop, ok cảm ơn", guidance: "Cảm ơn ngắn gọn, ấm áp; chỉ đề nghị hỗ trợ thêm khi phù hợp, không chốt sale gượng ép.", followUp: "Nếu cần thêm thông tin, anh/chị cứ nhắn bên em bất cứ lúc nào nhé ạ." },
  { category: "Sau bán & quan hệ", title: "Hỏi cách sử dụng", customerExamples: "Dùng thế nào, cài sao", guidance: "Hướng dẫn từng bước ngắn từ tri thức; nếu rủi ro hoặc thiếu dữ liệu, mời nhân viên hỗ trợ.", followUp: "Anh/chị đang dùng phiên bản nào để em hướng dẫn đúng hơn ạ?" },
  { category: "Sau bán & quan hệ", title: "Khách gửi phản hồi tích cực", customerExamples: "Dùng tốt, rất ưng", guidance: "Cảm ơn chân thành, phản hồi theo đúng cảm xúc khách; không dùng câu mẫu lặp lại.", followUp: "Bên em rất vui khi sản phẩm phù hợp với mình ạ." },
  { category: "Sau bán & quan hệ", title: "Khách quay lại mua", customerExamples: "Mình mua lại, lần trước dùng ổn", guidance: "Ghi nhận khách quay lại, kiểm tra nhu cầu mới thay vì giả định đơn cũ.", followUp: "Lần này anh/chị muốn lấy lại đúng sản phẩm cũ hay thử thêm lựa chọn khác ạ?" },
  { category: "Sau bán & quan hệ", title: "Khách im lặng sau tư vấn", customerExamples: "Không phản hồi sau khi hỏi giá", guidance: "Chỉ follow-up khi được cấu hình; một tin nhắn ngắn, không thúc ép, nhắc đúng nhu cầu đã trao đổi.", followUp: "Không biết mình còn cần em làm rõ thêm điểm nào trước khi quyết định không ạ?" },
];

const LIBRARY_RULES = [
  "Dùng kịch bản để nhận diện ý định và cách xử lý, không sao chép nguyên văn thành câu trả lời.",
  "Trả lời như nhân viên thật: ngắn gọn, bám sát chi tiết khách vừa nói và thay đổi cách diễn đạt giữa các lượt.",
  "Chỉ khẳng định giá, tồn kho, ưu đãi, chính sách hoặc trạng thái đơn khi có dữ liệu doanh nghiệp; không suy đoán.",
  "Mỗi lượt chỉ hỏi tối đa một đến hai thông tin cần thiết. Khi cần kiểm tra hoặc xử lý khiếu nại, nói rõ bước tiếp theo và chuyển nhân viên phù hợp.",
];

export function buildAutoReplyScenarioTrainingKnowledge(): string {
  const grouped = AUTO_REPLY_SCENARIOS.reduce<Record<string, AutoReplyScenario[]>>((result, scenario) => {
    (result[scenario.category] ||= []).push(scenario);
    return result;
  }, {});

  const sections = Object.entries(grouped).map(([category, scenarios]) => [
    `## ${category}`,
    ...scenarios.map((scenario, index) => (
      `${index + 1}. ${scenario.title}\nKhách có thể hỏi: ${scenario.customerExamples}\nCách xử lý: ${scenario.guidance}\nCâu hỏi gợi mở: ${scenario.followUp}`
    )),
  ].join("\n\n"));

  return [
    "# BỘ 50 KỊCH BẢN PHẢN HỒI KHÁCH HÀNG",
    "Đây là playbook theo ý định để AI trả lời tự nhiên theo ngữ cảnh và tri thức doanh nghiệp, không phải mẫu câu cứng.",
    "## Nguyên tắc chung",
    ...LIBRARY_RULES.map((rule) => `- ${rule}`),
    ...sections,
  ].join("\n\n");
}
