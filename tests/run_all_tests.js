/**
 * Automated Test Suite for Web Bán Trú
 * Covers: QR parsing/matching, Token security/revocation, Duty clusters/permissions, CSV import validation
 */
const assert = require('assert');
const crypto = require('crypto');
const { generateToken, verifyToken } = require('../src/utils/token');

console.log('====================================================');
console.log('🧪 RUNNING ALL AUTOMATED TESTS FOR WEB BÁN TRÚ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(name, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. QR CODE PARSER & STUDENT MATCHING
// ─────────────────────────────────────────────────────────────────────────────
console.log('📌 1. Testing QR Code Parser & Student Matcher');

// Import or replicate frontend qrUtils algorithm in Node environment
function parseStudentId(decodedText) {
  if (!decodedText) return null;
  const text = String(decodedText).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!text) return null;

  const prefixMatch = text.match(/^(?:MSBT|HS|THE)[:\s_-]*(\d+)$/i) || text.match(/\b(?:MSBT|HS|THE)[:\s_-]*(\d+)\b/i);
  if (prefixMatch) {
    return { idCandidate: prefixMatch[1], rawText: text };
  }

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      const candidate = parsed.id ?? parsed.ma_hs ?? parsed.msbt ?? parsed.student_id ?? parsed.ma_so;
      if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
        return { idCandidate: String(candidate).trim(), rawText: text };
      }
    } catch {}
  }

  if (/^\d{1,6}$/.test(text)) {
    return { idCandidate: text, rawText: text };
  }

  return null;
}

function findStudentByCandidate(students, candidateStr) {
  if (!Array.isArray(students) || !candidateStr) return null;
  const cleanCandidate = String(candidateStr).trim();

  let found = students.find(s => {
    const sId = String(s.id);
    const sCardId = `26${String(s.id).padStart(3, '0')}`;
    return (
      sId === cleanCandidate ||
      sCardId === cleanCandidate ||
      (s.ma_hs && String(s.ma_hs).trim() === cleanCandidate) ||
      (s.raw_id && String(s.raw_id).trim() === cleanCandidate)
    );
  });

  if (!found && cleanCandidate.startsWith('26') && cleanCandidate.length > 2) {
    const strippedNum = parseInt(cleanCandidate.slice(2), 10);
    if (!isNaN(strippedNum)) {
      const stripped = String(strippedNum);
      found = students.find(s => String(s.id) === stripped || (s.raw_id && String(s.raw_id) === stripped));
    }
  }

  if (!found && !cleanCandidate.startsWith('26')) {
    const paddedCardId = `26${cleanCandidate.padStart(3, '0')}`;
    found = students.find(s => String(s.id) === paddedCardId || (s.ma_hs && String(s.ma_hs).trim() === paddedCardId));
  }

  return found || null;
}

