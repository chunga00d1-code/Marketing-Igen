# Đề xuất tính năng tạo video bất động sản từ bản đồ 3D

> Ngày lập: 19/08/2026  
> Mục đích: giúp người không chuyên kỹ thuật quyết định có nên đầu tư, cần bao lâu và cần bao nhiêu ngân sách.  
> Đây là dự toán ban đầu, chưa phải báo giá cố định.

## Kết luận ngắn

Có thể xây một tính năng hoàn toàn mới, tách riêng khỏi **HTML to Video**, chuyên tạo video giới thiệu vị trí bất động sản. Hệ thống hiện tại có thể dùng lại phần tài khoản, dữ liệu doanh nghiệp, AI viết nội dung, giọng đọc, hàng đợi render, lưu lịch sử và xuất MP4. Phần khó và mới là bản đồ 3D, đường bay camera, đánh dấu khu đất, tuyến đường và địa điểm xung quanh.

Khuyến nghị thực tế:

- Không bắt đầu bằng việc tự động hóa Google Earth Studio. Đây là công cụ chạy trong trình duyệt, yêu cầu tab Chrome hoạt động khi render cục bộ và tài liệu công khai không cung cấp một API backend để ERP tự tạo hàng loạt video.
- Không mặc định dùng Google Photorealistic 3D Tiles để bán video BĐS. Công nghệ có thể làm được, nhưng điều khoản video công khai của Map Tiles API giới hạn rất chặt. Cần Google xác nhận bằng văn bản hoặc có hợp đồng phù hợp trước khi triển khai thương mại.
- Nên thực hiện một đợt thử nghiệm kỹ thuật và pháp lý kéo dài **1–2 tuần** trước. Chỉ sau khi chốt được nguồn bản đồ có quyền sử dụng mới triển khai bản đầy đủ.
- Nếu đã có giấy phép nguồn bản đồ phù hợp, bản MVP dùng được trong nội bộ cần khoảng **8–10 tuần**; bản vận hành ổn định cho khách hàng cần tổng cộng khoảng **12–16 tuần** với đội 2 kỹ sư chính và QA/thiết kế bán thời gian.
- Ngân sách phát triển dự kiến: **300–720 triệu đồng**, chưa gồm phí mua dữ liệu/giấy phép bản đồ đặc biệt. Nên duyệt ngân sách theo từng giai đoạn, không chi toàn bộ ngay từ đầu.

## Video mẫu đang thể hiện điều gì?

Video được cung cấp dài khoảng **2 phút 52 giây**, khung dọc **576 × 1024**, gồm người thuyết trình, giọng nói và phần quay màn hình bản đồ 3D.

Các thao tác nhìn thấy gồm:

1. Tìm và khoanh vùng khu vực.
2. Xác định tuyến đường hoặc hướng tiếp cận.
3. Vẽ ranh giới/đường trên bản đồ.
4. Cho camera bay, phóng to, thu nhỏ và xoay quanh khu vực.
5. Xem lại chuyển động tự động trên timeline.

Video mẫu là video hướng dẫn thao tác một công cụ bản đồ. Tính năng đề xuất không sao chép màn hình công cụ đó; nó biến cùng ý tưởng thành quy trình đơn giản cho nhân viên BĐS: nhập địa chỉ và thông tin dự án, xem trước, chỉnh sửa, sau đó xuất MP4.

## Người dùng sẽ làm gì?

Tên gợi ý cho khu vực mới: **Video BĐS bản đồ 3D**.

Người dùng chỉ cần:

1. Nhập địa chỉ hoặc chọn đúng điểm trên bản đồ.
2. Điền tên dự án, giá, diện tích, tiện ích, thông tin liên hệ và lời kêu gọi hành động.
3. Chọn các địa điểm muốn làm nổi bật như trường học, bệnh viện, trung tâm thương mại, quốc lộ hoặc sân bay.
4. Nhập thời gian di chuyển đã được kiểm chứng hoặc cho hệ thống tính bằng dịch vụ chỉ đường.
5. Tải ảnh, video, logo và bộ nhận diện của dự án.
6. Chọn mẫu video 9:16, 1:1 hoặc 16:9.
7. Xem trước từng cảnh, sửa nội dung, rồi bấm xuất video.

Một video mặc định có thể gồm:

