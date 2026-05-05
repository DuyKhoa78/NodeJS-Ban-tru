# BACKEND BLUEPRINT – Hệ thống Quản lý Bán trú THPT Lê Thị Hồng Gấm
## Mục tiêu: Viết lại toàn bộ Django back-end thành Node.js + Express + Sequelize (PostgreSQL)

---

## 1. TỔNG QUAN HỆ THỐNG

- **Ngôn ngữ gốc**: Python / Django 5.x
- **Database**: PostgreSQL (local: `postgres://postgres:123456@localhost:5432/school_meal_management`)
- **Auth**: Session-based (Django session), custom user model `StaffUser`
- **CORS**: Cho phép tất cả origins
- **Timezone**: Asia/Ho_Chi_Minh (UTC+7)
- **Language**: Tiếng Việt

---

## 2. PHÂN QUYỀN (ROLES)

```
admin    → Toàn quyền
hoc_vu   → Điểm danh, xuất file
quan_ly  → Phân công trực, cấu hình giá, vật dụng
ke_toan  → Xem cấu hình giá, vật dụng (read-only)
```

**Middleware kiểm tra role** (tương đương `role_required` decorator):
- Nếu chưa đăng nhập → redirect `/login/` hoặc JSON 401 (nếu API)
- Nếu không đủ quyền → redirect `/` hoặc JSON 403 (nếu API)
- superuser luôn pass
- API paths bắt đầu bằng `/api/` → trả JSON thay vì redirect

---

## 3. DATABASE MODELS (Sequelize)

### 3.1 StaffUser (accounts)
```js
StaffUser {
  id: INTEGER PK AUTO,
  username: STRING UNIQUE,
  password: STRING (hashed bcrypt),
  fullname: STRING default '',
  position: STRING default '',
  role: ENUM('admin','hoc_vu','quan_ly','ke_toan') default 'ke_toan',
  email: STRING,
  is_active: BOOLEAN default true,
  is_superuser: BOOLEAN default false,
  date_joined: DATE
}
// Helper getters:
is_admin      → is_superuser || role==='admin'
is_hoc_vu     → role==='hoc_vu'
is_quan_ly    → role==='quan_ly'
is_ke_toan    → role==='ke_toan'
can_diem_danh → is_admin || is_hoc_vu
can_quan_ly_danh_muc → is_admin || is_quan_ly
can_quan_tri  → is_admin
```

### 3.2 Phong (quanli)
```js
Phong {
  ma_phong: STRING(3) PK,
  loai_phong: INTEGER, // 0=An, 1=Ngu
  suc_chua: INTEGER,
  gioi_tinh: INTEGER NULLABLE, // 0=Nam,1=Nu; NULL nếu phòng ăn
  sl_diem_danh: INTEGER default 1,
  sl_ho_tro: INTEGER default 1
}
// Constraint: loai_phong=0 → gioi_tinh IS NULL; loai_phong=1 → gioi_tinh NOT NULL
```

### 3.3 GiaoVien (quanli)
```js
GiaoVien {
  id: INTEGER PK AUTO,
  ho_ten: STRING(100),
  gioi_tinh: INTEGER, // 0=Nam,1=Nu
  so_dien_thoai: STRING(15) UNIQUE NULLABLE,
  nhiem_vu: INTEGER, // 0=DiemDanh,1=HoTro
  dang_lam: BOOLEAN default true,
  lich_ranh: JSONB default [] // [bool,bool,bool,bool,bool] → T2..T6
}
```

### 3.4 HocSinh (quanli)
```js
HocSinh {
  id: INTEGER PK AUTO,
  ho_ten: STRING(100),
  gioi_tinh: INTEGER, // 0=Nam,1=Nu
  lop: STRING(10),
  dang_hoc: BOOLEAN default true,
  ghi_chu: TEXT NULLABLE,
  ma_phong_an_id: FK → Phong (loai_phong=0),
  ma_phong_ngu_id: FK → Phong (loai_phong=1)
}
// Validation khi save:
// - ma_phong_an.loai_phong === 0
// - ma_phong_ngu.loai_phong === 1
// - ma_phong_ngu.gioi_tinh === gioi_tinh
// - count(HocSinh where ma_phong_ngu=x) < ma_phong_ngu.suc_chua
```

