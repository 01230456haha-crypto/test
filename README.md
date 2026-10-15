# Luyện Thi — website thi trắc nghiệm kiểu Azota (GitHub Pages + Firebase)

Giao diện tiếng Việt, có **chế độ sáng/tối**, chạy tốt trên điện thoại và máy tính.
Chạy hoàn toàn trên **GitHub Pages (miễn phí)**; đăng nhập và lưu dữ liệu bằng **Firebase (gói Spark miễn phí)**.
Không cần máy chủ, không cần cài Node, không cần build: chỉ cần tải file lên GitHub.

---

## 0. Trả lời thẳng: dự án có khả thi trên GitHub không?

- **Có**, với kiến trúc *web tĩnh + Firebase* (đúng như yêu cầu đầu tiên của bạn).
- **Không**, nếu dùng bộ công nghệ ở yêu cầu thứ hai (Next.js API Routes, Prisma, PostgreSQL, NextAuth). GitHub Pages **chỉ phục vụ file tĩnh**, không chạy được máy chủ Node, API hay cơ sở dữ liệu. Muốn chạy những thứ đó phải thuê hosting (Vercel/Render/…).
- Vì vậy mình **giữ nguyên các ý tưởng hay** của yêu cầu thứ hai (KaTeX, ma trận câu hỏi, đồng hồ đếm ngược, tự lưu bài, màu indigo, xác nhận nộp bài…) nhưng **viết lại bằng HTML/JS thuần + Firebase** để chạy được trên GitHub Pages.

---

## 1. Cài đặt từng bước (khoảng 20–30 phút)

### Bước 1 — Tạo dự án Firebase
1. Vào https://console.firebase.google.com → đăng nhập Google → **Add project** → đặt tên (vd `luyenthi`) → tắt Google Analytics → **Create**.
2. Trang tổng quan, bấm biểu tượng **`</>` (Web)** → đặt tên app → **Register app**. Firebase hiện đoạn `firebaseConfig = {...}` → **giữ trang này** để dùng ở Bước 2.
3. Menu trái **Build → Authentication → Get started → Sign-in method**, bật:
   - **Email/Password** (bắt buộc — tài khoản dùng tên đăng nhập cũng chạy qua mục này)
   - **Google** (nếu muốn đăng nhập Google; chọn email hỗ trợ)
   - **Anonymous** (chỉ khi muốn chế độ khách)
4. Menu trái **Build → Firestore Database → Create database** → chọn vị trí gần bạn (vd `asia-southeast1`) → **Production mode** → Create.
5. Trong Firestore, mở tab **Rules** → xóa hết nội dung cũ → dán toàn bộ file **`firestore.rules`** → **Publish**.

### Bước 2 — Dán cấu hình vào website
Mở file **`js/config.js`**, thay các giá trị trong `firebaseConfig` bằng giá trị Firebase vừa hiện ra (apiKey, authDomain, projectId, …).
> Các giá trị này không phải mật khẩu; ai cũng thấy được trong mã web. Bảo mật nằm ở **Rules** của Bước 1.

### Bước 3 — Đưa lên GitHub Pages
1. Vào https://github.com → **New repository** → đặt tên (vd `luyenthi`) → **Public** → Create.
2. Bấm **uploading an existing file** → kéo thả **toàn bộ nội dung thư mục dự án** (gồm `index.html`, thư mục `css`, `js`, `firestore.rules`, … giữ nguyên cấu trúc thư mục) → **Commit changes**.
3. **Settings → Pages** → mục *Build and deployment*: **Source = Deploy from a branch**, Branch = **main**, thư mục **/ (root)** → **Save**.
4. Đợi 1–2 phút, GitHub hiện địa chỉ: `https://TEN-BAN.github.io/luyenthi/`.

### Bước 4 — Cho phép tên miền GitHub đăng nhập
Firebase → **Authentication → Settings → Authorized domains → Add domain** → nhập `TEN-BAN.github.io` (chỉ phần tên miền, không có `https://` và không có `/luyenthi`).

### Bước 5 — Tạo tài khoản quản trị (giảng viên) đầu tiên
1. Mở website → **Đăng ký** bằng email của bạn.
2. Firebase → **Firestore Database → Data → collection `users`** → mở document của bạn (tìm theo email) → sửa trường **`role`** từ `user` thành **`admin`** → Update.
3. Tải lại website: thanh dưới/trên sẽ có mục **Quản trị**.
4. Vào **Quản trị → Cài đặt** để chọn cách học viên tạo tài khoản (mở / cần duyệt / đóng). Nếu muốn tự cấp tài khoản, chọn **Đóng**.

---

## 2. Cách dùng nhanh cho giảng viên