- Cảnh mở đầu từ góc nhìn rộng rồi bay đến dự án.
- Ghim vị trí và khoanh ranh giới khu đất.
- Vẽ 1–3 tuyến đường quan trọng.
- Hiện các tiện ích xung quanh và khoảng cách/thời gian di chuyển.
- Chèn ảnh hoặc video thực tế của dự án.
- Cảnh cuối có giá, ưu đãi, logo và thông tin liên hệ.

## Vì sao phải tách khỏi HTML to Video?

HTML to Video hiện tại phù hợp với chữ, hình ảnh, thẻ nội dung và hiệu ứng 2D. Bản đồ 3D cần một bộ máy đồ họa khác để tải địa hình, nhà cửa, di chuyển camera và vẽ các lớp thông tin đúng tọa độ.

Hai tính năng có thể dùng chung “phần hậu cần”, nhưng dữ liệu nghiệp vụ và màn hình sử dụng nên tách riêng:

| Dùng chung | Tách riêng cho BĐS |
| --- | --- |
| Tài khoản và doanh nghiệp | Dự án, tọa độ và ranh đất |
| Kho ảnh/video và logo | Đường bay camera trên bản đồ |
| AI viết lời thoại | Tuyến đường, POI và khoảng cách |
| Giọng đọc | Nguồn dữ liệu bản đồ và giấy phép |
| Hàng đợi render, trạng thái, retry | Mẫu cảnh chuyên BĐS |
| Lịch sử và link MP4 | Chi phí bản đồ của từng video |

Tách như vậy giúp lỗi bản đồ không ảnh hưởng HTML to Video, dễ theo dõi chi phí và có thể đổi nhà cung cấp bản đồ sau này.

## Luồng hoạt động đề xuất

```text
Thông tin BĐS + vị trí + hình ảnh
              ↓
Kiểm tra địa chỉ, tọa độ và các thông tin được phép dùng
              ↓
AI đề xuất kịch bản và chia cảnh
              ↓
Tạo đường bay bản đồ 3D + ghim + ranh giới + tuyến đường
              ↓
Ghép chữ, ảnh dự án, logo và giọng đọc
              ↓
Người dùng xem trước và chỉnh sửa
              ↓
Backend render, kiểm tra âm thanh/hình ảnh, xuất MP4
              ↓
Lưu lịch sử, chi phí và nguồn dữ liệu đã sử dụng
```

Không nên để AI tự bịa giá, diện tích, khoảng cách hoặc tiện ích. Mỗi thông tin quan trọng phải đến từ người dùng, tài liệu dự án hoặc dịch vụ bản đồ đã được xác minh.

## Ba phương án triển khai

### Phương án A — Bán tự động, dùng clip bản đồ đã có

Nhân viên tự tạo hoặc tải lên một clip bản đồ hợp lệ. ERP lo phần kịch bản, chữ, giọng đọc, ảnh dự án và xuất video cuối.

- Thời gian: **4–6 tuần**.
- Chi phí phát triển: **140–280 triệu đồng**.
- Ưu điểm: nhanh, ít rủi ro kỹ thuật, có thể thử nhu cầu thị trường sớm.
- Nhược điểm: vẫn cần người thao tác; chưa phải “nhập địa chỉ là có video”. Quyền sử dụng clip đầu vào vẫn phải được kiểm tra.

### Phương án B — Tự động hoàn toàn bằng nguồn bản đồ được cấp phép

ERP tự tìm vị trí, lập đường bay, vẽ ranh giới, dựng cảnh và xuất video.

- Thời gian đến MVP nội bộ: **8–10 tuần sau khi chốt nguồn dữ liệu**.
- Thời gian đến bản production: **12–16 tuần**, tính cả giai đoạn thử nghiệm 1–2 tuần.
- Chi phí phát triển: **300–720 triệu đồng**.
- Ưu điểm: đúng trải nghiệm mong muốn, tạo được số lượng lớn, ít thao tác tay.
- Nhược điểm: phụ thuộc giấy phép, độ phủ 3D, GPU/render và chi phí dữ liệu theo lượt dùng.

Đây là phương án nên hướng tới, nhưng chỉ được duyệt sau khi nhà cung cấp xác nhận quyền tạo và cung cấp video BĐS thương mại.