### 3.5 MuaVatDung (quanli)
```js
MuaVatDung {
  id: INTEGER PK AUTO,
  nam_hoc: STRING(10), // VD: "24-25"
  lan_mua: INTEGER default 1,
  loai_vat_dung: ENUM('CHIEU','GOI','VO_GOI'),
  so_luong: INTEGER,
  ngay_mua: DATE default NOW
}
// UNIQUE(nam_hoc, lan_mua, loai_vat_dung)
// Virtual: da_phan = sum(PhanBoVatDung.so_luong)
// Virtual: con_lai = so_luong - da_phan
```

### 3.6 PhanBoVatDung (quanli)
```js
PhanBoVatDung {
  id: INTEGER PK AUTO,
  mua_id: FK → MuaVatDung,
  phong_id: FK → Phong (loai_phong=1, phòng ngủ),
  so_luong: INTEGER
}
// UNIQUE(mua_id, phong_id)
// Validation: tong da phan + so_luong <= mua.so_luong
```

### 3.7 CauHinhGia (core)
```js
CauHinhGia {
  id: INTEGER PK AUTO,
  loai_truc: INTEGER, // 0=An,1=Ngu
  don_gia: DECIMAL(10,2),
  ngay_ap_dung: DATE default NOW,
  nguoi_cap_nhat_id: FK → StaffUser NULLABLE
}
// UNIQUE(loai_truc, ngay_ap_dung)
```

### 3.8 CauHinhHeThong (core) – Singleton pk=1
```js
CauHinhHeThong {
  id: INTEGER PK (luôn =1),
  nam_hoc: STRING(20) default '2025-2026',
  nguoi_phu_trach: STRING(100) default 'Tạ Thị Diệu Lê',
  ten_truong: STRING(200) default 'LÊ THỊ HỒNG GẤM',
  ngay_cap_nhat: DATE
}
// Dùng findOrCreate({where:{id:1}}) để lấy
```

### 3.9 DiemDanhHS (nghiepvu)
```js
DiemDanhHS {
  id: INTEGER PK AUTO,
  ma_hs_id: FK → HocSinh,
  ngay: DATE default NOW,
  diem_danh_an: INTEGER default 0, // 0=CoMat,1=Vang,2=Phep
  diem_danh_ngu: INTEGER default 0,
  ghi_chu: STRING(255) NULLABLE
}
// UNIQUE(ma_hs_id, ngay)
```

### 3.10 DiemDanhPhong (nghiepvu)
```js
DiemDanhPhong {
  id: INTEGER PK AUTO,
  ma_phong_id: FK → Phong,
  ngay: DATE default NOW,
  loai_truc: INTEGER, // 0=An,1=Ngu
  da_diem_danh: BOOLEAN default false,
  thoi_gian: DATE
}
// UNIQUE(ma_phong_id, ngay, loai_truc)
```

### 3.11 PhanCongTrucGV (nghiepvu)
```js
PhanCongTrucGV {
  id: INTEGER PK AUTO,
  ma_gv_id: FK → GiaoVien,
  ma_gv_truc_thay_id: FK → GiaoVien NULLABLE,
  ma_phong_id: FK → Phong,
  ngay: DATE,
  loai_truc: INTEGER, // 0=An,1=Ngu
  xac_nhan_truc: BOOLEAN default true
}
// Constraint: ma_gv_id != ma_gv_truc_thay_id
// UNIQUE(ma_gv_id, ngay, loai_truc, ma_phong_id)
// Validation: ma_phong.loai_phong === loai_truc
```

