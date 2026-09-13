const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';
let SECRET = process.env.TOKEN_SECRET;

if (!SECRET) {
  if (isProd) {
    throw new Error('FATAL: TOKEN_SECRET is required in production! Server refused to start.');
  }
  SECRET = process.env.SESSION_SECRET || 'dev-token-secret-only-xyz456';
  console.warn('⚠️ CẢNH BÁO: Chưa cấu hình TOKEN_SECRET, sử dụng fallback chỉ cho môi trường phát triển!');
}

const EFFECTIVE_SECRET = SECRET;

/**
 * Sinh token xác thực HMAC SHA-256 chứa userId, tokenVersion và hạn dùng
 * @param {number|string} userId 
 * @param {number} tokenVersion - Phiên bản token của user (bắt buộc số nguyên >= 0)
 * @param {number} expiresInMs - Mặc định 24h (86400000 ms)
 * @returns {string} token
 */
function generateToken(userId, tokenVersion = 0, expiresInMs = 86400000) {
  const versionNum = Number(tokenVersion);
  if (!Number.isInteger(versionNum) || versionNum < 0) {
    throw new Error('tokenVersion must be a non-negative integer');
  }
  const exp = Date.now() + expiresInMs;
  const payload = Buffer.from(JSON.stringify({ userId, tokenVersion: versionNum, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', EFFECTIVE_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Xác thực và giải mã token
 * @param {string} token 
 * @returns {{ userId: number|string, tokenVersion: number, exp: number } | null}
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', EFFECTIVE_SECRET).update(payload).digest('base64url');
  
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data.exp || data.exp < Date.now()) return null;
    if (!Number.isInteger(data.tokenVersion) || data.tokenVersion < 0) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
