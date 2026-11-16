# Changelog — Ads Manager Training Simulator (website có đăng nhập)

> Bản này (v2.0.0) là **website thật có đăng nhập** chạy trên Hostinger tại
> https://fbads.digimar.site — thay cho bản tĩnh 1 file HTML trước đây.
> Mở trang là màn hình đăng nhập; giáo viên cấp tài khoản từng học viên;
> bài làm lưu riêng theo tài khoản trên máy chủ, đổi máy vẫn còn.
> Toàn bộ nội dung học tập của bản tĩnh v1.2.0 được giữ nguyên (xem mục v1.2.0
> và v1.1.0 bên dưới). Bản mô phỏng không kết nối Meta, không chạy quảng cáo
> thật (banner TEST ENVIRONMENT).

---

## v2.0.4 — 16/11/2026 (luồng nộp bài case — đã deploy 10:31)

- **Nộp bài case:** học viên chỉnh case trong editor 3 bước rồi bấm "Nộp
  bài" (hoặc bấm "Nộp bài" ngay trên trang case — nộp theo setup đang chạy
  của case + số liệu slider hiện tại) → hiện đáp án gợi ý của giảng viên
  kèm bảng đối chiếu 5 mục (Objective / Budget / Audience / Placements /
  Ad creative) so sánh bài làm với gợi ý, ghi rõ đúng bao nhiêu mục và
  thiếu/khác gì ở từng mục. Nộp lại thay bài cũ (chỉ giữ bài nộp gần nhất
  mỗi case).
- **Máy chủ (mới):** bảng `submissions` (1 dòng JSON theo tài khoản, theo
  mẫu bảng `audiences`); `PUT /api/submissions` (đăng nhập + `sameOrigin`,
  validate qua `parseSubmissions`: body là object, tối đa 15 case
  case1–case15, mỗi entry có `caseId` khớp key và `submittedAt` là chuỗi —
  sai → 400, chưa đăng nhập → 401; server chỉ lưu nguyên object bài nộp,
  không chấm lại vì `result` đã tính sẵn ở client); `GET /api/bootstrap`
  trả thêm `submissions`; endpoint admin `GET /api/admin/students/:id/work`
  trả thêm `submissions` (+ `submissionsCount` trong tổng quan học viên)
  để giáo viên xem bài nộp — học viên gọi API admin vẫn 403.
- **Cầu nối:** `bridge.js` thêm `srv.submissions` + `__srvSaveSubmissions(caseId, sub)`
  (debounce 600ms, theo đúng mẫu `__srvSaveAudiences`, kể cả cơ chế giữ bản
  chờ `pendingSubmissions` khi nộp trước khi bootstrap xong rồi gộp khi
  bootstrap xong — bản chờ thắng theo từng case); patch script thêm P23
  thay thân `subLoad()`/`subSave()` trong file tĩnh bằng bản đọc/ghi qua
  `window.__srv.submissions` / `window.__srvSaveSubmissions` (giữ nguyên
  tên + chữ ký), kèm patch dòng ghi chú trong khối comment v2.0.4 — sau
  patch không còn chuỗi `localStorage` nào trong `public/app/index.html`.
- **Trang Quản trị:** panel "Xem bài làm" hiện thêm mục "Bài đã nộp": mỗi
  case 1 dòng (tên case, thời gian nộp `submittedAtVN`, mục tiêu, ngân
  sách, số mục đối chiếu đúng `okCount/total`) + chi tiết đầy đủ trong
  `<details>`, cùng cấu trúc với các mục bài làm sẵn có.
- **Kiểm thử:** `scripts/test_api.py` thêm mục 18 (401 chưa đăng nhập; 400
  khi body không phải object / caseId ngoài case1–case15 / caseId không
  khớp key / thiếu `submittedAt` / quá 15 case; lưu rồi bootstrap thấy đủ;
  2 học viên không thấy bài nộp của nhau; nộp lại thay bản cũ; học viên
  gọi API admin → 403; giáo viên xem bài làm thấy bài nộp) — toàn bộ
  suite pass (95 cũ + 14 mới = 109). Probe API end-to-end và probe jsdom
  `subLoad`/`subSave` đã patch đều đạt (xem báo cáo bàn giao). **Chưa
  deploy lên fbads.digimar.site.**

