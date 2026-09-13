# HƯỚNG DẪN CẤU HÌNH GOOGLE APPS SCRIPT CHO GOOGLE FORM & GOOGLE SHEETS
### Báo cáo ca trực Bán trú - Trường THPT Lê Thị Hồng Gấm

Tài liệu này cung cấp toàn bộ đoạn mã Google Apps Script chuẩn xác nhất (hỗ trợ đầy đủ **17 cột** gồm: **Phần 1: Ca ăn**, **Phần 2: Ca ngủ** và **Phần 3: Giám sát** kèm phòng ăn và vệ sinh an toàn thực phẩm).

---

## 1. BẢNG ĐỐI SOÁT 17 CỘT TRÊN GOOGLE SHEETS

| Cột | Tên Cột Google Sheet | Thuộc Phần | Ý nghĩa & Dữ liệu mẫu |
|:---:|:---|:---|:---|
| **0** (A) | **Dấu thời gian** | Chung | `13/09/2026 22:28:29` |
| **1** (B) | **Ca trực** | Phân nhánh | `Trực ăn` / `Trực ngủ` / `Giám sát` |
| **2** (C) | **Họ tên** | **Phần 3. Giám sát** | Cán bộ / GV giám sát (`Đỗ Văn Thương`) |
| **3** (D) | **Phòng ăn** | **Phần 3. Giám sát** | Phòng quan sát / giám sát (`P3, 4, 5`) |
| **4** (E) | **Tình hình nề nếp** | **Phần 3. Giám sát** | Tình hình nề nếp toàn trường (`Bình Thường`) |
| **5** (F) | **Vệ sinh an toàn thực phẩm** | **Phần 3. Giám sát** | Bếp ăn, lưu mẫu thức ăn |
| **6** (G) | **Họ và tên giáo viên** | **Phần 1. Ca ăn** | GV trực phòng ăn (`Huỳnh Duy Khoa`) |
| **7** (H) | **Phòng ăn** | **Phần 1. Ca ăn** | `HT.A`, `P5`, `A20`... |
| **8** (I) | **Tình hình chung** | **Phần 1. Ca ăn** | `Tốt`, `Bình thường`... |
| **9** (J) | **Sỉ số** | **Phần 1. Ca ăn** | Sỉ số học sinh ăn trưa |
| **10** (K) | **Ghi chú/Góp ý** | **Phần 1. Ca ăn** | Góp ý, CSVC ca ăn |
| **11** (L) | **Họ và tên** | **Phần 2. Ca ngủ** | GV trực phòng ngủ (`Phạm Thị Thanh Hà`) |
| **12** (M) | **Phòng ngủ** | **Phần 2. Ca ngủ** | `E3`, `D21`, `HT.A`... |
| **13** (N) | **Sỉ số** | **Phần 2. Ca ngủ** | Sỉ số học sinh ngủ trưa |
| **14** (O) | **Tình hình chung** | **Phần 2. Ca ngủ** | `Tốt`, `Trật tự`... |
| **15** (P) | **Ghi nhận HS vi phạm nề nếp (Nếu có)** | **Phần 2. Ca ngủ** | Vi phạm ca ngủ gửi BGH/GVCN |
| **16** (Q) | **Ghi chú/Góp ý** | **Phần 2. Ca ngủ** | Góp ý, CSVC ca ngủ |

---

## 2. TOÀN BỘ MÃ NGUỒN DÁN VÀO APPS SCRIPT (`Mã.gs`)

> **Cách mở Apps Script:**
> - Trên file Google Sheets liên kết với Form: Chọn **Tiện ích mở rộng** (Extensions) ➔ **Apps Script**.
> - Hoặc trên Google Form: Bấm dấu **⋮** (Ba chấm ở góc trên bên phải) ➔ Chọn **Trình chỉnh sửa tập lệnh** (Apps Script).
> - Xóa hết nội dung cũ trong file `Mã.gs` và dán toàn bộ đoạn code dưới đây vào:

```javascript
/**
 * =========================================================================================
 * GOOGLE APPS SCRIPT - ĐỒNG BỘ BÁO CÁO CA TRỰC THPT LÊ THỊ HỒNG GẤM
 * Chuẩn 17 cột: Trực ăn, Trực ngủ và Phần 3: Giám sát (kèm Phòng ăn & Vệ sinh ATTP)
 * =========================================================================================
 */

// 1. Cấu hình Webhook
const WEBHOOK_URL = "https://lthg-bantru.vercel.app/api/webhook/google-form-baocao";
const WEBHOOK_SECRET = "bantru-lthg-secret-key-2025";

/**
 * -----------------------------------------------------------------------------------------
 * HÀM 1: DÀNH CHO GOOGLE SHEETS (Khuyên dùng nếu bạn mở Apps Script từ Google Trang tính)
 * Tạo Trigger (Trình kích hoạt):
 *   - Chọn hàm chạy: onSheetSubmit
 *   - Nguồn sự kiện: Từ bảng tính (From spreadsheet)
 *   - Loại sự kiện: Khi gửi biểu mẫu (On form submit)
 * -----------------------------------------------------------------------------------------
 */
function onSheetSubmit(e) {
  try {
    const row = e.values || [];
    if (!row || row.length === 0) {
      Logger.log("Không có dữ liệu hàng!");
      return;
    }

    // Thứ tự 17 cột chuẩn (mới nhất):
    // [0] Dấu thời gian | [1] Ca trực
    // Phần 3. Giám sát: [2] Họ tên | [3] Phòng ăn | [4] Tình hình nề nếp | [5] Vệ sinh an toàn thực phẩm
    // Phần 1. Ca ăn:    [6] Họ và tên giáo viên | [7] Phòng ăn | [8] Tình hình chung | [9] Sỉ số | [10] Ghi chú/Góp ý
    // Phần 2. Ca ngủ:   [11] Họ và tên | [12] Phòng ngủ | [13] Sỉ số | [14] Tình hình chung | [15] Ghi nhận HS vi phạm nề nếp (Nếu có) | [16] Ghi chú/Góp ý
    
    const timestamp = row[0] || new Date();
    const ca_truc_raw = String(row[1] || "").toLowerCase().trim();

    let ca_truc = "Trực ăn";
    let ho_ten_gv = "";
    let ma_phong = "";
    let si_so = "";
    let tinh_hinh = "Tốt";
    let hs_vi_pham = "";
    let ghi_chu = "";
    let vsat_thuc_pham = "";

    const is17Col = row.length >= 17 || Boolean(row[12]) || Boolean(row[11]) || (Boolean(row[6]) && Boolean(row[7])) || (Boolean(row[2]) && Boolean(row[3]) && Boolean(row[5]));

    // 1. Nhánh Giám sát
    if (
      ca_truc_raw.includes("giám sát") || 
      ca_truc_raw.includes("gám sát") || 
      ca_truc_raw.includes("giamsat") || 
      (Boolean(row[2]) && !row[6] && !row[11])
    ) {
      ca_truc = "Giám sát";
      ho_ten_gv = row[2] || "";
      if (is17Col) {
        ma_phong = row[3] || "GIÁM SÁT";
        tinh_hinh = row[4] || "Tốt";
        vsat_thuc_pham = row[5] || "";
        ghi_chu = "";
      } else {
        ma_phong = "GIÁM SÁT";
        tinh_hinh = row[3] || "Tốt";
        vsat_thuc_pham = row[4] || "";
        ghi_chu = "";
      }
    } 
    // 2. Nhánh Ca ngủ
    else if (
      ca_truc_raw.includes("ngủ") || 
      ca_truc_raw.includes("nghi") || 
      ca_truc_raw.includes("nghỉ") || 
      Boolean(row[12]) ||
      Boolean(row[11])
    ) {
      ca_truc = "Trực ngủ";
      if (is17Col) {
        ho_ten_gv = row[11] || "";
        ma_phong = row[12] || "";
        si_so = row[13] || "";
        tinh_hinh = row[14] || "Tốt";
        hs_vi_pham = row[15] || "";
        ghi_chu = row[16] || "";
      } else {
        ho_ten_gv = row[10] || "";
        ma_phong = row[11] || "";
        si_so = row[12] || "";
        tinh_hinh = row[13] || "Tốt";
        hs_vi_pham = row[14] || "";
        ghi_chu = row[15] || "";
      }
    } 
    // 3. Nhánh Ca ăn
    else {
      ca_truc = "Trực ăn";
      if (is17Col) {
        ho_ten_gv = row[6] || "";
        ma_phong = row[7] || "";
        tinh_hinh = row[8] || "Tốt";
        si_so = row[9] || "";
        ghi_chu = row[10] || "";
      } else {
        ho_ten_gv = row[5] || "";
        ma_phong = row[6] || "";
        tinh_hinh = row[7] || "Tốt";
        si_so = row[8] || "";
        ghi_chu = row[9] || "";
      }
    }

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: timestamp,
      ca_truc: ca_truc,
      ho_ten_gv: ho_ten_gv,
      ma_phong: ma_phong,
      si_so: si_so,
      tinh_hinh: tinh_hinh,
      hs_vi_pham: hs_vi_pham,
      ghi_chu: ghi_chu,
      vsat_thuc_pham: vsat_thuc_pham,
      raw_data: row,
      nguon: "google_sheet"
    };

    const res = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log("Kết quả gửi Sheet: " + res.getResponseCode() + " - " + res.getContentText());
  } catch (err) {
    Logger.log("Lỗi gửi dữ liệu Sheets: " + err.toString());
  }
}

/**
 * -----------------------------------------------------------------------------------------
 * HÀM 2: DÀNH CHO GOOGLE FORM (Nếu bạn mở Apps Script trực tiếp từ Google Form)
 * Tạo Trigger (Trình kích hoạt):
 *   - Chọn hàm chạy: onFormSubmit
 *   - Nguồn sự kiện: Từ biểu mẫu (From form)
 *   - Loại sự kiện: Khi gửi biểu mẫu (On form submit)
 * -----------------------------------------------------------------------------------------
 */
function onFormSubmit(e) {
  if (!e || !e.response) {
    Logger.log("⚠️ Hàm này được kích hoạt tự động mỗi khi có người gửi Form (On form submit). Bạn không cần bấm nút Chạy (Run) thủ công.");
    return;
  }

  try {
    const timestamp = e.response.getTimestamp();
    let thoi_gian_nop = Utilities.formatDate(timestamp, "Asia/Ho_Chi_Minh", "yyyy-MM-dd'T'HH:mm:ss") + "+07:00";

    const itemResponses = e.response.getItemResponses();
    let ca_truc = "";
    let ma_phong = "", ho_ten_gv = "";
    let si_so = "";
    let hs_vi_pham = "";
    let tinh_hinh = "Tốt", ghi_chu = "";
    let vsat_thuc_pham = "";

    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase().trim();
      const answer = String(itemResponses[i].getResponse() || "").trim();
      if (!answer) continue;

      // 1. Ca trực
      if (title.includes("ca trực") || title === "ca") {
        ca_truc = answer;
      }
      // 2. Họ và tên (ở cả 3 nhánh)
      else if (title.includes("giáo viên") || title.includes("họ và tên") || title.includes("họ tên") || title.includes("tên gv")) {
        ho_ten_gv = answer;
      }
      // 3. Phòng trực (Phòng ăn ở ca ăn / ca giám sát, Phòng ngủ ở ca ngủ)
      else if (title.includes("phòng") || title.includes("phong")) {
        ma_phong = answer;
      }
      // 4. Sỉ số
      else if (title.includes("sỉ số") || title.includes("sĩ số") || title.includes("số lượng") || title.includes("số hs")) {
        si_so = answer;
      }
      // 5. Vi phạm nề nếp
      else if (title.includes("vi phạm") || title.includes("bất thường") || title.includes("quậy") || title.includes("mất trật tự") || title.includes("sự cố")) {
        hs_vi_pham = answer;
      }
      // 6. Vệ sinh an toàn thực phẩm
      else if (title.includes("vệ sinh") || title.includes("thực phẩm") || title.includes("an toàn thực phẩm") || title.includes("vsattp")) {
        vsat_thuc_pham = answer;
      }
      // 7. Tình hình chung / nề nếp
      else if (title.includes("tình hình") || title.includes("nề nếp") || title.includes("nền nếp") || title.includes("trật tự")) {
        tinh_hinh = answer;
      }
      // 8. Ghi chú / Góp ý
      else if (title.includes("ghi chú") || title.includes("góp ý") || title.includes("đề xuất") || title.includes("phản ánh")) {
        ghi_chu = answer;
      }
    }

    // Phân loại chính xác Ca trực
    const caLower = String(ca_truc).toLowerCase();
    if (caLower.includes("giám sát") || caLower.includes("gám sát") || caLower.includes("giamsat") || Boolean(vsat_thuc_pham)) {
      ca_truc = "Giám sát";
      if (!ma_phong) ma_phong = "GIÁM SÁT";
    } else if (caLower.includes("ngủ") || caLower.includes("nghi") || caLower.includes("nghỉ")) {
      ca_truc = "Trực ngủ";
    } else {
      ca_truc = "Trực ăn";
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
      vsat_thuc_pham: vsat_thuc_pham,
      nguon: "google_form"
    };

    const res = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log("Kết quả gửi Form: " + res.getResponseCode() + " - " + res.getContentText());
  } catch (err) {
    Logger.log("Lỗi gửi dữ liệu Form: " + err.toString());
  }
}

/**
 * -----------------------------------------------------------------------------------------
 * HÀM TEST (TÙY CHỌN): Bấm nút "Chạy" (Run) hàm này để test gửi ngay câu trả lời gần nhất
 * mà không cần phải mở Form ra điền lại từ đầu!
 * -----------------------------------------------------------------------------------------
 */
function testSendLatestFormResponse() {
  try {
    const form = FormApp.getActiveForm();
    const responses = form.getResponses();
    if (!responses || responses.length === 0) {
      Logger.log("Chưa có phản hồi nào trong Form để test!");
      return;
    }
    const latestResponse = responses[responses.length - 1];
    Logger.log("Đang test gửi phản hồi nộp lúc: " + latestResponse.getTimestamp());
    onFormSubmit({ response: latestResponse });
  } catch (err) {
    Logger.log("Lỗi test Form: " + err.toString());
  }
}
```