1. **Lớp học → Tạo lớp** (vd 12A1).
2. **Học viên → Thêm tài khoản** (hoặc **Hàng loạt**: dán danh sách `tên đăng nhập, mật khẩu, họ tên, lớp` hoặc tải Excel). Học viên không có email dùng *tên đăng nhập*.
3. **Đề thi → Tạo đề mới** → trong trình soạn:
   - **Câu hỏi**: thêm câu trực tiếp, sửa tại chỗ, đổi thứ tự, hoặc **Nhập từ file** (Excel, CSV, JSON, Word .docx, hoặc dán văn bản từ Word).
   - **Cài đặt**: thời gian, dạng làm bài (Luyện tập / Thi từng câu / Thi trải dài), đảo câu/đáp án, khóa xem lại, ẩn đề.
   - **Giao bài**: chọn **lớp** (hoặc từng học viên), hẹn giờ mở/đóng, giới hạn số lần làm.
   - **Kết quả**: điểm trung bình, phân bố điểm, tỷ lệ đạt, xếp hạng, câu sai nhiều nhất, xuất Excel.
   - **Đang làm**: ai đang làm đề này, tiến độ theo thời gian thực.
4. Hoặc giao đề ngay trong **Lớp học → chọn lớp → Đề được giao** bằng các công tắc.

**Quy tắc giao bài:** đề chưa giao cho lớp/học viên nào thì *mọi học viên đều thấy*; đã giao cho ít nhất một lớp (hoặc học viên) thì *chỉ những người đó thấy*.

### Định dạng file Excel
Cột: `STT | Mã câu | Câu hỏi | A | B | C | D | Đáp án | Giải thích`.
STT, Mã câu, Giải thích có thể bỏ trống. Câu chỉ có 2 đáp án (Đúng/Sai) cứ để trống C, D. Công thức đặt trong `$...$`. Có file mẫu **`mau-de-thi.xlsx`**. File Excel xuất ra từ hệ thống nhập lại được y nguyên.

### Dán văn bản từ Word
```
Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. Huế
C. Đà Nẵng
D. Cần Thơ
Đáp án: A
Giải thích: Hà Nội là thủ đô.
```

---

## 3. Giới hạn thật của giải pháp (đọc kỹ)

**Bảo mật / thi nghiêm túc**
- Chấm điểm chạy **ngay trong trình duyệt** và đáp án nằm trong dữ liệu mà học viên tải về. Người biết kỹ thuật có thể xem đáp án hoặc sửa điểm. Hệ thống phù hợp **luyện tập, kiểm tra nội bộ**, **không phù hợp thi nghiêm túc/có điểm quan trọng**.
- “Khóa xem lại”, “ẩn đề”, “giao theo lớp”, giới hạn số lần, hẹn giờ mở/đóng… là **ràng buộc ở giao diện**; người rành kỹ thuật vẫn có thể vượt qua. Muốn chặn thật cần máy chủ (Firebase Cloud Functions — phải bật gói Blaze trả phí).
- Đồng hồ đếm ngược dùng đồng hồ của máy học viên.

**Tài khoản**
- Trình duyệt **không thể** đổi email hoặc mật khẩu của người khác. Cách xử lý trong hệ thống:
  - *Đổi mật khẩu hộ*: chỉ làm được với tài khoản **do bạn cấp** và **học viên chưa tự đổi**. Để làm được điều này, hệ thống lưu mật khẩu cấp ban đầu trong collection `userSecrets` (chỉ admin đọc được, **dạng chữ thường, không mã hóa**). Khi học viên tự đổi mật khẩu thì bản lưu bị xóa.
  - Tài khoản có email: dùng **Gửi mail đặt lại mật khẩu**.
  - Tài khoản *tên đăng nhập* mà học viên đã tự đổi rồi quên mật khẩu: **không khôi phục được** → tạo tài khoản mới.
  - **Đổi email của tài khoản không làm được** → tạo tài khoản mới và xóa hồ sơ cũ.
  - **Xóa hồ sơ** chỉ xóa dữ liệu trong Firestore; tài khoản đăng nhập vẫn còn trong Firebase → xóa tay ở *Authentication → Users*.
- Đăng nhập Google bằng cửa sổ bật lên đôi khi bị chặn trong trình duyệt tích hợp của Zalo/Facebook/Messenger; hãy mở bằng Chrome/Safari.

**Gói miễn phí Firebase (Spark) — số liệu có thể thay đổi, hãy kiểm tra trang giá của Firebase**
- Khoảng 50.000 lượt đọc và 20.000 lượt ghi mỗi ngày, 1 GB lưu trữ. Mỗi lần học viên chọn đáp án là 1 lượt ghi (để lưu tiến trình và cho admin xem thời gian thực).
- Ước lượng: lớp 30–50 học viên, mỗi người làm vài đề/ngày thì còn rất dư. Nhiều trăm học viên làm cùng lúc có thể chạm trần ngày.
- Mỗi đề lưu trong **một tài liệu tối đa ~1 MB** (khoảng 1.000–2.000 câu tùy độ dài). Đề lớn hơn hãy tách nhỏ.

**Trạng thái trực tuyến**
- Có độ trễ: máy học viên báo “còn hoạt động” mỗi 20 giây khi đang làm bài, mỗi 60 giây khi chỉ mở trang. Trang Học viên không tự cập nhật liên tục (để tiết kiệm lượt đọc) — bấm nút làm mới.
- Học viên đóng trình duyệt giữa chừng: bài vẫn lưu, hiện “ngoại tuyến”; khi họ quay lại thì làm tiếp được. Nếu quá giờ, bài tự nộp khi họ mở lại.

