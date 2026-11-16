# README_DEPLOY — Đưa website đăng nhập lên Hostinger (fbads.digimar.site)

Website thật có đăng nhập cho lớp học Ads Manager: giáo viên cấp tài khoản
từng học viên, bài làm lưu theo tài khoản trên máy chủ. Bản mô phỏng không
kết nối Meta, không chạy quảng cáo thật (banner TEST ENVIRONMENT).

## 1. Công nghệ đã chọn (và vì sao)

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Hosting | Hostinger **Business** | Gói Business là gói shared thấp nhất hỗ trợ Node.js qua hPanel (Web Apps). Gói Premium không chạy được Node.js. |
| Runtime | **Node.js 24** (chọn trong hPanel) | `node:sqlite` có sẵn từ Node 22+ nên không cần gói CSDL native; Node 24 là bản Hostinger hỗ trợ (18/20/22/24). |
| Backend | **Express 4** + **bcryptjs** | Chỉ 2 dependency, toàn mã JS thuần — `npm install` chạy được trên shared hosting, không cần biên dịch native. |
| Cơ sở dữ liệu | **SQLite (file `data/app.db`)** qua `node:sqlite` | Không cần tạo database MySQL riêng, không cần mật khẩu DB; 1 file duy nhất, đã gitignore nên `git pull` khi deploy không xoá dữ liệu học viên. |
| Phiên đăng nhập | Token ngẫu nhiên trong cookie `httpOnly` | Mật khẩu lưu dạng hash bcrypt (không lưu plaintext). |

Tài liệu tham khảo: Hostinger hỗ trợ Node.js trên gói Business/Unlimited qua
hPanel → Web Apps (deploy từ GitHub, tự deploy lại khi push), Node 18/20/22/24,
mỗi gói Business tối đa 5 website Node.js.

## 2. Cấu trúc thư mục (trong repo GitHub, nhánh main)

```
ads-manager-training-simulator/          (repo — giữ nguyên các file tĩnh cũ ở root)
├── index.html, README.md, CHANGELOG.md  (bản tĩnh v1.2.0 — vẫn đang chạy trên fbads.digimar.site)
└── website-login/                        (WEBSITE ĐĂNG NHẬP v2.0.0 — app Node.js)
    ├── package.json                      (start: node server.js; engines: node >= 22)
    ├── server.js                         (Express + toàn bộ API)
    ├── src/
    │   ├── db.js                         (SQLite: schema 10 bảng)
    │   └── auth.js                       (bcrypt, session, phân quyền)
    ├── public/
    │   ├── login.html                    (màn hình đăng nhập + thiết lập lần đầu)
    │   ├── admin.html                    (trang Quản trị của giáo viên)
    │   └── app/
    │       ├── index.html                (bản mô phỏng — TẠO RA bởi script patch, đừng sửa tay)
    │       └── bridge.js                 (nối bản mô phỏng với API máy chủ)
    ├── scripts/
    │   ├── apply_frontend_patch.py       (tái tạo public/app/index.html từ file export mới)
    │   └── test_api.py                   (bộ kiểm thử API 53 mục)
    ├── data/                             (file app.db — gitignore, chỉ có trên máy chủ)
    ├── .gitignore, .env.example
    ├── README_DEPLOY.md                  (file này)
    └── CHANGELOG.md                      (log cập nhật chi tiết v2.0.0)
```

## 3. Các bước deploy (làm theo thứ tự)

### Bước 0 — Sao lưu (bắt buộc trước khi đổi)
- Bản tĩnh đang chạy không có dữ liệu học viên nên không có gì để sao lưu.
- Nhưng hãy tải file sao lưu JSON trong trang Quản trị **sau khi** website mới
  chạy và đã có học viên làm bài — trước mỗi lần deploy lớn về sau.

### Bước 1 — Đẩy code lên GitHub
```bash
git add website-login
git commit -m "v2.0.0: Website đăng nhập (Node.js + SQLite) — 16/11/2026"
git push origin main
```
(Không đẩy `node_modules/` và `data/` — đã gitignore.)

### Bước 2 — Tạo Web App mới trong hPanel (QUAN TRỌNG: đọc kỹ)
Node.js trên Hostinger chạy dưới dạng **Web App — một website riêng**, khác với
Git Deployment tĩnh đang chạy cho fbads.digimar.site. Một subdomain chỉ gắn
được với **một** website tại một thời điểm, nên cần tách 2 việc:

