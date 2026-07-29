const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('⚠️  PgSession Pool Error:', err.message);
});

// Luôn bật Secure + SameSite=None vì Frontend (Vercel) và Backend (Azure) khác domain
// Trình duyệt sẽ chặn cookie cross-origin nếu thiếu 2 flag này
const sessionConfig = {
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'bantru-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,           // BẮT BUỘC để SameSite=None hoạt động
    sameSite: 'none',       // BẮT BUỘC cho cross-origin (Vercel ↔ Azure)
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000, // 24h mặc định
  },
};

module.exports = sessionConfig;
