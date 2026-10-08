require('dotenv').config();
const sequelize = require('../src/config/database');
const { GiaoVien } = require('../src/models');

const ACCOUNTS = {
  'Trần Bá Lâm': '0397854806',
  'Trần Nhật Tân': '060146415418',
  'Phan Thanh Nhật': '0931158262',
  'Bùi Thanh Toàn': '050128831239',
  'Lê Hoàng Hà': '0908345603',
  'Nguyễn Thiện Đức': '060325254656',
  'Đỗ Văn Thương': '0342184452',
  'Đỗ Ngọc Bích Vân': '060297153784',
  'Đặng Thị Yến': '060146446712',
  'Phạm Thị Thanh Hà': '0903832423',
  'Đào Thị Cẩm Hạnh': '060146399773',
  'Trần Nhật Thiên Thanh': '060310096671',
  'Trần Thị Kim Thoại': '0388706578',
  'Đinh Thị Tuyết Lan': '060253956685',
  'Mai Thị Tường Vi': '0935595079',
  'Lê Thị Huyền Nhung': '0586613647',
  'Cao Thị Mai Huệ': '060275595589',
  'Bùi Phùng Đức Anh': '060183474475',
  'Hoàng Thanh Thủy': '0387574502',
  'Trần Thị Hồng Cẩm': '060325382506',
  'Vũ Quốc Phong': '123698898888',
  'Huỳnh Đức Vịnh': '0909930164',
  'Lầu Minh Phúc': '060323335055',
  'Lý Công Thành': '060326149384',
  'Nguyễn Thị Nhung': '060962014341',
  'Nguyễn Ngọc Cẩm': '06014646453',
  'Mai Quỳnh Châu': '060326378898',
};

async function run() {
  try {
    // Xóa duplicate Nguyễn Ngọc Cẩm id 37 nếu có
    await sequelize.query('DELETE FROM "quanli_giaovien" WHERE id = 37;');

    // Phục hồi Nguyễn Ngọc Cẩm id 29
    await sequelize.query('UPDATE "quanli_giaovien" SET dang_lam = true WHERE id = 29;');

    for (const [name, stk] of Object.entries(ACCOUNTS)) {
      await sequelize.query(
        'UPDATE "quanli_giaovien" SET so_tai_khoan = :stk, dang_lam = true WHERE ho_ten = :name',
        { replacements: { stk, name } }
      );
      console.log(`Updated ${name} -> ${stk}`);
    }

    const [rows] = await sequelize.query(
      'SELECT id, ho_ten, so_tai_khoan, dang_lam, ma_bao_mat FROM "quanli_giaovien" WHERE dang_lam = true ORDER BY id'
    );
    console.log(`\nActive teachers (${rows.length}):`);
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