### 3.12 LichTrucCoDinh (nghiepvu)
```js
LichTrucCoDinh {
  id: INTEGER PK AUTO,
  ma_phong_id: FK → Phong,
  ma_gv_id: FK → GiaoVien,
  thu: INTEGER // 0=T2,1=T3,2=T4,3=T5,4=T6
}
// UNIQUE(ma_gv_id, thu, ma_phong_id)
```

---

## 4. API ENDPOINTS (Express Router)

### AUTH (src/routes/auth.js)
```
POST /login/          → login (body: username, password, remember)
POST /logout/         → logout (xóa session)
```
**Login logic:**
- Tìm user theo username, check bcrypt password
- Nếu remember=true: session 30 ngày, else: session hết khi đóng browser
- Redirect → `/` khi thành công

---

### ACCOUNTS (src/routes/accounts.js)
Tất cả require login + role=admin (trừ profile)

```
GET  /admin/taikhoan/         → render page (admin only)
GET  /api/taikhoan/           → JSON list users [admin]
POST /api/taikhoan/save/      → create/update user [admin]
POST /api/taikhoan/delete/    → delete user [admin]
POST /api/taikhoan/reset-pw/  → reset password [admin]

GET  /profile/                → render profile page [login]
POST /api/profile/save/       → update fullname/position/email [login]
POST /api/profile/send-otp/   → verify old pw → send OTP email [login]
POST /api/profile/verify-otp/ → verify OTP → change password [login]
```

**api/taikhoan/save** body:
```json
{ "id": null|number, "username": "", "fullname": "", "position": "", "role": "", "is_active": true, "password": "" }
```

**OTP flow:**
- send-otp: check current_password → generate 6-digit OTP → store in session (otp_code, otp_time, new_password) → send email
- verify-otp: check session OTP + expiry (5 phút) → set_password → update session

---

### CORE (src/routes/core.js)
```
GET /    → Dashboard [login required]
```
**Dashboard data** (JSON response hoặc render với context):
```json
{
  "stat": {
    "total": 0, "male": 0, "female": 0,
    "eating": 0, "sleeping": 0, "absent": 0,
    "absent_eat": 0, "absent_sleep": 0,
    "khoi": {
      "10": { "total":0,"male":0,"female":0,"eating":0,"sleeping":0,"phep":0,"vang":0,"eat_pct":0,"sleep_pct":0 },
      "11": {...},
      "12": {...}
    }
  }
}
```
**Logic:**
- HocSinh.dang_hoc=true → total, male, female
- DiemDanhHS.ngay=today → count eating (diem_danh_an=0), sleeping (diem_danh_ngu=0)
- absent = max(count không phải 0 ở an, count không phải 0 ở ngu)
- Per khối: filter lop LIKE '10%'/'11%'/'12%'

---

### QUANLI (src/routes/quanli.js)

#### HỌC SINH
```
GET  /admin/hocsinh/               → list page [admin|quan_ly]
POST /api/hocsinh/save/            → create/update HS [admin]
POST /api/hocsinh/:pk/delete/      → hard delete HS [admin]
POST /api/hocsinh/import/          → import CSV [admin]
```
**list**: trả toàn bộ HS serialized JSON cho client-side filter

**save** body:
```json
{ "id": null|number, "ho_ten":"", "lop":"", "gioi_tinh":0|1, "ma_phong_an":"", "ma_phong_ngu":"", "dang_hoc":true, "ghi_chu":"" }
```

**import CSV** (multipart/form-data, field=`file`):
- Cột: STT | Mã số BT | Họ và tên | GT | Lớp | Phòng ngủ | Phòng ăn | Ghi chú
- GT: Nam/Nữ/0/1/M/F
- Bỏ qua header row (cột đầu = 'stt' hoặc không phải số)
- Nếu Mã BT đã tồn tại → skip, báo lỗi
- Trả: `{ ok, total, success, skipped, errors:[{row,msg}] }`

