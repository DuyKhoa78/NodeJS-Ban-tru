const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'bantru-secret';

/**
 * Sinh token xác thực HMAC SHA-256 chứa userId và hạn dùng
 * @param {number|string} userId 
 * @param {number} expiresInMs - Mặc định 24h (86400000 ms)
 * @returns {string} token
 */
function generateToken(userId, expiresInMs = 86400000) {
  const exp = Date.now() + expiresInMs;
  const payload = Buffer.from(JSON.stringify({ userId, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Xác thực và giải mã token
 * @param {string} token 
 * @returns {{ userId: number|string, exp: number } | null}
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null; // Đã hết hạn
    return data;
  } catch {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
