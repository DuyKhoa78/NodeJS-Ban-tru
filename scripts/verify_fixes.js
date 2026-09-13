const http = require('http');

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed = body;
        try {
          parsed = JSON.parse(body);
        } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING VERIFICATION SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}. Detail: ${detail}`);
      failed++;
    }
  }

  try {
    // Test 1: Health & Helmet Headers
    const resHealth = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/health',
      method: 'GET',
    });
    assert('Health endpoint is ready', resHealth.statusCode === 200 && resHealth.body?.ready === true, JSON.stringify(resHealth.body));
    assert('Helmet headers present (x-content-type-options)', resHealth.headers['x-content-type-options'] === 'nosniff');

    // Test 2: P0.2 - /api/the-ban-tru/danh-sach requires authentication
    const resStudentCards = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/the-ban-tru/danh-sach',
      method: 'GET',
    });
    assert('Public QR student list is protected (returns 401)', resStudentCards.statusCode === 401, `Status: ${resStudentCards.statusCode}`);

    // Test 3: P0.3 - Webhook without secret returns 403
    const resWebhookNoSecret = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/webhook/google-form-baocao',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { 'Họ và tên GV': 'Test', 'Phòng': 'P1' });
    assert('Webhook rejects request without secret (returns 403)', resWebhookNoSecret.statusCode === 403, `Status: ${resWebhookNoSecret.statusCode}`);

    // Test 4: Webhook with invalid secret returns 403
    const resWebhookBadSecret = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/webhook/google-form-baocao',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': 'wrong-secret-value-12345',
      },
    }, { 'Họ và tên GV': 'Test', 'Phòng': 'P1' });
    assert('Webhook rejects invalid secret (returns 403)', resWebhookBadSecret.statusCode === 403, `Status: ${resWebhookBadSecret.statusCode}`);

    // Test 5: Webhook with valid secret but impossible calendar date (e.g. 31/02/2026) returns 400
    require('dotenv').config();
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const resWebhookBadDate = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/webhook/google-form-baocao',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': webhookSecret,
      },
    }, {
      'Họ và tên GV': 'Test',
      'Phòng': 'P1',
      'thoi_gian_nop': '31/02/2026 11:30:00',
    });
    assert('Webhook rejects impossible calendar date 31/02 (returns 400)', resWebhookBadDate.statusCode === 400, `Status: ${resWebhookBadDate.statusCode}, Body: ${JSON.stringify(resWebhookBadDate.body)}`);

    // Test 6: CSRF Origin Blocking on POST
    const resCsrf = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/accounts/login/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://malicious-attacker-site.com',
      },
    }, { username: 'admin', password: 'password' });
    assert('CSRF check blocks untrusted Origin on mutation (returns 403)', resCsrf.statusCode === 403, `Status: ${resCsrf.statusCode}`);

    // Test 7: Rate limit headers on API
    const resRate = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/public/system-status/',
      method: 'GET',
    });
    assert('Rate limit headers active', !!resRate.headers['ratelimit-limit'] || !!resRate.headers['x-ratelimit-limit'], JSON.stringify(resRate.headers));

    console.log('\n--- VERIFICATION RESULT ---');
    console.log(`Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution failed with error:', err);
    process.exit(1);
  }
}

runTests();