#### GIÁO VIÊN
```
GET  /admin/giaovien/              → list page [admin|quan_ly]
POST /api/giaovien/save/           → create/update GV [admin]
POST /api/giaovien/:pk/delete/     → hard delete GV [admin]
POST /api/giaovien/:pk/ranh/       → update lich_ranh [admin]
```
**list**: paginated (30/page), có tìm kiếm ?q=, kèm ca_thang (count PhanCongTrucGV tháng hiện tại)

#### PHÒNG
```
GET  /admin/phong/                 → list page [admin|quan_ly]
POST /api/phong/save/              → create/update phong [admin]
POST /api/phong/delete/            → delete phong [admin]
```

#### CẤU HÌNH GIÁ
```
GET  /admin/cauhinh/               → page [admin|quan_ly|ke_toan]
POST /api/cauhinh/save/            → save gia an/ngu [admin|quan_ly]
POST /api/hethong/save/            → save nam_hoc/nguoi_phu_trach/ten_truong [admin|quan_ly]
```
**api/cauhinh/save** body: `{ "an": 50000, "ngu": 30000 }`
→ upsert CauHinhGia (loai_truc, ngay=today)

#### VẬT DỤNG
```
GET  /admin/vatdung/               → page [admin|quan_ly|ke_toan]
POST /api/vatdung/mua/save/        → tạo MuaVatDung [admin|quan_ly]
POST /api/vatdung/mua/delete/      → xóa [admin|quan_ly]
POST /api/vatdung/phanbo/save/     → tạo PhanBoVatDung [admin|quan_ly]
POST /api/vatdung/phanbo/delete/   → xóa [admin|quan_ly]
```

---

### NGHIEPVU (src/routes/nghiepvu.js)

#### ĐIỂM DANH
```
GET  /diemdanh/an/                  → page [admin|hoc_vu]
GET  /diemdanh/ngu/                 → page [admin|hoc_vu]
GET  /api/phong/:loai/              → list phong (loai=an|ngu) [admin|hoc_vu]
GET  /api/hocsinh/:loai/            → list hs kèm phong (loai=an|ngu) [admin|hoc_vu]
GET  /api/diemdanh/?ngay=&loai=     → get records [admin|hoc_vu]
POST /api/diemdanh/save/            → upsert records [admin|hoc_vu]
```

**api/hocsinh/:loai** response:
```json
{ "hocsinh": [{ "id","ma_so_bt","ho_ten","lop","khoi","gioi_tinh","phong_an","phong_ngu" }] }
```
khoi = parseInt(lop.slice(0,2))

**api/diemdanh/save** body:
```json
{ "loai": "an"|"ngu", "records": [{ "ma_hs":1, "ngay":"YYYY-MM-DD", "status":0|1|2, "ghi_chu":"" }] }
```
→ upsert DiemDanhHS (get_or_create by ma_hs+ngay, then update field)

#### LỊCH TRỰC
```
GET  /lichtruc/?ngay=              → view lich [login]
GET  /admin/lichtruc/?tuan=        → admin quanly [admin|quan_ly]
POST /admin/lichtruc/:pk/xoa/      → delete 1 phan cong [admin|quan_ly]
GET  /api/lichtruc/week/?tuan=     → JSON week data [admin|quan_ly]
GET  /api/lichtruc/week-public/?tuan= → JSON week data [login]
GET  /api/lichtruc/month/?thang=   → JSON month data [login]
POST /api/lichtruc/save/           → create/update PhanCongTrucGV [admin|quan_ly]
POST /api/lichtruc/delete/         → delete PhanCongTrucGV [admin|quan_ly]
GET  /api/lichtruc/export/?tuan=   → Export Excel 2 tuần [admin|quan_ly]
```

**api/lichtruc/week** response:
```json
{ "records": [{ "id","ma_gv_id","ma_gv_truc_thay_id","ma_phong_id","ngay","loai_truc","xac_nhan_truc" }], "tuan":"YYYY-MM-DD" }
```

