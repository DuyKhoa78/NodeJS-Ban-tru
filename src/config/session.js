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

// Vercel Rewrites proxy API requests → cookie trở thành first-party (cùng domain)
// Nên dùng sameSite='lax' (an toàn hơn 'none') + secure=true (HTTPS)
const isProd = process.env.NODE_ENV === 'production'
  || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase'));

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
    secure: isProd,            // true trên production (HTTPS), false trên localhost (HTTP)
    sameSite: 'lax',           // 'lax' đủ vì cookie giờ là first-party (cùng domain Vercel)
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000, // 24h mặc định
  },
};

module.exports = sessionConfig;
