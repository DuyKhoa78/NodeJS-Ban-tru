# HƯỚNG DẪN CẤU HÌNH GOOGLE FORM & GOOGLE SHEETS BÁO CÁO CA TRỰC BÁN TRÚ
### Trường THPT Lê Thị Hồng Gấm

Hệ thống hỗ trợ đồng bộ tự động dữ liệu báo cáo từ **Google Form** và **Google Sheets (13 cột)** về phần mềm Quản lý Bán trú theo thời gian thực.

---

## 1. CẤU TRÚC FORM 2 NHÁNH & BẢNG TÍNH GOOGLE SHEETS (13 CỘT)

Biểu mẫu Google Form chia làm 2 nhánh phân theo **Ca trực**, ghi nhận dữ liệu vào Google Sheets theo thứ tự 13 cột chuẩn sau:

| STT | Cột trên Sheet | Nhánh / Ý nghĩa | Ví dụ dữ liệu |
| :---: | :--- | :--- | :--- |
| **0** | **Dấu thời gian** | Thời gian nộp | `08/09/2026 11:35:10` |
| **1** | **Ca trực** | Phân nhánh (`Trực ăn` / `Trực ngủ`) | `Trực ăn` hoặc `Trực ngủ` |
| **2** | **Họ và tên giáo viên** | GV trực Ca ăn | `Huỳnh Duy Khoa` |
| **3** | **Phòng ăn** | Phòng trực Ca ăn | `HT.A`, `P1`, `A20`... |
| **4** | **Tình hình chung** | Nề nếp Ca ăn | `Tốt`, `Bình thường`, `Ồn ào`... |
| **5** | **Sỉ số** | Sỉ số phòng Ca ăn | `35` hoặc `35/36` |
| **6** | **Ghi chú/Góp ý** | Góp ý / Đề xuất CSVC Ca ăn | `Quạt phòng ăn số 2 bị hỏng` |
| **7** | **Họ và tên** | GV trực Ca ngủ | `Đào Thị Cẩm Hạnh` |
| **8** | **Phòng ngủ** | Phòng trực Ca ngủ | `D21`, `D22`, `HT.A`... |
| **9** | **Sỉ số** | Sỉ số phòng Ca ngủ | `40` |
| **10** | **Tình hình chung** | Nề nếp Ca ngủ | `Tốt`, `Trật tự`... |
| **11** | **Ghi nhận HS vi phạm nề nếp (Nếu có)** | Vi phạm ca ngủ (gửi BGH/GVCN) | `Nguyễn Văn A 10A1 nói chuyện riêng` |
| **12** | **Ghi chú/Góp ý** | Góp ý / Đề xuất CSVC Ca ngủ | `Máy lạnh cần vệ sinh` |

---

## 2. MÃ NGUỒN GOOGLE APPS SCRIPT (DÙNG CHUNG FORM & SHEET)

1. Mở **Google Form** ➔ Bấm nút **⋮ (Ba chấm)** ở góc trên bên phải ➔ Chọn **Trình chỉnh sửa tập lệnh (Apps Script)**.
   *(Hoặc trên **Google Sheets** liên kết: Chọn menu **Tiện ích mở rộng** ➔ **Apps Script**)*.
2. Xóa hết mã cũ trong `Mã.gs` và dán toàn bộ đoạn mã sau:

```javascript
/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - BÁO CÁO CA TRỰC THPT LÊ THI HỒNG GẤM
 * Hỗ trợ Form 2 phần (Trực ăn & Trực ngủ) & Google Sheets 13 cột chuẩn.
 * =========================================================================
 */

// Địa chỉ Webhook nhận dữ liệu của trường (Khi deploy đổi thành domain thật nếu khác)
const WEBHOOK_URL = "https://lthg-bantru.vercel.app/api/webhook/google-form-baocao";

// Mã bảo mật Webhook (Trùng khớp với cấu hình hệ thống)
const WEBHOOK_SECRET = "bantru-lthg-secret-key-2025";

/**
 * 🚀 CÁCH 1: HÀM DÀNH CHO GOOGLE FORM
 * (Tạo Trình kích hoạt / Trigger chọn hàm này, Sự kiện: On form submit)
 */
function onFormSubmit(e) {
  try {
    const timestamp = e.response.getTimestamp();
    let thoi_gian_nop = Utilities.formatDate(timestamp, "Asia/Ho_Chi_Minh", "yyyy-MM-dd'T'HH:mm:ss") + "+07:00";

    const itemResponses = e.response.getItemResponses();
    let ca_truc = "Trực ăn";
    let ma_phong = "", ho_ten_gv = "";
    let si_so = "";
    let hs_vi_pham = "";
    let tinh_hinh = "Tốt", ghi_chu = "";

    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase().trim();
      const answer = String(itemResponses[i].getResponse() || "").trim();
      if (!answer) continue;

      if (title.includes("ca")) {
        ca_truc = answer;
      } else if (title.includes("phòng") || title.includes("phong")) {
        ma_phong = answer;
        if (title.includes("ăn")) ca_truc = "Trực ăn";
        else if (title.includes("ngủ") || title.includes("nghi")) ca_truc = "Trực ngủ";
      } else if (title.includes("giáo viên") || title.includes("họ và tên") || title.includes("họ tên") || title.includes("tên gv")) {
        ho_ten_gv = answer;
      } else if (title.includes("sỉ số") || title.includes("sĩ số") || title.includes("số lượng") || title.includes("số hs")) {
        si_so = answer;
      } else if (title.includes("vi phạm") || title.includes("bất thường") || title.includes("quậy") || title.includes("mất trật tự") || title.includes("sự cố")) {
        hs_vi_pham = answer;
      } else if (title.includes("tình hình") || title.includes("nề nếp") || title.includes("nền nếp") || title.includes("trật tự")) {
        tinh_hinh = answer;
      } else if (title.includes("ghi chú") || title.includes("góp ý") || title.includes("đề xuất") || title.includes("phản ánh")) {
        ghi_chu = answer;
      }
    }

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: thoi_gian_nop,
      ca_truc: ca_truc,
      ma_phong: ma_phong,
      ho_ten_gv: ho_ten_gv,
      si_so: si_so,
      hs_vi_pham: hs_vi_pham,
      tinh_hinh: tinh_hinh,
      ghi_chu: ghi_chu,
      nguon: "google_form"
    };

    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Lỗi Form: " + err.toString());
  }
}

/**
 * 🚀 CÁCH 2: HÀM DÀNH CHO GOOGLE SHEETS
 * (Tạo Trình kích hoạt / Trigger chọn hàm này, Sự kiện: Khi gửi biểu mẫu - On form submit)
 */
function onSheetSubmit(e) {
  try {
    const row = e.values || [];
    // 0: Dấu thời gian | 1: Ca trực
    // Ca ăn: 2: Họ và tên giáo viên | 3: Phòng ăn | 4: Tình hình chung | 5: Sỉ số | 6: Ghi chú/Góp ý
    // Ca ngủ: 7: Họ và tên | 8: Phòng ngủ | 9: Sỉ số | 10: Tình hình chung | 11: Ghi nhận HS vi phạm nề nếp (Nếu có) | 12: Ghi chú/Góp ý
    const timestamp = row[0] || new Date();
    const ca_truc_raw = row[1] || "";
    const isCaNgu = String(ca_truc_raw).toLowerCase().includes("ngủ") || String(ca_truc_raw).toLowerCase().includes("nghi") || (Boolean(row[8]) && !row[3]);

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: timestamp,
      ca_truc: isCaNgu ? "Trực ngủ" : "Trực ăn",
      ho_ten_gv: isCaNgu ? (row[7] || "") : (row[2] || ""),
      ma_phong: isCaNgu ? (row[8] || "") : (row[3] || ""),
      si_so: isCaNgu ? (row[9] || "") : (row[5] || ""),
      tinh_hinh: isCaNgu ? (row[10] || "Tốt") : (row[4] || "Tốt"),
      hs_vi_pham: isCaNgu ? (row[11] || "") : "",
      ghi_chu: isCaNgu ? (row[12] || "") : (row[6] || ""),
      nguon: "google_sheet"
    };

    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Lỗi Sheets: " + err.toString());
  }
}
```

---

## 3. TẠO TRÌNH KÍCH HOẠT (TRIGGER)

1. Ở menu bên trái Apps Script, bấm biểu tượng **Chiếc đồng hồ (Trình kích hoạt - Triggers)**.
2. Bấm nút **+ Thêm trình kích hoạt (+ Add Trigger)** ở góc dưới bên phải.
3. Cài đặt các mục:
   - *Chọn hàm cần chạy*:
     - Nếu dán trong **Google Form**: chọn `onFormSubmit`.
     - Nếu dán trong **Google Sheets**: chọn `onSheetSubmit`.
   - *Chọn nguồn sự kiện*: **Từ biểu mẫu (From form)** hoặc **Từ bảng tính (From spreadsheet)**.
   - *Chọn loại sự kiện*: **Khi gửi biểu mẫu (On form submit)**.
4. Bấm **Lưu (Save)** và chấp nhận quyền truy cập Google.

**Hoàn tất!** Bất kỳ khi nào giáo viên gửi biểu mẫu, dữ liệu bao gồm ca trực, phòng trực, họ tên giáo viên, sỉ số, tình hình nề nếp và vi phạm sẽ lập tức xuất hiện trên trang **Báo cáo trực GV** của website.
