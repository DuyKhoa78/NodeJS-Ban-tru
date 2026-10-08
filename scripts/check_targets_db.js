require('dotenv').config();
const { Sequelize } = require('sequelize');

const seq = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function main() {
  try {
    const [rows] = await seq.query(`
      SELECT id, ho_ten, lop, xmin, 
             CASE 
               WHEN current_setting('track_commit_timestamp', true) = 'on' THEN pg_xact_commit_timestamp(xmin)
               ELSE NULL 
             END as commit_time
      FROM quanli_hocsinh 
      WHERE id IN (858, 859, 860, 861, 862, 863, 864, 865, 866, 867)
      ORDER BY id ASC
    `);
    console.log('xmin and commit time:', rows);
  } catch (e) {
    console.log('Error with commit_time, falling back to xmin only:', e.message);
    const [rows] = await seq.query(`
      SELECT id, ho_ten, lop, xmin
      FROM quanli_hocsinh 
      WHERE id IN (858, 859, 860, 861, 862, 863, 864, 865, 866, 867)
      ORDER BY id ASC
    `);
    console.log('xmin values:', rows);
  }
  await seq.close();
}

main().catch(console.error);