### Phương án C — Google Aerial View API

Google có API tạo video bay quanh một địa chỉ và có tài liệu riêng cho bài toán BĐS. Tuy nhiên, hiện dịch vụ chỉ hỗ trợ địa chỉ tại Hoa Kỳ, không phù hợp với dự án tại Việt Nam. Video cũng được phát qua URL của Google; tài liệu nêu không được tải xuống, lưu trữ hoặc cache như file riêng.

- Phù hợp: sản phẩm BĐS tại Hoa Kỳ, phát video trong website/app theo điều khoản của Google.
- Không phù hợp: ERP tại Việt Nam cần ghép clip thành MP4 và lưu lâu dài trên Cloudinary.
- Giá công khai hiện tại: miễn phí 5.000 lượt/tháng, sau đó từ **16 USD/1.000 lượt lấy video** ở bậc đầu tiên.

## Lưu ý quan trọng về Google Earth và Google Maps

### Google Earth Studio

Google Earth Studio là công cụ tạo animation trong Chrome. Render cục bộ chạy trong trình duyệt và có thể dừng nếu đóng Chrome hoặc không giữ đúng tab. Đây không phải kiến trúc phù hợp cho worker backend chạy tự động 24/7.

Google yêu cầu luôn hiển thị attribution “Google Earth” và các nhà cung cấp ảnh liên quan trên nội dung. Không được che, cắt hoặc thay đổi attribution.

### Google Photorealistic 3D Tiles

Về kỹ thuật, đây là nguồn hình gần với Google Earth nhất và có thể kết hợp với Cesium để điều khiển camera. Tuy nhiên, chính sách công khai về video cho Map Tiles API chỉ cho phép một nhóm video quảng bá rất hẹp: tối đa 30 giây, giới thiệu khả năng của chính ứng dụng, có nhãn “for promotional purposes only” và không được bán lại như một phần của sản phẩm/trải nghiệm.

Vì vậy, không nên hiểu rằng mua API theo lượt là tự động có quyền bán video marketing cho từng dự án BĐS. Cần gửi mô tả use case cho Google Maps Platform Sales/Legal và nhận xác nhận bằng văn bản trước.

Nếu được cấp phép, giá danh sách hiện tại của Photorealistic 3D Tiles là:

- Miễn phí **1.000 tile requests/tháng**.
- Bậc đầu tiên: **6 USD/1.000 tile requests**.
- Một video sử dụng bao nhiêu tile phụ thuộc vào độ dài đường bay, mức zoom, độ phân giải, vùng địa lý và cache. Không thể suy ra chi phí/video chỉ từ thời lượng.

Ví dụ công thức để theo dõi trong pilot:

```text
Chi phí bản đồ/video = số tile tính phí của video ÷ 1.000 × 6 USD
```

Nếu một thử nghiệm tải 500 tile thì giá danh sách là khoảng 3 USD; nếu tải 2.000 tile thì khoảng 12 USD. Đây chỉ là ví dụ toán học, không phải cam kết mức tiêu thụ thực tế.

## Kế hoạch và thời gian chi tiết

| Giai đoạn | Việc đạt được | Thời gian |
| --- | --- | ---: |
| 0. Xác minh | Chọn 3 địa chỉ thật, thử độ phủ 3D, hỏi quyền sử dụng thương mại, đo tile và thời gian render | 1–2 tuần |
| 1. Prototype | Một video 15–30 giây có đường bay, ghim dự án, ranh giới và chữ mẫu | 2–3 tuần |
| 2. MVP nội bộ | Màn hình riêng, lưu dự án, mẫu cảnh BĐS, preview, giọng đọc, render MP4, lịch sử | 4–5 tuần |
| 3. Hoàn thiện production | Phân quyền, tính phí, retry, kiểm tra đầu ra, theo dõi chi phí, xử lý lỗi bản đồ | 3–4 tuần |
| 4. Pilot người dùng | 20–30 video thật, sửa mẫu, đo tỷ lệ lỗi và chi phí/video | 2 tuần |
| **Tổng** | Có thể chồng lấn một số việc | **12–16 tuần** |

Nếu chỉ có một lập trình viên làm toàn thời gian, thời gian thực tế nên dự trù **20–28 tuần** vì phần WebGL/3D và phần video backend là hai chuyên môn khác nhau.

