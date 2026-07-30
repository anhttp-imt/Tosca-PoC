# Tosca PoC — Web Test Automation

PoC mô phỏng các tính năng cốt lõi của Tricentis Tosca: **Object Identification**, **Scriptless Test Automation**, **Record & Playback**, **Test Suite (nhiều test case thành 1 workflow)**, **Test Execution & Report**. Xem chi tiết thiết kế tại `../tosca-poc-plan.md`.

Kiến trúc gồm 2 phần tách biệt:
- **Extension** (`tosca-poc-extension/`, thư mục này): chỉ làm **Object Identification (Scan)** — vì chỉ extension mới có quyền chèn script/đọc DOM/chụp screenshot của tab đang test.
- **Web App** (`../tosca-poc-webapp/`): **Test Builder**, **Record & Playback**, **Run & Report** — giao tiếp với extension qua kênh `externally_connectable` của Chrome (không cần cài thêm gì, chỉ cần chạy 1 local server tĩnh).

## 1. Load extension vào Chrome

1. Mở `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. Bấm **Load unpacked** → chọn thư mục `tosca-poc-extension` (thư mục chứa `manifest.json`)
4. Click icon extension → Side Panel mở bên phải, hiển thị **Extension ID** ở đầu trang — bấm **Copy** để lấy ID này (cần dán vào Web App ở bước 3).

Sau khi sửa code, quay lại `chrome://extensions` và bấm nút reload (⟳) trên thẻ extension.

> Lưu ý: ID của unpacked extension được tính từ đường dẫn cài đặt, nên sẽ giữ nguyên miễn là bạn không di chuyển thư mục `tosca-poc-extension` sang chỗ khác.

## 2. Chạy Web App

```bash
cd ../tosca-poc-webapp
node server.js
```

Mở `http://localhost:8787` trên **một tab riêng** (không phải tab đang test).

> Cổng `8787` đã được khai báo cứng trong `manifest.json` (`externally_connectable`). Nếu đổi cổng, phải sửa cả 2 chỗ.

## 3. Kết nối Web App ⇄ Extension

1. Trong Web App, dán **Extension ID** đã copy ở bước 1 vào ô đầu trang → bấm **Connect**. Trạng thái chuyển thành "Đã kết nối".
2. Mở trang cần test ở **một tab khác** (ví dụ `tosca-poc-extension/sample/sample-page.html`).
3. Trong Web App, chọn tab đó ở dropdown **Target Tab** (bấm ⟳ Refresh nếu tab mới mở chưa hiện ra). Mọi thao tác Record/Run sẽ nhắm vào tab được chọn ở đây, **không phải** tab đang active lúc bấm nút (vì bản thân Web App cũng là 1 tab).

## 4. Luồng test cơ bản

### a. Scan object (trong Extension Side Panel)
1. Mở Side Panel của extension, bấm **Bắt đầu Scan**.
2. Trên tab đang test (không phải tab Web App), di chuột để thấy khung cam highlight, click vào các element muốn dùng (ví dụ ô Username, Password, nút Đăng nhập).
3. Element xuất hiện trong Object Repository của Side Panel, đồng thời tự động đồng bộ sang Web App.

### b. Test Builder — thêm step thủ công (trong Web App)
1. Tab **Test Builder** → **+ Test case mới**, đặt tên.
2. Chọn object (đã scan ở bước a), action (Click/Input/Select/Verify Text/Wait), nhập giá trị → **+ Thêm step**.
3. Ví dụ với `sample-page.html`: Input vào object "username" giá trị `abc`, Click vào object "Đăng nhập", Verify Text object "#result" với giá trị `Xin chào, abc!`.

### c. Record & Playback (trong Web App)
1. Đảm bảo đã chọn đúng **Target Tab**. Chọn/tạo test case, bấm **Bắt đầu Record**.
2. Thao tác thật trên Target Tab (gõ vào ô input, chọn dropdown, click nút) → step tự động thêm vào danh sách bên Web App.
3. Bấm **Dừng Record** khi xong.

### d. Suite — nối nhiều test case thành 1 workflow (trong Web App)
1. Tạo trước vài test case riêng lẻ ở Test Builder (ví dụ: "Login", "Tạo đơn hàng", "Đăng xuất" — có thể thuộc các feature khác nhau).
2. Tab **Suite** → **+ Suite mới**, đặt tên (ví dụ "End-to-end flow").
3. Chọn test case ở dropdown cuối trang → **+ Thêm vào Suite**, lặp lại theo đúng thứ tự muốn chạy. Có thể sắp xếp lại (↑/↓) hoặc xóa khỏi suite.
4. **Lưu ý**: nếu 1 test case trong suite fail, suite sẽ **dừng ngay**, không chạy tiếp các test case phía sau (fail-fast).

### e. Run & Report (trong Web App)
1. Tab **Run** → chọn chế độ **Test Case đơn lẻ** hoặc **Suite** ở dropdown đầu tiên, chọn test case/suite tương ứng → bấm **▶ Run**. Kết quả chạy trên **Target Tab** đã chọn.
2. Chế độ Test Case: xem trạng thái từng step realtime (pending → running → pass/fail).
3. Chế độ Suite: danh sách test case trong suite hiện phía trên (pending/running/pass/fail cho từng test case), bên dưới là chi tiết step của test case đang chạy tại thời điểm đó.
4. Trên Target Tab sẽ thấy khung xanh dương chỉ element đang thao tác.
5. Tab **Report** → xem lại lịch sử. Report của 1 lần chạy Suite được gom vào 1 card 🗂 chứa report con của từng test case theo đúng thứ tự; report chạy đơn lẻ hiển thị như bình thường. Mở rộng để xem chi tiết + screenshot mỗi step. Có thể xóa lịch sử.

## Giới hạn PoC (xem thêm `tosca-poc-plan.md`)

- Không hỗ trợ iframe lồng nhau, không hỗ trợ chạy song song nhiều tab.
- Không có data-driven testing, không có module Requirement/Risk-based design.
- Không có CI/CD runner — chỉ chạy qua UI Web App / Side Panel.
- Suite chạy fail-fast (dừng ngay khi có test case fail), không có tuỳ chọn "chạy hết rồi tổng hợp" hay retry.
- Dữ liệu (Object Repository, Test Case, Test Suite, Report) vẫn lưu trong `chrome.storage.local` của extension — gỡ extension sẽ mất dữ liệu. Web App không lưu gì, chỉ là lớp điều khiển từ xa.
- Chỉ hỗ trợ 1 origin `http://localhost:8787` được whitelist trong `externally_connectable`.