---

## v2.0.3 — 16/11/2026 (sửa các chức năng chưa chạy + Customise columns + nhật ký cập nhật)

- **Nhóm 1 — các trường nhập trong editor nay lưu thật vào bản nháp** (dùng
  cơ chế `draftSet` sẵn có; bản login lưu theo tài khoản qua
  `__srvSaveDraft`): tên Campaign/Ad set/Ad, Primary text / Headline /
  Description (headline cập nhật live preview cả tab Feed lẫn tab Search),
  Conversion location + Performance goal + "Customer life cycle strategy" ở
  bước Ad set, Buying type + Category ở bước Campaign, Welcome message +
  Suggested questions, Destination (7 radio), Partnership ad +
  Multi-advertiser ads + công tắc On/Off trong editor. **Giá thầu mở theo
  chiến lược:** chọn "Cost per result goal" → mở ô cost-per-result, "Bid
  cap"/"Other options" → mở ô Bid control, "Cost per 1,000 people reached"
  → mở ô cost per unit of incremental reach; giá trị nhập lưu vào nháp;
  hint viết lại cho đúng thực tế. **Logo topbar:** bấm logo Meta hoặc chữ
  "Ads Manager" gọi `goHome()` — đóng mọi lớp đang mở (tool page, editor,
  case view, trang Tối ưu, Insights, dialog...) rồi về đúng bảng Campaigns.
- **Nhóm 2 — các nút báo thành công giả nay làm thật** (cơ chế lưu chung mới
  `sim-row-state-v1`: bản tĩnh localStorage, bản login bảng `row_state` +
  `PUT /api/row-state`): Duplicate nhân bản thật (tên "Copy of …", trạng
  thái nháp, số dòng tăng); Name editor đổi tên thật của dòng đang chọn;
  Publish trong editor (bản tĩnh) thêm chiến dịch Active vào bảng như bản
  login; Discard Drafts **chỉ xoá nháp do học viên tạo** (sau hộp xác nhận),
  không bao giờ đụng 6 nháp mẫu và 15 campaign case, không có nháp thì báo
  rõ; Media picker Select gắn media mẫu vào preview và lưu vào nháp; công
  tắc On/Off từng dòng lưu trạng thái `active`; Export tải file CSV thật
  của bảng đang hiển thị (đúng cột/bộ lọc đang chọn); Publish/Delete trên
  bảng làm thật — **campaign bài tập được bảo vệ, không xoá** (chọn cách
  chặn kèm giải thích để nút "Mở campaign đang chạy" trong case không mất
  đích). Tab Review nay đọc tên/Partnership/Multi-advertiser từ draft.
- **Trang Quản trị:** form tạo học viên thêm `autocomplete="off"` /
  `autocomplete="new-password"` (trình duyệt không còn tự điền tài khoản
  giáo viên — chính là nguyên nhân tạo ra tài khoản lạ "hocvien" trước
  đây); banner tạo tài khoản chỉ hiện 1 lần rồi tự ẩn sau 12 giây và ẩn
  khi tải lại trang (nguyên nhân bám dai là bfcache khôi phục DOM); bảng
  học viên đủ rộng (cuộn ngang, `white-space:nowrap` cho pill và tiêu đề
  cột). Mục "Đổi mật khẩu quản trị" đã xác nhận có trên site live (v2.0.1)
  nên không sửa gì thêm.