## Dự toán chi phí phát triển

Giả định đội hình:

- 1 kỹ sư full-stack phụ trách màn hình, dữ liệu và API.
- 1 kỹ sư video/3D phụ trách bản đồ, camera và render.
- QA và thiết kế tham gia bán thời gian.
- Tận dụng hạ tầng ERP, đăng nhập, lưu file, AI, TTS và worker hiện có.
- Đơn giá quy đổi tham khảo: **350.000–600.000 đồng/giờ** tùy đội nội bộ hay thuê ngoài và độ khó chuyên môn 3D.

| Hạng mục | Công sức dự kiến | Chi phí dự kiến |
| --- | ---: | ---: |
| Xác minh pháp lý và thử nguồn bản đồ | 50–80 giờ | 18–48 triệu |
| Prototype bản đồ 3D | 120–180 giờ | 42–108 triệu |
| MVP sản phẩm | 380–520 giờ | 133–312 triệu |
| Production, QA, giám sát và pilot | 180–260 giờ | 63–156 triệu |
| Dự phòng 15–20% | 110–160 giờ | 39–96 triệu |
| **Tổng** | **840–1.200 giờ** | **khoảng 300–720 triệu** |

Chi phí có thể tăng nếu cần tự phát triển editor đường bay tự do, bản đồ 3D không đủ phủ tại Việt Nam, cần mua ảnh vệ tinh riêng hoặc cần render 4K.

## Chi phí vận hành sau khi ra mắt

Chi phí mỗi video gồm bốn phần:

1. **Bản đồ/ảnh địa lý:** phụ thuộc nhà cung cấp và số tile/lượt lấy video.
2. **AI và giọng đọc:** thường nhỏ hơn chi phí bản đồ 3D; cần đo theo prompt, số lần sửa và độ dài lời thoại.
3. **Máy render:** phụ thuộc thời lượng, độ phân giải, số cảnh và có cần GPU hay không.
4. **Lưu trữ/băng thông:** phụ thuộc dung lượng MP4 và số lượt xem/tải.

Không nên đặt một giá cố định cho khách hàng trước pilot. Trong 20–30 video đầu, hệ thống cần ghi lại chi phí thật của từng bước. Sau pilot mới đặt mức credit/video và luôn cộng dự phòng cho retry.

Ngân sách thử nghiệm ban đầu nên dành riêng **15–40 triệu đồng** cho API bản đồ, máy render, AI, lưu trữ và các lượt render lỗi. Khoản này tách khỏi chi phí nhân công và có thể thấp hơn đáng kể nếu nhà cung cấp có free tier phù hợp.

## Những gì MVP nên có và chưa nên có

### Nên có ngay

- Một tab/sản phẩm riêng cho video BĐS.
- Nhập địa chỉ, tọa độ hoặc chọn điểm trên bản đồ.
- Ghim dự án, ranh giới đơn giản và tối đa 3 tuyến đường.
- Tối đa 5 địa điểm xung quanh.
- 3–5 mẫu chuyển động camera cố định để kết quả ổn định.
- Ảnh/video dự án, logo, màu thương hiệu, lời thoại và CTA.
- Preview, chỉnh chữ, đổi thứ tự cảnh và xuất MP4.
- Lưu nguồn dữ liệu, attribution, chi phí, trạng thái và lỗi của từng video.
- Kiểm tra MP4 có hình và âm thanh trước khi báo hoàn thành.

### Để sau MVP

- Editor camera tự do như phần mềm dựng phim chuyên nghiệp.
- Tự dựng mô hình 3D của tòa nhà từ ảnh.
- Nhiều người cùng sửa một project theo thời gian thực.
- Video dài trên 90 giây hoặc 4K.
- Tạo hàng trăm biến thể cùng lúc.
- Avatar người nói giống video mẫu; có thể thêm sau như một lớp video riêng.

Giới hạn MVP giúp giảm rủi ro từ một “công cụ dựng phim 3D” quá lớn thành một “máy tạo video BĐS theo mẫu” có thể hoàn thành và bán được.

## Rủi ro cần chấp nhận hoặc xử lý