**api/lichtruc/week-public** response (thêm):
```json
{ ..., "gv_list":[{"id","ho_ten","gioi_tinh","nhiem_vu"}], "phong_list":[{"ma","loai","gt"}], "nam_hoc","nguoi_phu_trach","ten_truong" }
```

**Export Excel** (dùng `exceljs`):
- 2 tuần liên tiếp (10 ngày T2-T6)
- Header: Ngày | PhanAn1 | PhanAn2 | ... | PhanNgu1 | ...
- Màu: header=#1e3a5f, an=fef3c7, ngu=ede9fe

#### LỊCH KHUNG CỐ ĐỊNH
```
GET  /admin/lichtruc_khung/          → page [admin|quan_ly]
POST /api/lichtruc_khung/auto/       → tự động xếp [admin|quan_ly]
POST /api/lichtruc_khung/save/       → lưu thủ công [admin|quan_ly]
POST /api/lichtruc/apply-khung/      → nạp vào tuần cụ thể [admin|quan_ly]
```

**api/lichtruc_khung/auto** logic:
1. Xóa toàn bộ LichTrucCoDinh
2. Với mỗi thứ (T2..T6):
   - Pool GV rảnh (lich_ranh[thu]=true), tách theo nhiem_vu (0=dd, 1=ht)
   - Shuffle ngẫu nhiên
   - Phòng Ăn: pick dd theo sl_diem_danh, pick ht theo sl_ho_tro (không phân biệt GT)
   - Phòng Ngủ: pick theo GT khớp phong.gioi_tinh, separate tracking
   - GV có thể vừa trực Ăn vừa trực Ngủ nhưng không 2 phòng Ngủ cùng lúc

**api/lichtruc/apply-khung** body: `{ "tuan":"YYYY-MM-DD", "force":false }`
- Với mỗi ngày T2-T6 của tuần:
  - Nếu đã có PhanCong và force=false → skip
  - Nếu force=true → delete cũ rồi insert mới
  - loai_truc = ma_phong.loai_phong

#### BÁO CÁO
```
GET  /baocao/                       → page [login]
GET  /api/baocao/diemdanh/?loai=&thang=&nam=&lop= → [login]
GET  /api/baocao/full/              → all data for chart [login]
GET  /api/baocao/luong-gv/?thang=&nam= → tính lương GV [login]
```

**api/baocao/luong-gv** logic:
- Lấy PhanCongTrucGV (xac_nhan_truc=true) theo tháng
- Lấy CauHinhGia mới nhất theo loai_truc cho tháng đó
- Gom theo GV: so_ca_an, so_ca_ngu, tong_tien

---

## 5. CẤU TRÚC THƯ MỤC NODE.JS ĐỀ XUẤT

```
Back-end/
├── server.js                 # Entry point
├── .env                      # DB creds, SESSION_SECRET, PORT
├── package.json
├── src/
│   ├── config/
│   │   ├── database.js       # Sequelize connection
│   │   └── session.js        # express-session config
│   ├── models/
│   │   ├── index.js          # Sequelize init + associations
│   │   ├── StaffUser.js
│   │   ├── Phong.js
│   │   ├── GiaoVien.js
│   │   ├── HocSinh.js
│   │   ├── MuaVatDung.js
│   │   ├── PhanBoVatDung.js
│   │   ├── CauHinhGia.js
│   │   ├── CauHinhHeThong.js
│   │   ├── DiemDanhHS.js
│   │   ├── DiemDanhPhong.js
│   │   ├── PhanCongTrucGV.js
│   │   └── LichTrucCoDinh.js
│   ├── middleware/
│   │   ├── auth.js           # loginRequired, roleRequired
│   │   └── errorHandler.js
│   ├── routes/
│   │   ├── auth.js           # /login, /logout
│   │   ├── core.js           # / (dashboard)
│   │   ├── accounts.js       # /admin/taikhoan, /api/taikhoan, /profile
│   │   ├── quanli.js         # /admin/hocsinh,giaovien,phong,cauhinh,vatdung
│   │   └── nghiepvu.js       # /diemdanh, /lichtruc, /baocao, /api/...
│   └── utils/
│       ├── password.js       # bcrypt helpers
│       └── otp.js            # OTP generate + email send (nodemailer)
```