- **Mô phỏng:** mô tả Opportunity score không còn bị cắt giữa chữ; ô
  Budget trên bảng xuống dòng gọn trong ô, hàng tiêu đề gọn hơn; editor mở
  campaign của Case 1 đúng số liệu/tên/nội dung của case (ngân sách
  ₫400.000/ngày, tên ad set/ad, primary text, headline) — sửa chung cơ
  chế nên cả 15 case đều mở đúng; avatar topbar lấy chữ viết tắt từ tên
  tài khoản đang đăng nhập (học viên "Học sinh Test" hiện "HT", không còn
  "GV" hardcode); ô đăng nhập không còn kẹt giá trị đã điền sẵn (bỏ
  `value="giaovien"` ở form thiết lập lần đầu, thêm `name` cho form đăng
  nhập). Chuông học viên hiện "Chưa có thông báo nào." là đúng vì không có
  seed thông báo chào mừng nào trong code (thông báo chào mừng ngày 15/11
  là tạo tay qua Admin); khối 19 Tối ưu thiếu tiêu đề con "Vì sao…" là cố
  ý nên để nguyên.
- **Thông báo thành nhật ký cập nhật:** mảng `CHANGELOG_DATA` trong file
  tĩnh (v2.0.0 01:23, v2.0.1 07:30, v2.0.2 08:54 ngày 16/11/2026, v2.0.3
  — giờ deploy điền sau); chuông hiện 2 mục riêng: "Thông báo của giảng
  viên" (giáo viên vẫn đăng/sửa/xoá từ Quản trị) và "Nhật ký cập nhật hệ
  thống" (chỉ đọc); số chưa đọc tính cả phiên bản mới chưa xem, lưu
  "phiên bản đã xem gần nhất" theo tài khoản (bảng `seen_version` +
  `PUT /api/seen-version`) / theo trình duyệt (bản tĩnh). Trang Quản trị
  thêm mục nhật ký cập nhật chỉ đọc.
- **Thuật ngữ:** thêm bảng "Tổng hợp công thức KPI hay dùng" (12 dòng:
  CPM, CTR link/all, CPC, Cost per result, CPL, CPA, Cost per message,
  ROAS, Conversion rate, Frequency, Reach vs Impressions, CPA hoà vốn),
  mỗi dòng có công thức, cách đọc và ví dụ số lấy từ case trong bản mô
  phỏng (ghi rõ case; số minh họa ghi rõ); ngưỡng tham khảo chỉ dùng
  ngưỡng đã có trong mục Tối ưu & Đề xuất; ghi chú ROAS chưa trừ 10% VAT
  + ~1,1% phí ngân hàng, chi phí thực ≈111% (Case 4).
- **Customise columns làm thật:** dialog liệt kê đủ 33 cột, tick chọn/bỏ,
  kéo thả (hoặc bấm ↑ ↓) sắp xếp, Apply render lại bảng đúng cột và thứ
  tự; "Save as preset" lưu preset riêng (chặn trùng tên, dùng lại được
  trong menu Columns); preset lưu theo tài khoản (bảng `col_state` +
  `PUT /api/col-state`) / theo trình duyệt (bản tĩnh). "View your column
  presets" liệt kê và xoá preset riêng; "Discover more column presets"
  mở dialog Customise; "Compare attribution settings" đổi Attribution
  setting hiển thị trên bảng (số liệu mẫu cố định nên chỉ đổi nhãn cột,
  không tính lại chỉ số — đã ghi rõ trong dialog); "Conditional
  formatting" tô màu ô thật theo ngưỡng tự đặt (lưu lại và xoá được).
  Không còn toast giả nào trong menu Columns.
- API mới `PUT /api/row-state`, `PUT /api/seen-version`,
  `PUT /api/col-state` (chỉ tài khoản đã đăng nhập; validate như
  `parseAudiences`: giới hạn số mục/kích thước JSON, sai → 400, chưa đăng
  nhập → 401); `GET /api/bootstrap` trả thêm `rowState`, `seenVersion`,
  `colState`. Bảng mới `row_state`, `seen_version`, `col_state` trong
  SQLite. Patch script thêm P16–P22 (không đổi chuỗi neo cũ).