**2a. Tạo Web App thử trên tên miền tạm trước (khuyên làm):**
1. hPanel → Websites → Add Website → **Deploy Web App** (hoặc mục Node.js/Web Apps).
2. Chọn **Connect with GitHub** → chọn repo `embevietquat19/ads-manager-training-simulator`, nhánh `main`.
3. Cấu hình app:
   - **Application root / Root directory:** `website-login`
   - **Node.js version:** 24 (nếu không có 24 thì chọn 22 — app cần Node ≥ 22 vì dùng `node:sqlite`)
   - **Install command:** `npm install` (mặc định)
   - **Start command:** `npm start`
   - **Domain:** để tên miền tạm Hostinger cấp (ví dụ `xxx.hostingersite.com`) để test trước.
4. Biến môi trường (Environment variables):
   - `NODE_ENV=production`
   - `DATA_DIR=` — nên đặt **ngoài thư mục repo** để dữ liệu an toàn tuyệt đối,
     ví dụ `/home/u215032752/fbads-data` (xem đúng đường dẫn home của bạn trong
     hPanel → File Manager; thư mục này phải tự tạo trước trong File Manager).
     Nếu để trống, app dùng `website-login/data/` (vẫn an toàn qua các lần
     git pull vì file đã gitignore, chỉ mất khi xoá tay hoặc deploy kiểu
     clone mới toàn bộ).
5. Bấm Deploy, chờ báo thành công, mở tên miền tạm để test (mục 4 bên dưới).

**2b. Chuyển subdomain fbads.digimar.site sang Web App (khi đã test xong):**
1. Trong hPanel, gỡ subdomain `fbads.digimar.site` khỏi website tĩnh cũ
   (website Git Deployment hiện tại) — hoặc xoá website tĩnh đó sau khi đã
   chắc Web App chạy tốt. (Website tĩnh cũ không còn cần thiết sau bước này;
   file tĩnh ở root repo vẫn còn trong git để tham khảo.)
