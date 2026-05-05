/**
 * Script lưu ảnh đại diện cho user 'ha' lên Supabase Storage
 * Chạy: node save_avatar_ha.js <đường_dẫn_ảnh>
 * Ví dụ: node save_avatar_ha.js C:\Users\DELL\Downloads\ha.jpg
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Lấy đường dẫn ảnh từ argument
const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Thiếu đường dẫn ảnh! Dùng: node save_avatar_ha.js <path-to-image>');
  process.exit(1);
}
if (!fs.existsSync(imagePath)) {
  console.error('File không tồn tại:', imagePath);
  process.exit(1);
}

// Supabase config (đọc từ DATABASE_URL hoặc bạn tự điền)
// DATABASE_URL dạng: postgresql://postgres.PROJECT_REF:PASS@host:port/postgres
const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/postgres\.([a-z0-9]+):/);
const projectRef = match ? match[1] : null;

if (!projectRef) {
  console.error('Không đọc được project ref từ DATABASE_URL');
  process.exit(1);
}

// Supabase public URL + service role key
// Cần bổ sung SUPABASE_SERVICE_KEY vào .env
const SUPABASE_URL = `https://${projectRef}.supabase.co`;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('Thiếu SUPABASE_SERVICE_KEY trong .env');
  console.log('→ Vào Supabase Dashboard > Project Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });

async function run() {
  try {
    // Đọc file ảnh
    const fileBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase() || '.jpg';
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const fileName = `avatars/ha${ext}`;

    console.log(`Đang upload ${imagePath} → Supabase Storage bucket "avatars"...`);

    // Upload lên Supabase Storage (bucket tên "avatars")
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: true, // ghi đè nếu đã có
      });

    if (error) {
      console.error('Lỗi upload:', error.message);
      // Nếu bucket chưa tồn tại, hướng dẫn tạo
      if (error.message.includes('not found') || error.message.includes('Bucket')) {
        console.log('\n→ Bucket "avatars" chưa tồn tại. Tạo bucket trên Supabase Dashboard:');
        console.log('  Storage > New bucket > Name: avatars > Public: ON > Create bucket');
      }
      process.exit(1);
    }

    // Lấy public URL
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;
    console.log('✅ Upload thành công! URL:', publicUrl);

    // Cập nhật vào database
    const [rows] = await seq.query(
      `UPDATE accounts_staffuser SET avatar_url = :url WHERE username = 'ha' RETURNING id, username, fullname, avatar_url`,
      { replacements: { url: publicUrl } }
    );

    if (rows.length === 0) {
      console.error('Không tìm thấy user "ha" trong database!');
    } else {
      const u = rows[0];
      console.log(`✅ Đã cập nhật avatar cho user "${u.username}" (${u.fullname})`);
      console.log('   URL:', u.avatar_url);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await seq.close();
  }
}

run();
