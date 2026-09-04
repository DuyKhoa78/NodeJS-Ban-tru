# HƯỚNG DẪN TẠO GOOGLE FORM & KẾT NỐI GOOGLE APPS SCRIPT VỀ WEB BÁN TRÚ

Tài liệu này hướng dẫn bạn tạo Google Form cho Giáo viên báo cáo và cấu hình Google Apps Script để tự động chuyển dữ liệu về hệ thống Web Bán Trú THPT Lê Thị Hồng Gấm.

---

## BƯỚC 1: TẠO GOOGLE FORM BÁO CÁO CA TRỰC

1. Vào [Google Forms](https://forms.google.com) và tạo một Biểu mẫu mới, đặt tên: **"BÁO CÁO CA TRỰC BÁN TRÚ - THPT LÊ THỊ HỒNG GẤM"**.
2. Thêm các câu hỏi theo đúng thứ tự gợi ý sau:

| STT | Tên câu hỏi trên Form | Loại câu hỏi | Bắt buộc? | Gợi ý / Tùy chọn |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Ngày trực** | Ngày (Date) | Có | Mặc định ngày hôm nay |
| **2** | **Ca trực** | Trắc nghiệm | Có | `Ăn trưa` hoặc `Nghỉ trưa` |
| **3** | **Phòng trực** | Menu thả xuống / Trắc nghiệm | Có | Danh sách phòng: `A20`, `E2`, `P.1`, `P.2`, `HT.A`... |
| **4** | **Họ và tên Giáo viên trực** | Trả lời ngắn | Có | Nhập họ tên GV (Ví dụ: Thầy Khoa) |
| **5** | **Mã bảo mật của Giáo viên (5 ký tự)** | Trả lời ngắn | Có | Mã cá nhân 5 ký tự (VD: `GV84B`) do hệ thống tự sinh khi nạp GV. Chống HS giả mạo! |
| **6** | **Tình hình nề nếp / trật tự** | Trắc nghiệm / Đoạn | Có | `Nề nếp tốt, trật tự`, `Bình thường`, hoặc `Có học sinh vi phạm` |
| **7** | **Chi tiết học sinh vi phạm (nếu có)** | Đoạn (Paragraph) | Không | Ghi rõ: Tên em, Lớp, Lỗi vi phạm (VD: *A 10A1 làm ồn giờ ngủ*). Phòng ngoan để trống |
| **8** | **Đề xuất / Phản ánh khác** | Đoạn (Paragraph) | Không | Các vấn đề cần BGH / Quản lý lưu ý |

---

## BƯỚC 2: CÀI ĐẶT GOOGLE APPS SCRIPT (TỰ ĐỘNG GỬI DỮ LIỆU)

1. Trên giao diện chỉnh sửa Form, bấm vào biểu tượng **3 dấu chấm (⋮)** ở góc trên bên phải ➔ Chọn **Trình chỉnh sửa tập lệnh (Apps Script)**.
2. Xóa toàn bộ code mặc định trong file `Mã.gs` và dán đoạn code sau vào:

```javascript
/**
 * GOOGLE APPS SCRIPT - BÁO CÁO CA TRỰC BÁN TRÚ
 * Tự động gửi dữ liệu về Web Bán Trú THPT Lê Thị Hồng Gấm
 */

// ── CẤU HÌNH ĐƯỜNG DẪN WEB CỦA TRƯỜNG ──
// Thay bằng domain thật khi deploy (Ví dụ: https://lthg-bantru.vercel.app hoặc domain máy chủ)
// Khi test local, có thể dùng ngrok (ví dụ: https://xxxx.ngrok-free.app)
const WEBHOOK_URL = "https://lthg-bantru.vercel.app/api/webhook/google-form-baocao";

// Mã bí mật Webhook (Khớp với secret key hệ thống)
const WEBHOOK_SECRET = "bantru-lthg-secret-key-2025";

function onFormSubmit(e) {
  try {
    const itemResponses = e.response.getItemResponses();
    
    let ngay = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd");
    let ca_truc = "Ăn trưa";
    let ma_phong = "";
    let ho_ten_gv = "";
    let ma_xac_thuc = "";
    let hs_vi_pham = "";
    let tinh_hinh = "Nề nếp tốt, trật tự";
    let ghi_chu = "";

    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase().trim();
      const answer = itemResponses[i].getResponse();

      if (title.includes("ngày")) {
        ngay = answer;
      } else if (title.includes("ca")) {
        ca_truc = answer;
      } else if (title.includes("phòng")) {
        ma_phong = answer;
      } else if (title.includes("giáo viên") || title.includes("họ và tên") || title.includes("tên gv")) {
        ho_ten_gv = answer;
      } else if (title.includes("mã") || title.includes("bảo mật") || title.includes("xác thực") || title.includes("xác nhận")) {
        ma_xac_thuc = String(answer).trim().toUpperCase();
      } else if (title.includes("vi phạm") || title.includes("không nề nếp") || title.includes("chưa nề nếp") || title.includes("chi tiết") || title.includes("vắng")) {
        hs_vi_pham = answer;
      } else if (title.includes("tình hình") || title.includes("trật tự") || title.includes("nề nếp")) {
        tinh_hinh = answer;
      } else if (title.includes("đề xuất") || title.includes("phản ánh") || title.includes("ghi chú") || title.includes("ý kiến")) {
        ghi_chu = answer;
      }
    }

    const payload = {
      token: WEBHOOK_SECRET,
      ngay: ngay,
      ca_truc: ca_truc,
      ma_phong: ma_phong,
      ho_ten_gv: ho_ten_gv,
      ma_xac_thuc: ma_xac_thuc,
      hs_vi_pham: hs_vi_pham,
      tinh_hinh: tinh_hinh,
      ghi_chu: ghi_chu,
      nguon: "google_form"
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log("Response: " + response.getContentText());

  } catch (error) {
    Logger.log("Lỗi: " + error.toString());
  }
}
```

3. Nhấn nút **Lưu (Save - biểu tượng đĩa mềm)**.

---

## BƯỚC 3: TẠO TRIGGER (KÍCH HOẠT TỰ ĐỘNG)

1. Ở thanh menu bên trái của Apps Script, bấm vào biểu tượng **Đồng hồ bấm giờ (Triggers - Trình kích hoạt)**.
2. Bấm nút **+ Thêm trình kích hoạt (+ Add Trigger)** ở góc dưới bên phải.
3. Chọn các thông số:
   - *Chọn hàm cần chạy*: `onFormSubmit`
   - *Chọn nguồn sự kiện*: **Từ biểu mẫu (From form)**
   - *Chọn loại sự kiện*: **Khi gửi biểu mẫu (On form submit)**
4. Bấm **Lưu (Save)**. (Nếu Google hiện bảng yêu cầu cấp quyền truy cập, chọn *Nâng cao ➔ Đi tới [Dự án] ➔ Cho phép*).

---

## HOÀN TẤT!
Từ bây giờ:
- Giáo viên điền form và bấm **Gửi**.
- Google Form tự động ghi nhận vào Sheets và gửi Webhook tức thì về Web Bán Trú.
- Bạn mở trang **"Báo cáo trực GV"** trên web là thấy dữ liệu cập nhật theo thời gian thực!