---

## 6. DEPENDENCIES (package.json)

```json
{
  "dependencies": {
    "express": "^4.18",
    "sequelize": "^6",
    "pg": "^8",
    "pg-hstore": "^2",
    "bcryptjs": "^2.4",
    "express-session": "^1.17",
    "connect-pg-simple": "^9",
    "cors": "^2.8",
    "dotenv": "^16",
    "nodemailer": "^6",
    "exceljs": "^4",
    "multer": "^1.4",
    "csv-parse": "^5"
  }
}
```

---

## 7. SESSION CONFIG

```js
// .env
SESSION_SECRET=your-secret-key
SESSION_MAX_AGE=86400000        // 1 ngày default
SESSION_REMEMBER_AGE=2592000000 // 30 ngày khi remember

// express-session
{
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({ pool }), // lưu session vào PostgreSQL
  cookie: { httpOnly: true, maxAge: SESSION_MAX_AGE }
}
```

---

## 8. AUTH MIDDLEWARE

```js
// loginRequired
function loginRequired(req, res, next) {
  if (!req.session.userId) {
    if (req.path.startsWith('/api/'))
      return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
    return res.redirect('/login/');
  }
  next();
}

// roleRequired(...roles)
function roleRequired(...roles) {
  return async (req, res, next) => {
    const user = req.session.user; // attach full user object on login
    if (!user) { /* 401 */ }
    if (user.is_superuser || roles.includes(user.role)) return next();
    if (req.path.startsWith('/api/'))
      return res.status(403).json({ ok: false, error: 'Không có quyền' });
    return res.redirect('/');
  };
}
```

---

## 9. CONSTANTS / ENUMS

```js
const LoaiTruc = { AN: 0, NGU: 1 };
const GioiTinh = { NAM: 0, NU: 1 };
const NhiemVuGV = { DIEM_DANH: 0, HO_TRO: 1 };
const TrangThaiDiemDanh = { CO_MAT: 0, VANG: 1, PHEP: 2 };
const ThuTrongTuan = { THU_2: 0, THU_3: 1, THU_4: 2, THU_5: 3, THU_6: 4 };
const ROLE = { ADMIN: 'admin', HOC_VU: 'hoc_vu', QUAN_LY: 'quan_ly', KE_TOAN: 'ke_toan' };
```

---

## 10. GHI CHÚ QUAN TRỌNG

1. **Password**: Django dùng PBKDF2. Khi migrate sang Node.js, cần đặt lại password (bcrypt) hoặc implement PBKDF2 verify cho lần đăng nhập đầu tiên rồi re-hash.
2. **Session store**: Dùng `connect-pg-simple` để lưu session vào PostgreSQL (tương tự Django session).
3. **OTP email**: Django dùng `console backend` (in ra terminal). Node.js dùng `nodemailer` với SMTP thật hoặc mock khi dev.
4. **XLSX Export**: Dùng `exceljs` thay cho `openpyxl`. Style tương tự: freeze row 4, column A width 18.
5. **CSV Import**: Dùng `multer` nhận file upload + `csv-parse` đọc nội dung.
6. **Singleton CauHinhHeThong**: `findOrCreate({ where: { id: 1 }, defaults: {...} })`.
7. **Validation HocSinh**: Phải check loai_phong, gioi_tinh, suc_chua trước khi save.
8. **Transaction**: Các API bulk (apply-khung, import CSV) dùng `sequelize.transaction()`.
9. **CORS**: `cors({ origin: true, credentials: true })` để cho phép session cookie.
10. **Table names**: Sequelize mặc định plural. Set `tableName` thủ công để khớp Django migrations nếu dùng chung DB.