- Bộ kiểm thử API `scripts/test_api.py`: **95/95 mục đạt** (70 cũ vẫn đạt
  + 13 mục mới row-state/seen-version + 12 mục mới col-state). Probe
  jsdom: Nhóm 1: 84/84 + logo 22/22; Nhóm 2 + UI + changelog + KPI:
  101/101; Customise columns: 35/35 (bản tĩnh) + 9/9 (bản login đã patch);
  hồi quy Nhóm 1+2 trên file cuối: 101/101. Hạn chế đã biết: mục Opportunity
  score (CSS) và hiệu ứng cắt chữ chỉ kiểm chứng được bằng mắt trên Chrome
  thật sau deploy (jsdom không có layout); đổi Attribution setting chỉ đổi
  nhãn cột vì số liệu mẫu cố định.
- **Đã deploy:** 10:00 ngày 16/11/2026 — đã push lên GitHub, Hostinger tự
  cập nhật site fbads.digimar.site; giờ deploy thật đã điền vào mục v2.0.3
  trong `CHANGELOG_DATA` (file tĩnh) và mục nhật ký cập nhật ở trang Quản trị.

## v2.0.2 — 16/11/2026 (Audiences: Custom Audience + Lookalike, lưu theo tài khoản)

- **Trang Audiences trong bản mô phỏng nay lưu theo tài khoản trên máy chủ:**
  học viên tạo **Custom Audience** (tải file CSV/TXT danh sách khách hàng,
  map cột Email/Số điện thoại/Tên/Họ, hoặc tạo tệp mẫu từ nguồn mô phỏng
  Website/Video/Lead form/Page) và **Lookalike** (chọn tệp nguồn, kéo 1–10%,
  ước lượng theo 98.000.000 × % đã chọn); danh sách tệp hiện ở trang
  Audiences và gắn được vào 2 dropdown Include/Exclude ở bước Ad set.
  Chỉ metadata của tệp được lưu (id, tên, loại, nguồn, cột đã map, số dòng,
  ngày tạo, % Lookalike); nội dung file upload chỉ đọc và parse trên trình
  duyệt, không bao giờ rời máy học viên.
- API mới `PUT /api/audiences` (chỉ tài khoản đã đăng nhập): validate body
  `audiences` phải là mảng tối đa 50 tệp, mỗi tệp chỉ gồm key metadata cho
  phép, `name` ≤ 200 ký tự, `type` thuộc `custom`/`lookalike` (sai → 400,
  chưa đăng nhập → 401); `GET /api/bootstrap` trả thêm `audiences` của tài
  khoản đó (mặc định `[]`). Bảng mới `audiences` trong SQLite, theo mẫu
  `editor_draft` (1 dòng JSON theo user, xoá theo user).
- **Chống mất dữ liệu khi tạo tệp trước khi bootstrap xong:** bridge chỉ PUT
  sau khi bootstrap đã nạp xong; bản lưu nào tới sớm được giữ lại, gộp vào
  danh sách máy chủ (trùng id thì bản mới thắng) rồi mới đẩy lên — tệp tạo
  sớm không bị mất và không xoá mất tệp cũ.
- Bộ kiểm thử API `scripts/test_api.py`: **70/70 mục đạt** (59 cũ vẫn đạt +
  11 mục mới: chưa đăng nhập → 401, body không phải mảng → 400, type sai →
  400, key lạ → 400, tên quá dài → 400, quá 50 tệp → 400, lưu 1 Custom +
  1 Lookalike rồi đọc lại qua bootstrap, 2 học viên không thấy tệp của nhau,
  lưu mảng rỗng xoá hết).
- **Chưa deploy:** bản này mới chỉ chạy kiểm thử local — cần push lên GitHub
  để Hostinger tự deploy lại thì tính năng mới lên được fbads.digimar.site.

## v2.0.1 — 16/11/2026 (giáo viên tự đổi mật khẩu quản trị)

