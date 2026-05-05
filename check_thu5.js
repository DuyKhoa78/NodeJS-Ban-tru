require('dotenv').config();
const { Sequelize } = require('sequelize');
const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });

async function run() {
  try {
    // Thứ 5 tuần này
    const ngay = '2026-05-07';
    const [r] = await seq.query(
      `SELECT COUNT(*) as cnt FROM nghiepvu_phancongtrucgv WHERE ngay = '${ngay}'`
    );
    console.log(`Thứ 5 (${ngay}): ${r[0].cnt} bản ghi PhanCong`);

    // Kiểm tra hôm nay (Thứ 4)
    const today = '2026-05-06';
    const [r2] = await seq.query(
      `SELECT COUNT(*) as cnt FROM nghiepvu_phancongtrucgv WHERE ngay = '${today}'`
    );
    console.log(`Hôm nay (${today}): ${r2[0].cnt} bản ghi PhanCong`);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await seq.close();
  }
}
run();