---

## 3. CÁCH CÀI ĐẶT TRÌNH KÍCH HOẠT (TRIGGER)

1. Ở thanh menu bên trái trong trang Google Apps Script, bấm biểu tượng **Chiếc đồng hồ (Trình kích hoạt - Triggers)**.
2. Bấm nút màu xanh **+ Thêm trình kích hoạt** (+ Add Trigger) ở góc dưới bên phải.
3. Điền các tùy chọn:
   - **Chọn hàm cần chạy**:
     - Chọn `onSheetSubmit` *(nếu bạn mở từ Google Sheets)*.
     - Chọn `onFormSubmit` *(nếu bạn mở từ Google Form)*.
   - **Chọn nguồn sự kiện**: `Từ bảng tính (From spreadsheet)` hoặc `Từ biểu mẫu (From form)`.
   - **Chọn loại sự kiện**: `Khi gửi biểu mẫu (On form submit)`.
4. Bấm **Lưu (Save)**.
5. Khi Google hiển thị bảng cấp quyền: Chọn tài khoản Google của bạn ➔ Bấm **Nâng cao (Advanced)** ➔ Bấm **Đi tới Dự án (không an toàn)** ➔ Bấm **Cho phép (Allow)**.

Từ lúc này, mỗi khi giáo viên nộp Form, dữ liệu của cả 3 ca (Trực ăn, Trực ngủ, Giám sát) sẽ được gửi thẳng về hệ thống quản lý bán trú!