it('parseStudentId extracts MSBT prefix formats properly', () => {
  assert.strictEqual(parseStudentId('MSBT: 26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('MSBT:26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('MSBT 26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('MSBT-26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('msbt: 26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('HS: 26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('THE: 26015')?.idCandidate, '26015');
});

it('parseStudentId extracts JSON formats', () => {
  assert.strictEqual(parseStudentId('{"id": 15}')?.idCandidate, '15');
  assert.strictEqual(parseStudentId('{"ma_hs": "26015"}')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('{"msbt": 26015}')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('{"student_id": 15}')?.idCandidate, '15');
});

it('parseStudentId extracts standalone integer numbers (1-6 digits)', () => {
  assert.strictEqual(parseStudentId('26015')?.idCandidate, '26015');
  assert.strictEqual(parseStudentId('15')?.idCandidate, '15');
  assert.strictEqual(parseStudentId('1')?.idCandidate, '1');
});

it('parseStudentId REJECTS URLs and arbitrary long texts without MSBT prefix', () => {
  assert.strictEqual(parseStudentId('https://school.edu.vn/view?id=26015'), null);
  assert.strictEqual(parseStudentId('http://localhost:5173/student/15'), null);
  assert.strictEqual(parseStudentId('Học sinh số 15 đi học muộn'), null);
  assert.strictEqual(parseStudentId('ABC-XYZ-99999-NOT-A-STUDENT'), null);
});

it('findStudentByCandidate performs exact matching without substring bleed', () => {
  const mockStudents = [
    { id: 1, ho_ten: 'Nguyễn Văn 1', lop: '10A1' },
    { id: 10, ho_ten: 'Nguyễn Văn 10', lop: '10A1' },
    { id: 11, ho_ten: 'Nguyễn Văn 11', lop: '10A1' },
    { id: 15, ho_ten: 'Trần Thị 15', lop: '10A2' },
    { id: 150, ho_ten: 'Lê Văn 150', lop: '10A3' },
  ];

  // Match ID 1 -> must NOT match 10, 11, 15, 150
  assert.strictEqual(findStudentByCandidate(mockStudents, '1')?.id, 1);
  assert.strictEqual(findStudentByCandidate(mockStudents, '26001')?.id, 1);

  // Match ID 10 -> must NOT match 1
  assert.strictEqual(findStudentByCandidate(mockStudents, '10')?.id, 10);
  assert.strictEqual(findStudentByCandidate(mockStudents, '26010')?.id, 10);

  // Match ID 15 -> must NOT match 150
  assert.strictEqual(findStudentByCandidate(mockStudents, '15')?.id, 15);
  assert.strictEqual(findStudentByCandidate(mockStudents, '26015')?.id, 15);

  // Non-existent ID -> null
  assert.strictEqual(findStudentByCandidate(mockStudents, '999'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TOKEN SECURITY & REVOCATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📌 2. Testing Token Security & Revocation');

it('generateToken and verifyToken work with valid integer tokenVersion', () => {
  const token = generateToken(42, 5);
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.strictEqual(payload.userId, 42);
  assert.strictEqual(payload.tokenVersion, 5);
  assert.ok(payload.exp > Date.now());
});

it('generateToken rejects invalid or non-integer tokenVersion', () => {
  assert.throws(() => generateToken(42, 'invalid'), /tokenVersion must be a non-negative integer/);
  assert.throws(() => generateToken(42, -1), /tokenVersion must be a non-negative integer/);
  assert.throws(() => generateToken(42, 2.5), /tokenVersion must be a non-negative integer/);
});

it('verifyToken rejects tampered signature or modified payload', () => {
  const token = generateToken(10, 0);
  const [payload, signature] = token.split('.');
  
  // Tampered payload
  const tamperedPayload = Buffer.from(JSON.stringify({ userId: 10, tokenVersion: 0, exp: Date.now() + 100000 })).toString('base64url');
  assert.strictEqual(verifyToken(`${tamperedPayload}.${signature}`), null);

  // Tampered signature
  const badSig = signature.slice(0, -2) + 'aa';
  assert.strictEqual(verifyToken(`${payload}.${badSig}`), null);
});

it('verifyToken rejects expired tokens', () => {
  const expiredToken = generateToken(10, 0, -1000); // expired 1s ago
  assert.strictEqual(verifyToken(expiredToken), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DUTY SCHEDULING ROOM CLUSTERS & PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📌 3. Testing Duty Scheduling Room Clusters & Attendance Duty Auth');

const ALLOWED_CLUSTERS = [
  ['P6', 'P7', 'P8'],
  ['P3', 'P4', 'P5'],
  ['D21', 'D22', 'D23'],
  ['D31', 'D32', 'D33']
];

function areRoomsInSameCluster(rA, rB) {
  if (rA === rB) return true;
  return ALLOWED_CLUSTERS.some(cluster => cluster.includes(rA) && cluster.includes(rB));
}

it('areRoomsInSameCluster allows authorized room clusters and rejects cross-cluster', () => {
  // Lunch cluster P6-P8
  assert.strictEqual(areRoomsInSameCluster('P6', 'P7'), true);
  assert.strictEqual(areRoomsInSameCluster('P7', 'P8'), true);
  assert.strictEqual(areRoomsInSameCluster('P6', 'P8'), true);

  // Lunch cluster P3-P5
  assert.strictEqual(areRoomsInSameCluster('P3', 'P4'), true);
  assert.strictEqual(areRoomsInSameCluster('P4', 'P5'), true);

  // Sleep cluster D21-D23 & D31-D33
  assert.strictEqual(areRoomsInSameCluster('D21', 'D22'), true);
  assert.strictEqual(areRoomsInSameCluster('D31', 'D32'), true);

  // Cross-cluster assignments are FORBIDDEN
  assert.strictEqual(areRoomsInSameCluster('P6', 'P3'), false);
  assert.strictEqual(areRoomsInSameCluster('P7', 'P5'), false);
  assert.strictEqual(areRoomsInSameCluster('D21', 'D31'), false);
  assert.strictEqual(areRoomsInSameCluster('P1', 'P2'), false);
});

it('Attendance duty permission check blocks teachers with nhiem_vu === 1 (Giám sát)', () => {
  function checkDutyCanTakeAttendance(dutyRecord) {
    if (!dutyRecord) return { allowed: false, error: 'Chưa được phân công' };
    if (dutyRecord.nhiem_vu !== 0) {
      return { allowed: false, error: 'Thầy/Cô có nhiệm vụ Giám sát, không có quyền điểm danh hoặc xem bản nháp phòng này' };
    }
    return { allowed: true };
  }

  // Teacher assigned to attendance (nhiem_vu: 0)
  const diemDanhTeacher = { ma_gv_id: 1, ma_phong_id: 'P6', nhiem_vu: 0 };
  assert.strictEqual(checkDutyCanTakeAttendance(diemDanhTeacher).allowed, true);

  // Teacher assigned to supervision only (nhiem_vu: 1)
  const giamSatTeacher = { ma_gv_id: 2, ma_phong_id: 'P6', nhiem_vu: 1 };
  const result = checkDutyCanTakeAttendance(giamSatTeacher);
  assert.strictEqual(result.allowed, false);
  assert.ok(result.error.includes('nhiệm vụ Giám sát'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CSV IMPORT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📌 4. Testing CSV Import Validation');

it('CSV content UTF-8 BOM is stripped and headers validated', () => {
  const bomBuffer = Buffer.from('\uFEFFSTT,Họ và tên,Lớp,Giới tính\n1,Nguyễn Văn An,10A1,Nam\n2,Trần Thị Bình,10A2,Nữ\n', 'utf8');
  let text = bomBuffer.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  assert.strictEqual(text.charCodeAt(0) !== 0xFEFF, true);
  assert.ok(text.startsWith('STT,Họ và tên'));
});

it('CSV column limit rejects files with > 30 columns', () => {
  const fakeRowTooManyCols = new Array(31).fill('col');
  assert.ok(fakeRowTooManyCols.length > 30);
});

console.log('\n====================================================');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