- **Trang Quản trị có thêm mục “Đổi mật khẩu quản trị”:** giáo viên nhập mật
  khẩu hiện tại + mật khẩu mới (≥ 6 ký tự, khác mật khẩu cũ) để đổi; đổi xong
  sẽ đăng xuất khỏi mọi thiết bị và đăng nhập lại bằng mật khẩu mới.
- API mới `POST /api/teacher/change-password` (chỉ giáo viên, kiểm tra mật
  khẩu hiện tại bằng bcrypt, đổi xong huỷ mọi phiên của giáo viên).
- Bộ kiểm thử API `scripts/test_api.py`: **59/59 mục đạt** (thêm 6 mục cho
  tính năng này: học viên bị chặn 403, mật khẩu hiện tại sai, mật khẩu mới
  trùng cũ, đổi thành công, mật khẩu cũ không vào được, mật khẩu mới vào
  được).
- **Chưa deploy:** bản này mới chỉ chạy kiểm thử local — cần push lên GitHub
  để Hostinger tự deploy lại thì tính năng mới lên được fbads.digimar.site.

## v2.0.0 — 16/11/2026 (website đăng nhập — Node.js + Express + SQLite)

### Công nghệ
- Backend **Node.js 24 + Express 4** (chỉ 2 dependency: `express`, `bcryptjs` —
  toàn mã JS thuần, `npm install` chạy được trên Hostinger Business).
- Cơ sở dữ liệu **SQLite (file)** qua `node:sqlite` có sẵn trong Node 22+ —
  không cần tạo database MySQL riêng; file DB đã gitignore nên deploy bằng
  git pull không xoá dữ liệu học viên.
- Chạy trên Hostinger gói **Business** qua hPanel → Web Apps (deploy từ GitHub,
  tự deploy lại khi push). Xem `README_DEPLOY.md` để biết từng bước.

### Đăng nhập & tài khoản
- Mở trang là **màn hình đăng nhập** hiện đầu tiên; chưa đăng nhập thì không
  xem được bất kỳ nội dung nào (trang mô phỏng và trang quản trị đều chặn).
- **Thiết lập lần đầu:** khi chưa có tài khoản giáo viên, form đăng nhập hiện
  lối “Thiết lập lần đầu” để giáo viên tự đặt tên đăng nhập + mật khẩu quản trị
  — **không có mật khẩu mặc định**. Sau khi thiết lập, lối này biến mất.
- **Giáo viên** đăng nhập vào **trang Quản trị** (`/admin`):
  - Tạo tài khoản học viên (tên đăng nhập, mật khẩu, tên hiển thị).
  - Đặt lại mật khẩu học viên (đồng thời đăng xuất học viên đó khỏi mọi thiết bị).
  - Vô hiệu hoá / kích hoạt lại tài khoản học viên (vô hiệu hoá thì học viên
    không đăng nhập được và mọi phiên cũ bị huỷ ngay).
  - Thẻ “Tổng quan dữ liệu lớp học”: số học viên, tổng case đã làm, đáp án đã
    xem, chiến dịch học viên đã tạo.
  - Nút “Xem bài làm” ở từng học viên: chi tiết số liệu từng case, đáp án đã
    xem, ghi chú, campaign đã sửa tên/ngân sách, chiến dịch nháp đã Publish,
    bản nháp editor đang làm dở.
  - Đăng / sửa / xoá **thông báo của giảng viên**.
  - Tải file sao lưu JSON toàn bộ dữ liệu lớp học.
- **Học viên** đăng nhập bằng tài khoản giáo viên cấp:
  - Thấy chung một tệp dữ liệu gốc như mọi người (6 chiến dịch nháp mẫu,
    15 case bài tập, 19 khối Tối ưu & Đề xuất, 3 brief, thuật ngữ).
  - Mọi bài làm lưu riêng theo tài khoản trên máy chủ, đổi máy vẫn còn:
    số liệu đã chỉnh trong từng case, đáp án đã xem, ghi chú trong case,
    tên/ngân sách đã sửa ở campaign của case, bản nháp trình chỉnh sửa đang
    làm dở, chiến dịch đã Publish (mô phỏng).
  - Học viên **không xem được** bài làm của học viên khác và **không gọi được**
    bất kỳ API quản trị nào (trả 403).

