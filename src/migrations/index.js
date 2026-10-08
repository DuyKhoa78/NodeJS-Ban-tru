/**
 * Versioned Migration Runner using table `_schema_migrations`
 */
const isProd = process.env.NODE_ENV === 'production';

const migrations = [
  {
    id: '001_core_tables_and_columns',
    up: async (sequelize, models) => {
      // 1. Tạo bảng nếu chưa tồn tại (chỉ sync an toàn, không alter trong prod)
      if (!isProd) {
        if (models.CauHinhNgay) await models.CauHinhNgay.sync();
        if (models.LichSuThaoTac) await models.LichSuThaoTac.sync();
        if (models.BaoCaoTruc) await models.BaoCaoTruc.sync();
        if (models.DiemDanhDraft) await models.DiemDanhDraft.sync();
      }

      // 2. Thêm các cột cốt lõi
      await sequelize.query(`
        ALTER TABLE "quanli_hocsinh" ADD COLUMN IF NOT EXISTS "ngay_vao" DATE;
        ALTER TABLE "quanli_hocsinh" ADD COLUMN IF NOT EXISTS "ngay_rut" DATE;
        ALTER TABLE "accounts_staffuser" ADD COLUMN IF NOT EXISTS "giao_vien_id" INTEGER;
        ALTER TABLE "accounts_staffuser" ADD COLUMN IF NOT EXISTS "token_version" INTEGER DEFAULT 0;
        ALTER TYPE "enum_accounts_staffuser_role" ADD VALUE IF NOT EXISTS 'giao_vien';
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "thoi_gian_diem_danh_an" TIMESTAMPTZ;
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "thoi_gian_diem_danh_ngu" TIMESTAMPTZ;
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "phuong_thuc_an" VARCHAR(20) DEFAULT 'manual';
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "phuong_thuc_ngu" VARCHAR(20) DEFAULT 'manual';
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "nguoi_diem_danh_id" INTEGER;
        ALTER TABLE "nghiepvu_diemdanhphong" ADD COLUMN IF NOT EXISTS "trang_thai_chot" VARCHAR(20) DEFAULT 'chua_chot';
        ALTER TABLE "nghiepvu_diemdanhphong" ADD COLUMN IF NOT EXISTS "ma_gv_chot_id" INTEGER;
        ALTER TABLE "nghiepvu_diemdanhphong" ADD COLUMN IF NOT EXISTS "ghi_chu_chot" TEXT;
      `).catch(err => {
        console.warn('Migration 001 columns warning:', err.message);
      });

      // 3. Đồng bộ sequences
      await sequelize.query(`
        SELECT setval('quanli_hocsinh_id_seq', COALESCE((SELECT MAX(id) FROM quanli_hocsinh), 1), true);
        SELECT setval('quanli_giaovien_id_seq', COALESCE((SELECT MAX(id) FROM quanli_giaovien), 1), true);
        SELECT setval('nghiepvu_phancongtrucgv_id_seq', COALESCE((SELECT MAX(id) FROM nghiepvu_phancongtrucgv), 1), true);
        SELECT setval('accounts_staffuser_id_seq', COALESCE((SELECT MAX(id) FROM accounts_staffuser), 1), true);
      `).catch(() => {});
    }
  },
  {
    id: '20260913_add_vsat_thuc_pham_to_baocaotruc',
    async up(sequelize) {
      await sequelize.query(`
        ALTER TABLE "nghiepvu_baocaotruc" ADD COLUMN IF NOT EXISTS "vsat_thuc_pham" TEXT;
      `).catch(() => {});
    }
  },
  {
    id: '20260914_add_ten_gv_truc_thay_to_phancongtrucgv',
    async up(sequelize) {
      await sequelize.query(`
        ALTER TABLE "nghiepvu_phancongtrucgv" ADD COLUMN IF NOT EXISTS "ten_gv_truc_thay" VARCHAR(255);
      `).catch(err => {
        console.warn('Migration 20260914_add_ten_gv_truc_thay warning:', err.message);
      });
    }
  },
  {
    id: '20260915_fix_ho_quan_thinh_to_ho_quang_thinh',
    async up(sequelize) {
      await sequelize.query(`
        UPDATE "nghiepvu_baocaotruc"
        SET "ho_ten_gv" = 'Hồ Quang Thịnh'
        WHERE "ho_ten_gv" ILIKE '%Quan Thịnh%';
      `).catch(err => {
        console.warn('Migration 20260915_fix_ho_quan_thinh_to_ho_quang_thinh warning:', err.message);
      });
    }
  },
  {
    id: '20260925_expand_ma_phong_to_10_chars',
    async up(sequelize) {
      await sequelize.query(`
        ALTER TABLE "quanli_phong" ALTER COLUMN "ma_phong" TYPE VARCHAR(10);
        ALTER TABLE "quanli_hocsinh" ALTER COLUMN "ma_phong_an_id" TYPE VARCHAR(10);
        ALTER TABLE "quanli_hocsinh" ALTER COLUMN "ma_phong_ngu_id" TYPE VARCHAR(10);
        ALTER TABLE "nghiepvu_diemdanh_draft" ALTER COLUMN "ma_phong_id" TYPE VARCHAR(10);
        ALTER TABLE "nghiepvu_diemdanhphong" ALTER COLUMN "ma_phong_id" TYPE VARCHAR(10);
        ALTER TABLE "nghiepvu_lichtruccodinh" ALTER COLUMN "ma_phong_id" TYPE VARCHAR(10);
        ALTER TABLE "nghiepvu_phancongtrucgv" ALTER COLUMN "ma_phong_id" TYPE VARCHAR(10);
        ALTER TABLE "quanli_phanbovatdung" ALTER COLUMN "phong_id" TYPE VARCHAR(10);
      `).catch(err => {
        console.warn('Migration 20260925_expand_ma_phong_to_10_chars warning:', err.message);
      });
    }
  },
  {
    id: '20260925_room_history_and_diemdanh_snapshot',
    async up(sequelize) {
      // 1. Tạo bảng quanli_lichsuphanphong
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "quanli_lichsuphanphong" (
          "id" SERIAL PRIMARY KEY,
          "ma_hs_id" INTEGER NOT NULL REFERENCES "quanli_hocsinh"("id") ON DELETE CASCADE,
          "loai_phong" INTEGER NOT NULL,
          "ma_phong_id" VARCHAR(10) REFERENCES "quanli_phong"("ma_phong") ON DELETE SET NULL,
          "tu_ngay" DATE NOT NULL,
          "den_ngay" DATE,
          "ghi_chu" TEXT,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_lspp_hs_loai" ON "quanli_lichsuphanphong"("ma_hs_id", "loai_phong", "tu_ngay");
        CREATE INDEX IF NOT EXISTS "idx_lspp_phong_loai" ON "quanli_lichsuphanphong"("ma_phong_id", "loai_phong", "tu_ngay", "den_ngay");
      `).catch(err => {
        console.warn('Migration 20260925_room_history_and_diemdanh_snapshot (table create) warning:', err.message);
      });

      // 2. Thêm cột snapshot ma_phong vào nghiepvu_diemdanhhs
      await sequelize.query(`
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "ma_phong_an_id" VARCHAR(10);
        ALTER TABLE "nghiepvu_diemdanhhs" ADD COLUMN IF NOT EXISTS "ma_phong_ngu_id" VARCHAR(10);
        CREATE INDEX IF NOT EXISTS "idx_ddhs_phong_an" ON "nghiepvu_diemdanhhs"("ma_phong_an_id", "ngay");
        CREATE INDEX IF NOT EXISTS "idx_ddhs_phong_ngu" ON "nghiepvu_diemdanhhs"("ma_phong_ngu_id", "ngay");
      `).catch(err => {
        console.warn('Migration 20260925_room_history_and_diemdanh_snapshot (columns) warning:', err.message);
      });

      // 3. Chốt lịch sử quá khứ (Backfill snapshot vào nghiepvu_diemdanhhs từ quanli_hocsinh)
      await sequelize.query(`
        UPDATE "nghiepvu_diemdanhhs" dd
        SET "ma_phong_an_id" = hs."ma_phong_an_id",
            "ma_phong_ngu_id" = hs."ma_phong_ngu_id"
        FROM "quanli_hocsinh" hs
        WHERE dd."ma_hs_id" = hs."id"
          AND (dd."ma_phong_an_id" IS NULL OR dd."ma_phong_ngu_id" IS NULL);
      `).catch(err => {
        console.warn('Migration 20260925_room_history_and_diemdanh_snapshot (backfill diemdanh) warning:', err.message);
      });

      // 4. Khởi tạo dữ liệu lịch sử phân phòng ban đầu vào quanli_lichsuphanphong
      await sequelize.query(`
        INSERT INTO "quanli_lichsuphanphong" ("ma_hs_id", "loai_phong", "ma_phong_id", "tu_ngay", "den_ngay", "ghi_chu")
        SELECT 
          id, 
          0, 
          ma_phong_an_id, 
          COALESCE(ngay_vao, '2026-08-01'::date), 
          NULL, 
          'Khởi tạo lịch sử phân phòng ăn ban đầu'
        FROM "quanli_hocsinh"
        WHERE ma_phong_an_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "quanli_lichsuphanphong" 
            WHERE ma_hs_id = quanli_hocsinh.id AND loai_phong = 0
          );

        INSERT INTO "quanli_lichsuphanphong" ("ma_hs_id", "loai_phong", "ma_phong_id", "tu_ngay", "den_ngay", "ghi_chu")
        SELECT 
          id, 
          1, 
          ma_phong_ngu_id, 
          COALESCE(ngay_vao, '2026-08-01'::date), 
          NULL, 
          'Khởi tạo lịch sử phân phòng ngủ ban đầu'
        FROM "quanli_hocsinh"
        WHERE ma_phong_ngu_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "quanli_lichsuphanphong" 
            WHERE ma_hs_id = quanli_hocsinh.id AND loai_phong = 1
          );
      `).catch(err => {
        console.warn('Migration 20260925_room_history_and_diemdanh_snapshot (backfill lichsu) warning:', err.message);
      });
    }
  },
  {
    id: '20260927_add_link_google_form_to_cauhinhhethong',
    async up(sequelize) {
      await sequelize.query(`
        ALTER TABLE "core_cauhinhhethong" ADD COLUMN IF NOT EXISTS "link_google_form" VARCHAR(500);
      `).catch(err => {
        console.warn('Migration 20260927_add_link_google_form_to_cauhinhhethong warning:', err.message);
      });
    }
  },
  {
    id: '20260928_add_performance_indexes',
    async up(sequelize) {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_diemdanhhs_ngay ON "nghiepvu_diemdanhhs" ("ngay");
        CREATE INDEX IF NOT EXISTS idx_diemdanhphong_ngay_loai ON "nghiepvu_diemdanhphong" ("ngay", "loai_truc");
        CREATE INDEX IF NOT EXISTS idx_hocsinh_phong_an_danghoc ON "quanli_hocsinh" ("ma_phong_an_id", "dang_hoc");
        CREATE INDEX IF NOT EXISTS idx_hocsinh_phong_ngu_danghoc ON "quanli_hocsinh" ("ma_phong_ngu_id", "dang_hoc");
        CREATE INDEX IF NOT EXISTS idx_phancongtrucgv_ngay_loai ON "nghiepvu_phancongtrucgv" ("ngay", "loai_truc");
        CREATE INDEX IF NOT EXISTS idx_diemdanhdraft_lookup ON "nghiepvu_diemdanhdraft" ("ngay", "loai_truc", "ma_phong_id");
        CREATE INDEX IF NOT EXISTS idx_baocaotruc_lookup ON "nghiepvu_baocaotruc" ("ngay", "ca_truc", "ma_phong");
      `).catch(err => {
        console.warn('Migration 20260928_add_performance_indexes warning:', err.message);
      });
    }
  },
  {
    id: '20260929_add_kytrucgv_and_thanhtoan_luonggv',
    async up(sequelize) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "core_kytrucgv" (
          "id" SERIAL PRIMARY KEY,
          "ten_ky" VARCHAR(255) NOT NULL,
          "tu_ngay" DATE NOT NULL,
          "den_ngay" DATE,
          "trang_thai" VARCHAR(20) NOT NULL DEFAULT 'dang_dien_ra',
          "ngay_chot" TIMESTAMPTZ,
          "nguoi_chot_id" INTEGER REFERENCES "accounts_staffuser"("id") ON DELETE SET NULL,
          "nguoi_chot_ten" VARCHAR(255),
          "tong_so_gv" INTEGER DEFAULT 0,
          "tong_ca_an" INTEGER DEFAULT 0,
          "tong_ca_ngu" INTEGER DEFAULT 0,
          "tong_tien" NUMERIC(15, 2) DEFAULT 0,
          "ghi_chu" TEXT,
          "nam_hoc" VARCHAR(20) DEFAULT '2026-2027',
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_kytrucgv_dates" ON "core_kytrucgv" ("tu_ngay", "den_ngay");
        CREATE INDEX IF NOT EXISTS "idx_kytrucgv_trangthai" ON "core_kytrucgv" ("trang_thai");

        CREATE TABLE IF NOT EXISTS "core_thanhtoan_luonggv" (
          "id" SERIAL PRIMARY KEY,
          "ky_truc_id" INTEGER NOT NULL REFERENCES "core_kytrucgv"("id") ON DELETE CASCADE,
          "ma_gv_id" INTEGER REFERENCES "quanli_giaovien"("id") ON DELETE SET NULL,
          "ten_gv" VARCHAR(255) NOT NULL,
          "so_tien" NUMERIC(15, 2) NOT NULL,
          "ngay_thanh_toan" DATE NOT NULL DEFAULT CURRENT_DATE,
          "hinh_thuc" VARCHAR(50) DEFAULT 'chuyen_khoan',
          "nguoi_thao_tac_id" INTEGER REFERENCES "accounts_staffuser"("id") ON DELETE SET NULL,
          "nguoi_thao_tac_ten" VARCHAR(255),
          "ghi_chu" TEXT,
          "trang_thai" VARCHAR(20) NOT NULL DEFAULT 'thanh_cong',
          "ly_do_huy" TEXT,
          "ngay_huy" TIMESTAMPTZ,
          "nguoi_huy_ten" VARCHAR(255),
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_thanhtoan_ky" ON "core_thanhtoan_luonggv" ("ky_truc_id");
        CREATE INDEX IF NOT EXISTS "idx_thanhtoan_gv" ON "core_thanhtoan_luonggv" ("ma_gv_id");
        CREATE INDEX IF NOT EXISTS "idx_thanhtoan_trangthai" ON "core_thanhtoan_luonggv" ("trang_thai");

        INSERT INTO "core_kytrucgv" ("ten_ky", "tu_ngay", "den_ngay", "trang_thai", "nam_hoc", "created_at", "updated_at")
        SELECT 'Kỳ 1', '2026-09-07', NULL, 'dang_dien_ra', '2026-2027', NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM "core_kytrucgv");
      `).catch(err => {
        console.warn('Migration 20260929_add_kytrucgv_and_thanhtoan_luonggv warning:', err.message);
      });
    }
  },
  {
    id: '20261006_add_phu_cap_columns_to_cauhinh',
    up: async (sequelize) => {
      await sequelize.query(`
        ALTER TABLE "core_cauhinhhethong" ADD COLUMN IF NOT EXISTS "phu_cap_truc_tbi" INTEGER DEFAULT 100000;
        ALTER TABLE "core_cauhinhhethong" ADD COLUMN IF NOT EXISTS "phu_cap_gs_ban_tru" INTEGER DEFAULT 250000;
        ALTER TABLE "core_cauhinhhethong" ADD COLUMN IF NOT EXISTS "phu_cap_gs_an" INTEGER DEFAULT 100000;
        ALTER TABLE "core_cauhinhhethong" ADD COLUMN IF NOT EXISTS "phu_cap_y_te" INTEGER DEFAULT 70000;
      `).catch(err => {
        console.warn('Migration 20261006_add_phu_cap_columns_to_cauhinh warning:', err.message);
      });
    }
  },
  {
    id: '20261007_ke_toan_tong_hop_chi_tra',
    up: async (sequelize) => {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "core_ke_toan_danh_muc_khoan_chi" (
          "id" SERIAL PRIMARY KEY,
          "ma_khoan_chi" VARCHAR(50) UNIQUE NOT NULL,
          "ten_khoan_chi" VARCHAR(255) NOT NULL,
          "loai_tinh" VARCHAR(30) NOT NULL DEFAULT 'truc_tiep',
          "don_gia_mac_dinh" NUMERIC(15, 2) DEFAULT 0,
          "tan_suat" VARCHAR(30) DEFAULT 'dinh_ky',
          "thu_tu_hien_thi" INTEGER DEFAULT 0,
          "kich_hoat" BOOLEAN DEFAULT true,
          "ghi_chu" TEXT,
          "created_at" TIMESTAMPTZ DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "core_ke_toan_ky_tong_hop" (
          "id" SERIAL PRIMARY KEY,
          "ten_ky" VARCHAR(255) NOT NULL,
          "tu_ngay" DATE NOT NULL,
          "den_ngay" DATE NOT NULL,
          "ngay_lap" DATE DEFAULT CURRENT_DATE,
          "trang_thai" VARCHAR(20) DEFAULT 'nhap',
          "ngay_chot" TIMESTAMPTZ,
          "nguoi_chot_id" INTEGER,
          "nguoi_chot_ten" VARCHAR(255),
          "snapshot_cau_hinh" JSONB,
          "tong_so_nguoi" INTEGER DEFAULT 0,
          "tong_tien" NUMERIC(15, 2) DEFAULT 0,
          "tong_da_thanh_toan" NUMERIC(15, 2) DEFAULT 0,
          "ghi_chu" TEXT,
          "created_by_id" INTEGER,
          "created_by_name" VARCHAR(255),
          "created_at" TIMESTAMPTZ DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "core_ke_toan_nguoi_nhan" (
          "id" SERIAL PRIMARY KEY,
          "ky_id" INTEGER NOT NULL REFERENCES "core_ke_toan_ky_tong_hop"("id") ON DELETE CASCADE,
          "nhan_su_id" INTEGER,
          "ma_dinh_danh" VARCHAR(50),
          "ho_ten" VARCHAR(255) NOT NULL,
          "so_tai_khoan" VARCHAR(50),
          "tong_tien" NUMERIC(15, 2) DEFAULT 0,
          "da_thanh_toan" NUMERIC(15, 2) DEFAULT 0,
          "trang_thai_tt" VARCHAR(20) DEFAULT 'chua_chi',
          "ghi_chu" TEXT,
          "stt" INTEGER DEFAULT 0,
          "created_at" TIMESTAMPTZ DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "core_ke_toan_chi_tiet_khoan_chi" (
          "id" SERIAL PRIMARY KEY,
          "nguoi_nhan_id" INTEGER NOT NULL REFERENCES "core_ke_toan_nguoi_nhan"("id") ON DELETE CASCADE,
          "ky_id" INTEGER NOT NULL REFERENCES "core_ke_toan_ky_tong_hop"("id") ON DELETE CASCADE,
          "khoan_chi_id" INTEGER REFERENCES "core_ke_toan_danh_muc_khoan_chi"("id") ON DELETE SET NULL,
          "ma_khoan_chi" VARCHAR(50) NOT NULL,
          "loai_tinh" VARCHAR(30),
          "so_ngay" NUMERIC(8, 2) DEFAULT 0,
          "don_gia" NUMERIC(15, 2) DEFAULT 0,
          "tien_nguon" NUMERIC(15, 2) DEFAULT 0,
          "tien_nhap" NUMERIC(15, 2) DEFAULT 0,
          "tien_dieu_chinh" NUMERIC(15, 2) DEFAULT 0,
          "ly_do_dieu_chinh" TEXT,
          "thanh_tien" NUMERIC(15, 2) DEFAULT 0,
          "nguon_cap_nhat" VARCHAR(50) DEFAULT 'manual',
          "ghi_chu" TEXT,
          "created_at" TIMESTAMPTZ DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "core_ke_toan_thanh_toan_chi_tiet" (
          "id" SERIAL PRIMARY KEY,
          "ky_id" INTEGER NOT NULL REFERENCES "core_ke_toan_ky_tong_hop"("id") ON DELETE CASCADE,
          "nguoi_nhan_id" INTEGER NOT NULL REFERENCES "core_ke_toan_nguoi_nhan"("id") ON DELETE CASCADE,
          "so_tien" NUMERIC(15, 2) NOT NULL,
          "ngay_chi" DATE NOT NULL,
          "hinh_thuc" VARCHAR(50) DEFAULT 'chuyen_khoan',
          "so_chung_tu" VARCHAR(100),
          "nguoi_thao_tac_id" INTEGER,
          "nguoi_thao_tac_ten" VARCHAR(255),
          "ghi_chu" TEXT,
          "created_at" TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "core_ke_toan_lich_su_thiet_lap" (
          "id" SERIAL PRIMARY KEY,
          "hanh_dong" VARCHAR(100) NOT NULL,
          "noi_dung" TEXT NOT NULL,
          "nguoi_thao_tac_id" INTEGER,
          "nguoi_thao_tac_ten" VARCHAR(255) NOT NULL,
          "chuc_vu" VARCHAR(50) DEFAULT 'Kế toán',
          "created_at" TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_kt_nguoi_nhan_ky" ON "core_ke_toan_nguoi_nhan" ("ky_id");
        CREATE INDEX IF NOT EXISTS "idx_kt_chi_tiet_nguoi_nhan" ON "core_ke_toan_chi_tiet_khoan_chi" ("nguoi_nhan_id");
        CREATE INDEX IF NOT EXISTS "idx_kt_chi_tiet_ky" ON "core_ke_toan_chi_tiet_khoan_chi" ("ky_id");
        CREATE INDEX IF NOT EXISTS "idx_kt_thanh_toan_ky" ON "core_ke_toan_thanh_toan_chi_tiet" ("ky_id");
        CREATE INDEX IF NOT EXISTS "idx_kt_thanh_toan_nn" ON "core_ke_toan_thanh_toan_chi_tiet" ("nguoi_nhan_id");

        INSERT INTO "core_ke_toan_danh_muc_khoan_chi" ("ma_khoan_chi", "ten_khoan_chi", "loai_tinh", "don_gia_mac_dinh", "tan_suat", "thu_tu_hien_thi", "kich_hoat", "ghi_chu")
        VALUES
          ('truc_phong', 'Trực phòng', 'nguon_truc_ngu', 180000, 'dinh_ky', 1, true, 'Lấy tiền từ chức năng trực ngủ hiện có'),
          ('vs_bv', 'Trực vệ sinh và bảo vệ', 'truc_tiep', 0, 'dinh_ky', 2, true, 'Nhập số tiền trực tiếp'),
          ('tiep_nhan_vd', 'Nhắn tin, tiếp nhận vật dụng, vệ sinh vật dụng', 'truc_tiep', 0, 'dinh_ky', 3, true, 'Nhập số tiền trực tiếp'),
          ('y_te', 'Y tế', 'so_ngay_don_gia', 70000, 'dinh_ky', 4, true, 'Số ngày × 70.000đ'),
          ('bt_an', 'Bán trú ăn / kiểm tra ATVSTP', 'nguon_truc_an', 100000, 'dinh_ky', 5, true, 'Lấy tiền từ chức năng trực ăn hiện có'),
          ('cap_nhat_tt', 'Cập nhật thông tin bán trú ăn, ngủ và kiểm tra vệ sinh cuối buổi', 'truc_tiep', 0, 'dinh_ky', 6, true, 'Nhập số tiền trực tiếp'),
          ('thiet_bi', 'Trực thiết bị', 'so_ngay_don_gia', 100000, 'dinh_ky', 7, true, 'Số ngày × 100.000đ'),
          ('gs_an', 'Trực kiểm tra, giám sát ăn bán trú', 'so_ngay_don_gia', 100000, 'dinh_ky', 8, true, 'Số ngày × 100.000đ'),
          ('gs_ban_tru', 'Trực giám sát bán trú', 'so_ngay_don_gia', 250000, 'dinh_ky', 9, true, 'Số ngày × 250.000đ')
        ON CONFLICT ("ma_khoan_chi") DO NOTHING;
      `).catch(err => {
        console.warn('Migration 20261007_ke_toan_tong_hop_chi_tra warning:', err.message);
      });
    }
  },
  {
    id: '20261007_update_tiep_nhan_vd_dinh_ky',
    up: async (sequelize) => {
      await sequelize.query(`
        UPDATE "core_ke_toan_danh_muc_khoan_chi"
        SET "ten_khoan_chi" = 'Nhắn tin, tiếp nhận và vệ sinh vật dụng',
            "tan_suat" = 'dinh_ky',
            "ghi_chu" = 'Nhắn tin, tiếp nhận và vệ sinh vật dụng (định kỳ hàng tháng)'
        WHERE "ma_khoan_chi" = 'tiep_nhan_vd';
      `).catch(err => {
        console.warn('Migration 20261007_update_tiep_nhan_vd_dinh_ky warning:', err.message);
      });
    }
  },
  {
    id: '20261007_add_tan_suat_to_chi_tiet_khoan_chi',
    up: async (sequelize) => {
      await sequelize.query(`
        ALTER TABLE "core_ke_toan_chi_tiet_khoan_chi"
        ADD COLUMN IF NOT EXISTS "tan_suat" VARCHAR(30) DEFAULT 'dinh_ky';
      `).catch(err => {
        console.warn('Migration 20261007_add_tan_suat_to_chi_tiet_khoan_chi warning:', err.message);
      });

      await sequelize.query(`
        UPDATE "core_ke_toan_chi_tiet_khoan_chi" ct
        SET "tan_suat" = dm."tan_suat"
        FROM "core_ke_toan_danh_muc_khoan_chi" dm
        WHERE ct."ma_khoan_chi" = dm."ma_khoan_chi"
          AND ct."tan_suat" IS NULL;
      `).catch(() => {});
    }
  },
  {
    id: '20261007_set_thien_thanh_mot_lan',
    up: async (sequelize) => {
      await sequelize.query(`
        UPDATE "core_ke_toan_chi_tiet_khoan_chi"
        SET "tan_suat" = 'mot_lan'
        WHERE "ma_khoan_chi" IN ('tiep_nhan_vd', 'cap_nhat_tt')
          AND "nguoi_nhan_id" IN (
            SELECT "id" FROM "core_ke_toan_nguoi_nhan"
            WHERE "ho_ten" ILIKE '%Thiên Thanh%' OR "ho_ten" ILIKE '%Tuyết Lan%'
          );
      `).catch(err => {
        console.warn('Migration 20261007_set_thien_thanh_mot_lan warning:', err.message);
      });
    }
  }
];

async function runMigrations(sequelize, models = {}) {
  // Tạo bảng _schema_migrations nếu chưa có
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "_schema_migrations" (
      "id" VARCHAR(255) PRIMARY KEY,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const [appliedRows] = await sequelize.query(`SELECT id FROM "_schema_migrations";`);
  const appliedSet = new Set(appliedRows.map(r => r.id));

  for (const m of migrations) {
    if (!appliedSet.has(m.id)) {
      console.log(`🚀 Executing migration: ${m.id}...`);
      await m.up(sequelize, models);
      await sequelize.query(
        `INSERT INTO "_schema_migrations" (id, applied_at) VALUES (?, NOW());`,
        { replacements: [m.id] }
      );
      console.log(`✅ Migration ${m.id} completed successfully.`);
    }
  }
}

module.exports = { runMigrations, migrations };