2. Gắn `fbads.digimar.site` cho Web App (trong phần Domains/Website của app).
3. Bật SSL (Let's Encrypt) cho subdomain nếu chưa bật — cookie phiên đăng
   nhập ở chế độ production yêu cầu HTTPS.
4. Mở https://fbads.digimar.site kiểm tra lại toàn bộ (mục 4).

> Nếu hPanel không cho đặt Application root là thư mục con `website-login`:
> phương án dự phòng là chuyển toàn bộ nội dung `website-login/` lên root repo
> (server.js, package.json, public/, src/, scripts/…) rồi deploy lại với
> Application root là `/`. Khi đó nhớ cập nhật `scripts/apply_frontend_patch.py`
> (đường dẫn DEFAULT_SRC) cho khớp.

### Bước 3 — Thiết lập lần đầu trên website mới
1. Mở website → màn hình **đăng nhập** hiện đầu tiên (chưa đăng nhập không xem
   được nội dung nào).
2. Vì chưa có tài khoản giáo viên, bấm dòng **“Thiết lập lần đầu”** trong form
   đăng nhập → đặt tên đăng nhập quản trị (mặc định `giaovien`) + mật khẩu
   quản trị (tự đặt, không có mật khẩu mặc định) → tài khoản giáo viên được tạo.
3. Đăng nhập bằng tài khoản giáo viên → vào **trang Quản trị** → tạo tài khoản
   cho từng học viên (tên đăng nhập, mật khẩu, tên hiển thị) và gửi cho học viên.
4. Học viên mở website, đăng nhập bằng tài khoản được cấp → vào bản mô phỏng.

## 4. Kiểm tra sau deploy (checklist)

- [ ] Mở trang khi **chưa đăng nhập** → chỉ thấy màn hình đăng nhập (không thấy
      nội dung mô phỏng).
- [ ] Thiết lập tài khoản giáo viên lần đầu thành công; đăng nhập vào được
      trang Quản trị.
- [ ] Tạo 1 tài khoản học viên thử → đăng nhập học viên → thấy đủ: topbar,
      banner TEST ENVIRONMENT, bảng 21 campaign, tab Tối ưu & Đề xuất (19 khối),
      15 case, 3 brief, thuật ngữ.
- [ ] Học viên chỉnh 1 case (kéo thanh trượt) → đăng xuất → đăng nhập lại
      (hoặc mở bằng máy khác) → số liệu vẫn còn (lưu theo tài khoản).
- [ ] Học viên mở 1 case → bấm “Xem đáp án gợi ý” → giáo viên vào Quản trị →
      “Xem bài làm” thấy case đó có cờ “Đã xem đáp án”.
- [ ] Học viên vào editor → Publish (mô phỏng) 1 chiến dịch → giáo viên thấy
      chiến dịch đó trong “Xem bài làm”.
- [ ] Giáo viên đăng 1 thông báo → học viên thấy chuông có số chưa đọc + thanh
      thông báo trên màn hình chính.
- [ ] Học viên bấm nút “Xuất file Word” ở 1 chiến dịch → tải được file .docx.
- [ ] Tắt trình duyệt, mở lại: phiên đăng nhập còn (30 ngày) hoặc yêu cầu đăng
      nhập lại — đều chấp nhận được.

## 5. Cập nhật sau này

- **Sửa code / tính năng đăng nhập:** sửa trong `website-login/`, push lên
  GitHub → Hostinger tự deploy lại (nếu bật auto-deploy cho Web App).
  Dữ liệu học viên không bị ảnh hưởng (file DB đã gitignore / nằm ngoài repo).
- **Có file export mô phỏng mới (nội dung Tối ưu & Đề xuất, case… đổi):**
  1. Chép file export mới vào
     `ads-manager-training-simulator/ads-manager-training-simulator.html`
     (ghi đè file cũ).
  2. Chạy: `python3 website-login/scripts/apply_frontend_patch.py`
     (script tự kiểm tra 25 patch; nếu báo lỗi khớp mẫu thì dừng — không ghi
     file nửa vời — và cần xem lại vì file export đổi cấu trúc).
  3. Commit `website-login/public/app/index.html` rồi push → deploy lại.
- **Đổi mật khẩu giáo viên:** từ v2.0.1, giáo viên tự đổi trong trang Quản
  trị (mục “Đổi mật khẩu quản trị”): nhập mật khẩu hiện tại + mật khẩu mới,
  đổi xong sẽ đăng xuất khỏi mọi thiết bị và đăng nhập lại bằng mật khẩu mới.
  Nên đặt mật khẩu mạnh (≥ 8 ký tự, gồm chữ và số) và ghi nhớ ngay từ đầu.

## 6. Bảo mật & vận hành

- Mật khẩu lưu dạng **hash bcrypt** (không lưu plaintext), phiên đăng nhập bằng
  cookie `httpOnly` + `SameSite=Lax` (+ `Secure` khi production/HTTPS).
- Học viên **không gọi được** API quản trị (403); tài khoản bị vô hiệu hoá
  không đăng nhập được và mọi phiên cũ bị huỷ ngay; đăng nhập sai 5 lần / 10
  phút / IP thì bị chặn tạm thời (429).
- API thay đổi dữ liệu kiểm tra Origin cùng host (chống CSRF cơ bản).
- **Sao lưu:** nút “Tải file sao lưu (.json)” trong trang Quản trị → tải toàn
  bộ bài làm + thông báo. Nên tải trước mỗi lần deploy lớn. File DB SQLite
  (`data/app.db` hoặc `DATA_DIR`) cũng có thể tải về qua File Manager.
- **Giới hạn gói Business:** tối đa 5 website Node.js; tổng số process của gói
  là 120 — app này chỉ dùng 1 process Node nên thoải mái cho lớp học.

## 7. Xử lý sự cố

| Triệu chứng | Cách kiểm tra / sửa |
|---|---|
| Web App báo lỗi khi deploy | Xem log trong hPanel → Web App → Logs. Lỗi thường gặp: sai Node version (cần ≥ 22), sai Application root, thiếu `npm install`. |
| Mở trang báo 502 / Application error | App chưa chạy: kiểm tra Start command là `npm start`, cổng dùng `process.env.PORT` (app đã làm đúng), xem log. |
| Mở trang thấy màn hình trắng / lỗi JS | Kiểm tra `public/app/index.html` đã được tạo bởi script patch chưa; kiểm tra file `bridge.js` có được deploy không. |
| Đăng nhập xong bị văng về trang đăng nhập | Cookie `Secure` yêu cầu HTTPS — kiểm tra SSL đã bật cho subdomain chưa; kiểm tra trình duyệt có chặn cookie bên thứ ba không (app dùng cookie cùng domain nên bình thường không bị). |
| Dữ liệu học viên biến mất sau deploy | Kiểm tra `DATA_DIR` có trỏ đúng thư mục chứa `app.db` cũ không; nếu dùng `data/` mặc định, kiểm tra file còn trong File Manager không. Khôi phục từ file sao lưu JSON (hiện chỉ dùng để đối chiếu tay — chưa có nút nhập lại tự động). |
| Quên mật khẩu giáo viên | Chưa có chức năng tự đặt lại qua giao diện. Cách xử lý: SSH/File Manager xoá bản ghi giáo viên trong DB rồi thiết lập lại lần đầu (cần hướng dẫn riêng), hoặc nhờ người có quyền DB đặt lại hash. **Ghi nhớ mật khẩu quản trị.** |

## 8. Chạy local (để test trước khi deploy)

```bash
cd website-login
npm install
npm start          # mở http://localhost:3000
# Kiểm thử API đầy đủ (cần server đang chạy):
python3 scripts/test_api.py http://localhost:3000
```
