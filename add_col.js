require('dotenv').config();
const seq = require('./src/config/database');

async function run() {
  try {
    await seq.query('ALTER TABLE nghiepvu_lichtruccodinh ADD COLUMN IF NOT EXISTS nhiem_vu INTEGER NOT NULL DEFAULT 0');
    console.log('COLUMN ADDED OK');
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