### Bài làm lưu theo tài khoản — chi tiết từng chỗ
- **Case tình huống:** kéo thanh trượt chỉnh số → kết quả tính lại ngay và
  lưu lên máy chủ (không còn localStorage); mở lại trên máy khác vẫn thấy số
  của mình. Nút “Khôi phục dữ liệu gốc” khôi phục số gốc và lưu lên máy chủ.
- **Đáp án gợi ý:** bấm “Xem đáp án gợi ý” thì máy chủ ghi nhận “đã xem đáp
  án” cho case đó; giáo viên nhìn thấy cờ này trong “Xem bài làm”.
- **Ghi chú trong case (mới):** mỗi case có thêm ô “Ghi chú của bạn” để học
  viên ghi lại nhận xét/phương án; lưu theo tài khoản, giáo viên xem được.
- **Campaign đang chạy của case:** bấm “Mở campaign đang chạy” mở editor 3
  bước với cấu hình case điền sẵn; tên campaign và ngân sách học viên sửa
  trong đó được lưu riêng theo tài khoản.
- **Trình chỉnh sửa (editor 3 bước):** mọi lựa chọn ở bước Ad set và Ad
  (Advantage+ ↔ setup thường, đối tượng, vị trí, ngân sách, creative…) được
  lưu nháp theo tài khoản; đang làm dở thì lần sau mở lại vẫn còn.
- **Publish (mô phỏng):** bấm Publish ở bước cuối thì chiến dịch được lưu
  thành “chiến dịch nháp” theo tài khoản, hiện thêm 1 dòng “Nháp của bạn”
  trong bảng Campaigns (bấm tên để mở lại trong editor chỉnh tiếp; nút
  “Xuất file Word” ở dòng đó xuất đúng setup đã lưu). Giáo viên xem được
  toàn bộ chiến dịch nháp trong “Xem bài làm”.
- **Thông báo:** giáo viên đăng/sửa/xoá; học viên thấy thanh thông báo mới
  trên màn hình chính sau khi đăng nhập và chuông có số chưa đọc; mở danh
  sách thông báo thì đánh dấu đã đọc.

### Bảo mật
- Mật khẩu lưu dạng **hash bcrypt** (không lưu plaintext).
- Phiên đăng nhập bằng token ngẫu nhiên trong cookie `httpOnly`,
  `SameSite=Lax` (+ `Secure` khi chạy production/HTTPS), hạn 30 ngày.
- Mọi API đều kiểm tra phiên; API quản trị kiểm tra vai trò giáo viên;
  mọi dữ liệu học viên đều lấy theo `user_id` từ phiên (không lấy từ tham
  số client gửi lên).
- Đăng nhập sai 5 lần / 10 phút / IP thì bị chặn tạm thời (mã 429).
- API thay đổi dữ liệu kiểm tra Origin cùng host (chống CSRF cơ bản).
- **Đổi mật khẩu giáo viên:** từ v2.0.1, giáo viên tự đổi được trong trang
  Quản trị (mục “Đổi mật khẩu quản trị”) — xem mục v2.0.1 ở trên.

### Kiểm thử (chạy local ngày 16/11/2026)
- Bộ kiểm thử API `scripts/test_api.py`: **59/59 mục đạt**, bao gồm:
  thiết lập lần đầu (và chặn thiết lập lần 2), tạo học viên, đăng nhập,
  lưu/đọc lại số liệu case + đáp án + ghi chú + override + bản nháp editor +
  chiến dịch Publish, giáo viên xem bài làm, học viên khác bị chặn 403 ở
  mọi API quản trị, thông báo + đánh dấu đã đọc, vô hiệu hoá/kích hoạt lại,
  đặt lại mật khẩu, phân quyền trang `/admin`, sao lưu JSON, giới hạn đăng
  nhập sai (429), giáo viên tự đổi mật khẩu quản trị.
