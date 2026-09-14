# HƯỚNG DẪN CẤU HÌNH GOOGLE APPS SCRIPT CHO GOOGLE FORM & GOOGLE SHEETS
### Báo cáo ca trực Bán trú - Trường THPT Lê Thị Hồng Gấm

Tài liệu này cung cấp toàn bộ đoạn mã Google Apps Script chuẩn xác nhất (hỗ trợ cấu trúc mới nhất **18 cột** gồm: **Phần 1: Ca ăn**, **Phần 2: Ca ngủ** và **Phần 3: Giám sát** kèm **Danh sách HS vắng** và vệ sinh an toàn thực phẩm).

---

## 1. BẢNG ĐỐI SOÁT CÁC CỘT TRÊN GOOGLE SHEETS

| Cột | Tên Cột Google Sheet | Thuộc Phần | Ý nghĩa & Dữ liệu mẫu |
|:---:|:---|:---|:---|
| **0** (A) | **Dấu thời gian** | Chung | `14/09/2026 23:53:54` |
| **1** (B) | **Ca trực** | Phân nhánh | `Trực ăn` / `Trực ngủ` / `Giám sát` |
| **2** (C) | **Họ tên** | **Phần 3. Giám sát** | Cán bộ / GV giám sát (`Bùi Xuân Kim Sa`) |
| **3** (D) | **Vị trí / Phòng** | **Phần 3. Giám sát** | Vị trí giám sát (`HTA`, `P5`...) |
| **4** (E) | **Tình hình nề nếp** | **Phần 3. Giám sát** | Tình hình nề nếp toàn trường (`Tốt`, `Bình thường`) |
| **5** (F) | **Vệ sinh an toàn thực phẩm** | **Phần 3. Giám sát** | Bếp ăn, lưu mẫu thức ăn (Nếu có) |
| **6** (G) | **Họ và tên giáo viên** | **Phần 1. Ca ăn** | GV trực phòng ăn (`Huỳnh Duy Khoa`) |
| **7** (H) | **Phòng ăn** | **Phần 1. Ca ăn** | `HT.A`, `P5`, `A20`... |
| **8** (I) | **Tình hình chung** | **Phần 1. Ca ăn** | `Tốt`, `Bình thường`... |
| **9** (J) | **Sĩ số** | **Phần 1. Ca ăn** | Sĩ số học sinh ăn trưa (`60/58`) |
| **10** (K) | **Danh sách HS vắng** | **Phần 1. Ca ăn** | Tên HS vắng (Mỗi bạn 1 dòng) |
| **11** (L) | **Ghi chú/Góp ý** | **Phần 1. Ca ăn** | Góp ý, CSVC ca ăn |
| **12** (M) | **Họ và tên** | **Phần 2. Ca ngủ** | GV trực phòng ngủ (`Huỳnh Duy Khoa`) |
| **13** (N) | **Phòng ngủ** | **Phần 2. Ca ngủ** | `D43`, `E3`, `HT.A`... |
| **14** (O) | **Tình hình chung** | **Phần 2. Ca ngủ** | `Tốt`, `Trật tự`... |
| **15** (P) | **Sĩ số** | **Phần 2. Ca ngủ** | Sĩ số học sinh ngủ trưa (`78/102`) |
| **16** (Q) | **Danh sách HS vắng** | **Phần 2. Ca ngủ** | Tên HS vắng (Mỗi bạn 1 dòng) |
| **17** (R) | **Ghi nhận HS vi phạm nề nếp** | **Phần 2. Ca ngủ** | Vi phạm ca ngủ gửi BGH/GVCN |
| **18** (S) | **Ghi chú/Góp ý** | **Phần 2. Ca ngủ** | Góp ý, CSVC ca ngủ |

---

## 2. TOÀN BỘ MÃ NGUỒN DÁN VÀO APPS SCRIPT (`Mã.gs`)

