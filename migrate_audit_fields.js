require('dotenv').config();
const sequelize = require('./src/config/database');

/**
 * Migration: Thêm audit fields vào bảng nghiepvu_phancongtrucgv
 * - ngay_cap_nhat: TIMESTAMPTZ
 * - nguoi_cap_nhat_id: INTEGER (FK → accounts_staffuser)
 * - ly_do_chinh_sua: VARCHAR(255)
 */
async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối DB thành công');

    // Thêm cột ngay_cap_nhat
    await sequelize.query(`
      ALTER TABLE nghiepvu_phancongtrucgv
      ADD COLUMN IF NOT EXISTS ngay_cap_nhat TIMESTAMPTZ NULL;
    `);
    console.log('✅ Thêm cột ngay_cap_nhat');

    // Thêm cột nguoi_cap_nhat_id
    await sequelize.query(`
      ALTER TABLE nghiepvu_phancongtrucgv
      ADD COLUMN IF NOT EXISTS nguoi_cap_nhat_id INTEGER NULL
        REFERENCES accounts_staffuser(id) ON DELETE SET NULL;
    `);
    console.log('✅ Thêm cột nguoi_cap_nhat_id');

    // Thêm cột ly_do_chinh_sua
    await sequelize.query(`
      ALTER TABLE nghiepvu_phancongtrucgv
      ADD COLUMN IF NOT EXISTS ly_do_chinh_sua VARCHAR(255) NULL;
    `);
    console.log('✅ Thêm cột ly_do_chinh_sua');

    // Tạo index cho ngay_cap_nhat (để truy vấn audit log nhanh hơn)
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_phancongtrucgv_audit
      ON nghiepvu_phancongtrucgv (ngay_cap_nhat DESC)
      WHERE ngay_cap_nhat IS NOT NULL;
    `);
    console.log('✅ Tạo index audit log');

    console.log('\n🎉 Migration hoàn thành!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi migration:', err.message);
    process.exit(1);
  }
}

run();