- Cú pháp JavaScript đạt (`node --check`) cho server, `bridge.js` và cả 2
  script trong trang app đã patch.
- Mật khẩu trong DB đã kiểm tra: hash bcrypt `$2a$10$`, không có plaintext.
- **Chưa kiểm chứng trực quan:** bấm tay từng nút/công tắc trên trình duyệt
  (subagent không có trình duyệt thật) — cần giáo viên mở thử trên website
  sau deploy và báo lại nếu có chỗ lạ. Các luồng API phía dưới đã chạy thật
  đạt 59/59 (sau khi thêm tính năng đổi mật khẩu giáo viên ở v2.0.1).

### Nội dung học tập (giữ nguyên từ bản tĩnh v1.2.0)
- Mô phỏng Ads Manager: topbar, banner TEST ENVIRONMENT, thanh icon trái,
  3 tab Campaigns / Ad sets / Ads, 4 preset cột, hộp thoại Create (6 mục tiêu),
  trình chỉnh sửa 3 bước theo từng mục tiêu, 21 CTA, 3 bài tập brief, thuật ngữ.
- 19 khối **Tối ưu & Đề xuất** (đã mở rộng chi tiết ở v1.2.0 — xem dưới).
- 15 case tình huống thực tế, mỗi case có 1 chiến dịch Active tương ứng trong
  bảng Campaigns với nhãn “Bài tập”.
- Bước Ad set đầy đủ: Budget & schedule, Audience, Placements, Optimisation &
  delivery; Advantage+ ↔ setup thường chuyển đổi thật ở mọi cấp; cây Browse
  Detailed targeting ~200 mục; bước Ad có Create new ad và Use existing post
  với 5 bài đăng demo; nút “Xuất file Word” (.docx) ở từng chiến dịch và
  trong editor.
- Thông tin liên hệ GV. Đỗ Quốc Việt — SĐT 0789111126 — Email vietdq.ncs@gmail.com.

---

## v1.2.0 — 16/11/2026 00:36 (+07:00) — bản tĩnh (nền tảng giao diện của v2.0.0)

- Mở rộng tab **“Tối ưu & Đề xuất”** (19 khối): khối 1–18 mỗi khối thêm 4 mục
  làm rõ — **“Vì sao nguyên tắc này đúng”**, **“Cách làm từng bước”**,
  **“Lỗi thường gặp”**, **“Liên hệ trong editor”** (chỉ rõ mục nào trong
  trình chỉnh sửa 3 bước áp dụng nguyên tắc đó); khối 19 giữ nguyên bảng tra
  nhanh Target theo ngành. Bỏ dòng meta-ghi-chú trong khối 5. Không thêm số
  liệu mới, không trích nguồn (giữ quy ước: không tên cộng đồng, không link,
  không tên tác giả/ngày đăng trong toàn bộ bản mô phỏng).
- 19 khối gồm: 1. Checklist setup tài khoản & chiến dịch; 2. Lên camp & test;
  3. Scale ngân sách; 4. Đánh giá & quyết định tắt/giữ; 5. Tối ưu nhân khẩu học
  & vị trí địa lý; 6. Checklist setup 2026; 7. Những sự thật cần nhớ về ads
  (chọn lọc); 8. Creative Audience Pairing (tính năng mới 2026); 9. Chạy sạch
  — đường dài mới bền; 10. AI trong chạy quảng cáo — dùng máy, nhưng người giữ
  tiền; 11. Chuẩn bị fanpage mới trước khi chạy quảng cáo; 12. Công thức ra
  trăm đơn mỗi ngày; 13. Quản lý ngân sách — test, scale và stop-loss; 14. 4
  nguyên tắc test quảng cáo; 15. Target nâng cao 2026 — tín hiệu mua, 3 giai
  đoạn khách và Lookalike; 16. Target đúng — nghĩ xem ai là người mua;
  17. Chiến dịch tin nhắn — người nhắn đầu tiên quyết định; 18. Google Ads 3
  giai đoạn cho thương mại điện tử; 19. Target theo ngành — bảng tra nhanh.