> **Cách mở Apps Script:**
> - Trên file Google Sheets liên kết với Form: Chọn **Tiện ích mở rộng** (Extensions) ➔ **Apps Script**.
> - Hoặc trên Google Form: Bấm dấu **⋮** (Ba chấm ở góc trên bên phải) ➔ Chọn **Trình chỉnh sửa tập lệnh** (Apps Script).
> - Xóa hết nội dung cũ trong file `Mã.gs` và dán toàn bộ đoạn code dưới đây vào:

```javascript
/**
 * =========================================================================================
 * GOOGLE APPS SCRIPT - ĐỒNG BỘ BÁO CÁO CA TRỰC THPT LÊ THI HỒNG GẤM (CÓ HS VẮNG)
 * Hỗ trợ Form 3 nhánh: Trực ăn, Trực ngủ và Giám sát kèm Danh sách HS vắng
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

    // Thứ tự cột chuẩn mới nhất:
    // [0] Dấu thời gian | [1] Ca trực
    // [Giám sát] [2] Họ tên | [3] Vị trí/Phòng | [4] Tình hình nề nếp | [5] Vệ sinh ATTP
    // [Ca ăn]    [6] Họ tên GV | [7] Phòng ăn | [8] Tình hình | [9] Sĩ số | [10] Danh sách HS vắng | [11] Ghi chú
    // [Ca ngủ]   [12] Họ tên GV | [13] Phòng ngủ | [14] Tình hình | [15] Sĩ số | [16] Danh sách HS vắng | [17] HS vi phạm | [18] Ghi chú
    
    const timestamp = row[0] || new Date();
    const ca_truc_raw = String(row[1] || "").toLowerCase().trim();

    let ca_truc = "Trực ăn";
    let ho_ten_gv = "";
    let ma_phong = "";
    let si_so = "";
    let tinh_hinh = "Tốt";
    let danh_sach_vang = "";
    let so_hs_vang = 0;
    let hs_vi_pham = "";
    let ghi_chu = "";
    let vsat_thuc_pham = "";

    const isNew18Col = row.length >= 18 || Boolean(row[13]) || (Boolean(row[6]) && Boolean(row[10]) && Boolean(row[11]));

    // 1. Nhánh Giám sát
    if (
      ca_truc_raw.includes("giám sát") || 
      ca_truc_raw.includes("gám sát") || 
      ca_truc_raw.includes("giamsat") || 
      (Boolean(row[2]) && !row[6] && !row[11] && !row[12])
    ) {
      ca_truc = "Giám sát";
      ho_ten_gv = row[2] || "";
      ma_phong = row[3] || "GIÁM SÁT";
      tinh_hinh = row[4] || "Tốt";
      vsat_thuc_pham = row[5] || "";
      ghi_chu = row[5] ? ("VSATTP: " + row[5]) : "";
    } 
    // 2. Nhánh Ca ngủ
    else if (
      ca_truc_raw.includes("ngủ") || 
      ca_truc_raw.includes("nghi") || 
      ca_truc_raw.includes("nghỉ") || 
      Boolean(row[12])
    ) {
      ca_truc = "Trực ngủ";
      if (isNew18Col) {
        ho_ten_gv = row[12] || "";
        ma_phong = row[13] || "";

        // Nhận diện tự động Sĩ số và Tình hình nếu hoán vị
        const valA = String(row[14] || "").trim();
        const valB = String(row[15] || "").trim();
        const isNumA = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valA);
        const isNumB = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valB);
        si_so = isNumB ? valB : (isNumA ? valA : valB);
        tinh_hinh = isNumB ? (valA || "Tốt") : (isNumA ? (valB || "Tốt") : (valA || "Tốt"));

        danh_sach_vang = row[16] || "";
        hs_vi_pham = row[17] || "";
        ghi_chu = row[18] || "";
      } else {
        ho_ten_gv = row[11] || "";
        ma_phong = row[12] || "";
        si_so = row[13] || "";
        tinh_hinh = row[14] || "Tốt";
        hs_vi_pham = row[15] || "";
        ghi_chu = row[16] || "";
      }
    } 
    // 3. Nhánh Ca ăn
    else {
      ca_truc = "Trực ăn";
      ho_ten_gv = row[6] || "";
      ma_phong = row[7] || "";

      if (isNew18Col) {
        // Nhận diện tự động Sĩ số và Tình hình nếu hoán vị
        const valA = String(row[8] || "").trim();
        const valB = String(row[9] || "").trim();
        const isNumA = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valA);
        const isNumB = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valB);
        si_so = isNumB ? valB : (isNumA ? valA : valB);
        tinh_hinh = isNumB ? (valA || "Tốt") : (isNumA ? (valB || "Tốt") : (valA || "Tốt"));

        danh_sach_vang = row[10] || "";
        ghi_chu = row[11] || "";
      } else {
        tinh_hinh = row[8] || "Tốt";
        si_so = row[9] || "";
        ghi_chu = row[10] || "";
      }
    }

    // Đếm số lượng học sinh vắng
    if (danh_sach_vang) {
      const lines = String(danh_sach_vang)
        .split(/\r?\n|;/)
        .map(function(s) { return s.trim(); })
        .filter(function(s) { 
          const lower = s.toLowerCase();
          return s.length > 0 && !lower.startsWith("không") && !lower.startsWith("ko") && !lower.startsWith("đủ") && lower !== "0"; 
        });
      so_hs_vang = lines.length;
    }

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: timestamp,
      ca_truc: ca_truc,
      ho_ten_gv: ho_ten_gv,
      ma_phong: ma_phong,
      si_so: si_so,
      tinh_hinh: tinh_hinh,
      danh_sach_vang: danh_sach_vang,
      so_hs_vang: so_hs_vang,
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
    let danh_sach_vang = "";
    let so_hs_vang = 0;
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
      // 4. Danh sách học sinh vắng
      else if (title.includes("vắng") || title.includes("vang") || title.includes("danh sách hs vắng") || title.includes("học sinh vắng")) {
        danh_sach_vang = answer;
      }
      // 5. Sỉ số
      else if (title.includes("sỉ số") || title.includes("sĩ số") || title.includes("số lượng") || title.includes("số hs")) {
        si_so = answer;
      }
      // 6. Vi phạm nề nếp
      else if (title.includes("vi phạm") || title.includes("bất thường") || title.includes("quậy") || title.includes("mất trật tự") || title.includes("sự cố")) {
        hs_vi_pham = answer;
      }
      // 7. Vệ sinh an toàn thực phẩm
      else if (title.includes("vệ sinh") || title.includes("thực phẩm") || title.includes("an toàn thực phẩm") || title.includes("vsattp")) {
        vsat_thuc_pham = answer;
      }
      // 8. Tình hình chung / nề nếp
      else if (title.includes("tình hình") || title.includes("nề nếp") || title.includes("nền nếp") || title.includes("trật tự")) {
        tinh_hinh = answer;
      }
      // 9. Ghi chú / Góp ý
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

    // Đếm số lượng học sinh vắng
    if (danh_sach_vang) {
      const lines = String(danh_sach_vang)
        .split(/\r?\n|;/)
        .map(function(s) { return s.trim(); })
        .filter(function(s) { 
          const lower = s.toLowerCase();
          return s.length > 0 && !lower.startsWith("không") && !lower.startsWith("ko") && !lower.startsWith("đủ") && lower !== "0"; 
        });
      so_hs_vang = lines.length;
    }

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: thoi_gian_nop,
      ca_truc: ca_truc,
      ma_phong: ma_phong,
      ho_ten_gv: ho_ten_gv,
      si_so: si_so,
      tinh_hinh: tinh_hinh,
      danh_sach_vang: danh_sach_vang,
      so_hs_vang: so_hs_vang,
      hs_vi_pham: hs_vi_pham,
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