**Khác**
- Xuất Word tạo file **.doc** (định dạng HTML mà Word mở được; Word có thể hiện cảnh báo nhỏ). Nhập Word đọc **.docx** (qua thư viện mammoth) và đọc theo mẫu “Câu 1 / A. / Đáp án:”; bảng biểu, hình ảnh trong Word **không** được nhập.
- Đáp án được đảo thứ tự thì phần giải thích **không nên** viết kiểu “đáp án A đúng vì…”, hãy viết nội dung.
- Website cần mạng để tải thư viện (Firebase, KaTeX, Excel, Word) từ CDN.
- Sao lưu không gồm tài khoản đăng nhập và mật khẩu.

---

## 4. Những gì đã và chưa được kiểm tra

**Đã kiểm tra tự động (chạy được: `node tests/lib.test.mjs`)**: đọc/ghi câu hỏi từ Excel-JSON-văn bản Word (kể cả xuất rồi nhập lại), kiểm tra lỗi dữ liệu, trùng mã câu, đảo thứ tự, chấm điểm, quyền xem đề theo lớp/học viên/ẩn, lịch mở-đóng, số lần làm, thống kê (trung bình, phân bố, tỷ lệ đạt, xếp hạng, câu sai nhiều nhất), tên đăng nhập → email, định dạng ngày giờ; file `mau-de-thi.xlsx` đọc đúng. Toàn bộ file JS qua kiểm tra cú pháp; mọi import/export khớp nhau.

**CHƯA kiểm tra được (môi trường mình không có trình duyệt thật, không có mạng, không có Firebase của bạn):**
giao diện thực tế trên điện thoại/máy tính, đăng nhập thật (email, Google, khách), ghi/đọc Firestore thật, Firestore Rules, tải thư viện từ CDN, âm thanh, xuất/nhập file Excel-Word trong trình duyệt, đồng bộ thời gian thực. Rất có thể còn lỗi nhỏ ở những phần này — **hãy chạy bảng kiểm tra bên dưới ngay sau khi cài** và gửi lại cho mình thông báo lỗi (nhấn F12 → tab *Console*, chụp màn hình dòng chữ đỏ) để mình sửa.

### Bảng kiểm tra 15 phút sau khi cài
1. Mở web: thấy màn hình đăng nhập; bấm nút mặt trăng/mặt trời đổi sáng-tối.
2. Đăng ký → đặt `role=admin` → có mục Quản trị.
3. Tạo lớp, tạo tài khoản học viên bằng tên đăng nhập (vd `hs001`).
4. Tạo đề, nhập `mau-de-thi.xlsx`, kiểm tra công thức hiện đẹp, bấm **Xuất Excel** rồi nhập lại thử.
5. Giao đề cho lớp; đăng nhập `hs001` (cửa sổ ẩn danh/điện thoại) → thấy đề.
6. Làm thử đủ 3 dạng (đổi dạng ở tab Cài đặt); thử đánh dấu, nộp có câu chưa làm, hết giờ tự nộp (đặt 1 phút).
7. Trong lúc học viên làm: mở **Quản trị → Đang làm bài** thấy tiến độ cập nhật.
8. Bật “Khóa xem lại” → học viên chỉ xem điểm. Bật “Ẩn đề” → đề biến khỏi danh sách nhưng lịch sử còn.
9. **Sao lưu** tải file, thử **Khôi phục**.

---

## 5. Đề xuất bổ sung (chưa làm)
- Hình ảnh trong câu hỏi (cần Firebase Storage hoặc dán link ảnh).
- Nhiều đáp án đúng, câu điền khuyết, tự luận chấm tay.
- Ngân hàng câu hỏi và ra đề ngẫu nhiên từ nhiều chương.
- Thông báo (email/Zalo) khi giao đề mới.
- Chấm điểm phía máy chủ bằng Cloud Functions (cần gói Blaze) để chống gian lận thật.
- Xuất Word chuẩn .docx.

---

## 6. Cấu trúc thư mục
```
index.html          Trang duy nhất (nạp thư viện từ CDN)
css/style.css       Giao diện, màu sáng/tối
js/config.js        ← DÁN CẤU HÌNH FIREBASE VÀO ĐÂY
js/app.js           Khởi động, đăng nhập, điều hướng
js/auth.js          Đăng nhập / đăng ký / chờ duyệt
js/student.js       Trang chủ, bắt đầu làm đề, lịch sử, tài khoản
js/exam.js          Giao diện làm bài (3 dạng) + kết quả & xem lại
js/admin*.js        Quản trị: đề, lớp, học viên, thống kê, cài đặt, sao lưu
js/lib.js           Logic thuần (đã có test)
firestore.rules     Luật bảo mật Firestore (dán vào Firebase)
mau-de-thi.xlsx     File Excel mẫu
tests/              Kiểm thử tự động cho lib.js
```
