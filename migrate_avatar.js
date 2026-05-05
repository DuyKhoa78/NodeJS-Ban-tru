require('dotenv').config();
const { Sequelize } = require('sequelize');

const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });

async function run() {
  try {
    await seq.query('ALTER TABLE accounts_staffuser ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL;');
    console.log('OK - Đã thêm cột avatar_url vào accounts_staffuser');
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await seq.close();
  }
}

run();