## v1.1.0 — 16/11/2026 00:12 (+07:00) — bản tĩnh
- Bổ sung đầy đủ setup cấp Ad set (bước 2 của editor 3 bước): Budget & schedule
  (ngân sách ngày/tổng, ngày + giờ bắt đầu, "Set an end date" cho ngày/giờ kết
  thúc, "Run ads on a schedule" theo khung giờ + ngày trong tuần); Audience
  (vị trí thêm/xoá từng dòng với Include/Exclude và bán kính 10–80 km, tuổi
  tối thiểu, ngôn ngữ, loại trừ custom audience; Advantage+ audience với tuổi
  từ–đến, giới tính, Detailed targeting dạng chip kèm Browse
  Demographics/Interests/Behaviours, thu hẹp AND, custom audience/Lookalike;
  Audience size ước lượng thay đổi theo lựa chọn); Placements (Advantage+
  placements hoặc Manual placements theo từng nền tảng Facebook/Instagram/
  Messenger/Audience Network/Threads & WhatsApp, tick từng bề mặt, chọn thiết
  bị và hệ điều hành, chỉ Wi-Fi); thẻ mới Optimisation & delivery (sự kiện tối
  ưu hoá theo từng mục tiêu, Dataset/Pixel, Cost controls, Attribution setting
  + Attribution model). Mọi trường kèm dòng giải thích tiếng Việt và tự lưu
  vào bản nháp.
- Tuỳ chọn Advantage+ ↔ setup thường chuyển đổi thật ở mọi cấp: Advantage+
  audience (bật: chế độ gợi ý; tắt: hiện đầy đủ trường manual), Advantage+
  placements (bật: chỉ xem trước, bị khoá; tắt: tick tay từng nền tảng/bề mặt),
  các công tắc Advantage+ sales/leads/app campaign, iOS 14+, Dynamic creative,
  Advantage+ catalogue ads, thẻ Advantage+ creative mới ở cấp quảng cáo
  (5 nâng cấp), hộp thoại chọn setup Recommended/Manual áp thật vào bản nháp;
  Estimated audience size tự tính lại theo chế độ.
- Cây Browse Detailed targeting đầy đủ đúng taxonomy Ads Manager: Demographics,
  Interests (9 nhóm), Behaviors — gần 200 mục con tick chọn được, kèm ô tìm
  kiếm, quy mô ước lượng từng mục, chọn xong thành chip trong ô targeting và
  tính vào Audience size.
- Nút "Xuất file Word" ở từng chiến dịch trong bảng Campaigns và trong editor
  3 bước: nhập họ tên học viên rồi tải thẳng file .docx chứa toàn bộ setup
  chiến dịch/nhóm quảng cáo/quảng cáo kèm ngày xuất.
- Bước Ad có đủ 2 lựa chọn Create new ad (thêm trường Headline, Description,
  CTA) và Use existing post với 5 bài đăng demo mẫu của Page — chọn bài nào
  nội dung bài đó điền vào quảng cáo và hiện trong Ad preview, chuyển đổi qua
  lại và lưu bản nháp.

## v1.0.0 — 15/11/2026 23:36 (+07:00) — bản tĩnh
- Bản đầu tiên: mô phỏng Facebook Ads Manager (3 tab Chiến dịch / Nhóm quảng
  cáo / Quảng cáo, editor 3 bước theo từng mục tiêu, 4 preset cột), 19 khối
  Tối ưu & Đề xuất, 15 case tình huống thực tế với campaign đang chạy tương
  ứng, 3 bài tập brief, thuật ngữ, banner TEST ENVIRONMENT. Không kết nối Meta,
  không chạy quảng cáo thật.
