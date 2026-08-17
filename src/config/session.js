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

// Chỉ bật secure cookie khi KHÔNG phải localhost (tức là trên Azure/Vercel production)
// NODE_ENV=production phải được set trên Azure App Service (Application Settings)
const isProd = process.env.NODE_ENV === 'production';

console.log(`🔧 Session config: secure=${isProd}, sameSite=lax, NODE_ENV=${process.env.NODE_ENV}`);

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
    secure: isProd,       // false trên localhost (HTTP), true trên Azure (HTTPS)
    sameSite: isProd ? 'none' : 'lax', // 'none' trong production để cookie được gửi đầy đủ khi HTTPS
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000,
  },
};

module.exports = sessionConfig;
