require('dotenv').config();
const { sequelize, DiemDanhHS, DiemDanhPhong, DiemDanhDraft, HocSinh, Phong } = require('../src/models');
const { Op } = require('sequelize');

(async () => {
    const t = await sequelize.transaction();
    try {
        console.log('=== BẮT ĐẦU CHUYỂN CÁC PHÒNG ĐÃ LƯU ĐIỂM DANH SANG ĐÃ CHỐT (ĐẾN 23H NGÀY 16/09/2026) ===\n');

        const dates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-14', '2026-09-15', '2026-09-16'];
        let totalChotAn = 0;
        let totalChotNgu = 0;

        for (const date of dates) {
            console.log(`\n========================================`);
            console.log(`Xử lý ngày: ${date}`);

            // ─────────────────────────────────────────────────────────────
            // 1. CA ĂN (loai_truc = 0)
            // ─────────────────────────────────────────────────────────────
            const studentsWithAn = await DiemDanhHS.findAll({
                where: {
                    ngay: date,
                    diem_danh_an: { [Op.ne]: null }
                },
                include: [{ model: HocSinh, as: 'hoc_sinh', attributes: ['id', 'ho_ten', 'lop', 'ma_phong_an_id'] }],
                raw: true
            });

            // Gom nhóm học sinh theo phòng ăn
            const anRooms = {};
            studentsWithAn.forEach(s => {
                const r = s['hoc_sinh.ma_phong_an_id'];
                if (r) {
                    if (!anRooms[r]) anRooms[r] = [];
                    anRooms[r].push({
                        id: s.ma_hs_id,
                        ho_ten: s['hoc_sinh.ho_ten'],
                        lop: s['hoc_sinh.lop'],
                        status: s.diem_danh_an
                    });
                }
            });

            const anRoomIds = Object.keys(anRooms);
            for (const roomId of anRoomIds) {
                const existing = await DiemDanhPhong.findOne({
                    where: { ngay: date, loai_truc: 0, ma_phong_id: roomId }
                });

                if (!existing || existing.trang_thai_chot !== 'da_chot' || !existing.da_diem_danh) {
                    const chotTime = (date === '2026-09-16')
                        ? new Date('2026-09-16T23:00:00+07:00')
                        : new Date(`${date}T11:30:00+07:00`);

                    await DiemDanhPhong.upsert({
                        ma_phong_id: roomId,
                        ngay: date,
                        loai_truc: 0,
                        da_diem_danh: true,
                        thoi_gian: chotTime,
                        trang_thai_chot: 'da_chot',
                        ma_gv_chot_id: 1,
                        ghi_chu_chot: 'Chốt điểm danh phòng thành công'
                    }, { transaction: t });

                    await DiemDanhDraft.upsert({
                        ngay: date,
                        loai_truc: 0,
                        ma_phong_id: roomId,
                        ma_gv_id: 1,
                        danh_sach_hs: anRooms[roomId],
                        is_chot: true,
                        updated_at: chotTime
                    }, { transaction: t });

                    // Cập nhật thoi_gian_diem_danh_an nếu đang null
                    await DiemDanhHS.update(
                        { thoi_gian_diem_danh_an: chotTime },
                        {
                            where: {
                                ngay: date,
                                ma_hs_id: { [Op.in]: anRooms[roomId].map(x => x.id) },
                                thoi_gian_diem_danh_an: null
                            },
                            transaction: t
                        }
                    );

                    console.log(`  [Ca Ăn] Đã chuyển phòng ${roomId.padEnd(5)} (${anRooms[roomId].length} HS) sang ĐÃ CHỐT lúc ${chotTime.toLocaleTimeString('vi-VN')}`);
                    totalChotAn++;
                } else {
                    console.log(`  [Ca Ăn] Phòng ${roomId.padEnd(5)} đã chốt từ trước (${existing.trang_thai_chot})`);
                }
            }

            // ─────────────────────────────────────────────────────────────
            // 2. CA NGỦ (loai_truc = 1)
            // ─────────────────────────────────────────────────────────────
            const studentsWithNgu = await DiemDanhHS.findAll({
                where: {
                    ngay: date,
                    diem_danh_ngu: { [Op.ne]: null }
                },
                include: [{ model: HocSinh, as: 'hoc_sinh', attributes: ['id', 'ho_ten', 'lop', 'ma_phong_ngu_id'] }],
                raw: true
            });

            const nguRooms = {};
            studentsWithNgu.forEach(s => {
                const r = s['hoc_sinh.ma_phong_ngu_id'];
                if (r) {
                    if (!nguRooms[r]) nguRooms[r] = [];
                    nguRooms[r].push({
                        id: s.ma_hs_id,
                        ho_ten: s['hoc_sinh.ho_ten'],
                        lop: s['hoc_sinh.lop'],
                        status: s.diem_danh_ngu
                    });
                }
            });

            const nguRoomIds = Object.keys(nguRooms);
            for (const roomId of nguRoomIds) {
                const existing = await DiemDanhPhong.findOne({
                    where: { ngay: date, loai_truc: 1, ma_phong_id: roomId }
                });

                if (!existing || existing.trang_thai_chot !== 'da_chot' || !existing.da_diem_danh) {
                    const chotTime = (date === '2026-09-16')
                        ? new Date('2026-09-16T15:53:00+07:00')
                        : new Date(`${date}T12:00:00+07:00`);

                    await DiemDanhPhong.upsert({
                        ma_phong_id: roomId,
                        ngay: date,
                        loai_truc: 1,
                        da_diem_danh: true,
                        thoi_gian: chotTime,
                        trang_thai_chot: 'da_chot',
                        ma_gv_chot_id: 1,
                        ghi_chu_chot: 'Chốt điểm danh phòng thành công'
                    }, { transaction: t });

                    await DiemDanhDraft.upsert({
                        ngay: date,
                        loai_truc: 1,
                        ma_phong_id: roomId,
                        ma_gv_id: 1,
                        danh_sach_hs: nguRooms[roomId],
                        is_chot: true,
                        updated_at: chotTime
                    }, { transaction: t });

                    // Cập nhật thoi_gian_diem_danh_ngu nếu đang null
                    await DiemDanhHS.update(
                        { thoi_gian_diem_danh_ngu: chotTime },
                        {
                            where: {
                                ngay: date,
                                ma_hs_id: { [Op.in]: nguRooms[roomId].map(x => x.id) },
                                thoi_gian_diem_danh_ngu: null
                            },
                            transaction: t
                        }
                    );

                    console.log(`  [Ca Ngủ] Đã chuyển phòng ${roomId.padEnd(5)} (${nguRooms[roomId].length} HS) sang ĐÃ CHỐT lúc ${chotTime.toLocaleTimeString('vi-VN')}`);
                    totalChotNgu++;
                } else {
                    console.log(`  [Ca Ngủ] Phòng ${roomId.padEnd(5)} đã chốt từ trước (${existing.trang_thai_chot})`);
                }
            }
        }

        await t.commit();
        console.log('\n========================================');
        console.log(`HOÀN TẤT! Tổng số phòng chuyển sang ĐÃ CHỐT:`);
        console.log(`- Ca Ăn: ${totalChotAn} phòng`);
        console.log(`- Ca Ngủ: ${totalChotNgu} phòng`);
        console.log(`- Tổng cộng: ${totalChotAn + totalChotNgu} phòng`);
    } catch (err) {
        await t.rollback();
        console.error('LỖI KHI CẬP NHẬT CHỐT PHÒNG:', err);
    }
    process.exit(0);
})();