| Rủi ro | Tác động | Cách xử lý |
| --- | --- | --- |
| Không được cấp quyền dùng hình Google cho video bán lại | Không thể ra mắt theo phương án Google | Chốt pháp lý trước; chuẩn bị nguồn dữ liệu thay thế |
| Khu vực Việt Nam thiếu mô hình 3D đẹp | Video không giống mẫu | Test 3 địa chỉ đại diện trước khi làm sản phẩm |
| Ảnh bản đồ cũ | Dự án mới chưa xuất hiện | Cho phép chèn mô hình/ảnh dự án và ghi ngày nguồn ảnh |
| Sai khoảng cách hoặc thời gian đi lại | Gây hiểu nhầm khách hàng | Lấy từ API chỉ đường hoặc bắt buộc người dùng xác nhận |
| Render WebGL không ổn định | Video lỗi, đen hình hoặc thiếu tile | Worker có GPU, chờ tải đủ tile, retry giới hạn và kiểm tra frame |
| Chi phí tile tăng bất ngờ | Lỗ trên mỗi video | Quota, giới hạn đường bay/zoom, log chi phí và ngắt khi vượt ngân sách |
| Attribution bị chữ/CTA che | Vi phạm điều khoản | Dành vùng cố định, kiểm tra tự động trước xuất video |

## Điều kiện để duyệt dự án

Chỉ chuyển từ giai đoạn 0 sang xây MVP khi đáp ứng đủ:

1. Có văn bản hoặc hợp đồng xác nhận được phép tạo, lưu, ghép và cung cấp video BĐS thương mại.
2. Ít nhất 3 địa chỉ mục tiêu tại Việt Nam có chất lượng hình ảnh chấp nhận được.
3. Prototype 20–30 giây render ổn định và attribution luôn rõ.
4. Đã đo được số lượt API, thời gian render và chi phí thật cho một video.
5. Có phương án thay thế khi nhà cung cấp bản đồ lỗi hoặc khu vực không có 3D.
6. Người phụ trách kinh doanh chấp nhận video là hình ảnh tham khảo, không thay thế hồ sơ pháp lý hoặc khảo sát thực tế.

## Quyết định đề xuất

Duyệt ngay **giai đoạn 0 với trần 60 triệu đồng và tối đa 2 tuần**. Kết quả bắt buộc là một prototype, bảng đo chi phí thật và xác nhận quyền sử dụng nguồn bản đồ.

Nếu cả ba đạt yêu cầu, duyệt tiếp MVP theo ngân sách mục tiêu **300–500 triệu đồng**. Chỉ dùng phần dự phòng để nâng lên tối đa **720 triệu đồng** khi đã chứng minh nhu cầu người dùng hoặc phát sinh yêu cầu giấy phép/hạ tầng có lý do rõ ràng.

Nếu Google không cho phép use case thương mại này, chọn một trong hai hướng:

- ra mắt bản bán tự động với clip hợp lệ do người dùng cung cấp; hoặc
- ký với nhà cung cấp dữ liệu bản đồ/ảnh 3D khác có điều khoản cho phép tạo và bán video dẫn xuất.

Không nên cố tự động điều khiển giao diện Google Earth Studio bằng bot. Cách đó dễ hỏng khi Google đổi giao diện, không phù hợp worker production và không giải quyết được quyền sử dụng thương mại.

## Nguồn tham khảo chính thức

- [Google Earth Studio là công cụ animation chạy trong trình duyệt](https://earth.google.com/studio/docs/)
- [Cách Google Earth Studio render và yêu cầu giữ Chrome hoạt động](https://earth.google.com/studio/docs/making-animations/rendering/)
- [Yêu cầu attribution của Google Earth Studio](https://earth.google.com/studio/docs/attribution/)
- [Giá Google Maps Platform, gồm Photorealistic 3D Tiles và Aerial View](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Chính sách Map Tiles API và giới hạn tạo video](https://developers.google.com/maps/documentation/tile/policies)
- [Phạm vi, giới hạn lưu trữ và cách hoạt động của Aerial View API](https://developers.google.com/maps/documentation/aerial-view/overview)
- [Chính sách và attribution của Aerial View API](https://developers.google.com/maps/documentation/aerial-view/policies)

> Giá và điều khoản có thể thay đổi. Cần kiểm tra lại tài liệu chính thức và hợp đồng tại thời điểm ký với nhà cung cấp.
