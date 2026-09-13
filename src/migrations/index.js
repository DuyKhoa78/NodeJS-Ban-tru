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
