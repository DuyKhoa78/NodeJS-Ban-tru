const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

const sessionConfig = {
  store: new PgSession({
    pool,
    tableName: 'session', // bảng lưu session trên Supabase
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'bantru-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
};

module.exports = sessionConfig;
