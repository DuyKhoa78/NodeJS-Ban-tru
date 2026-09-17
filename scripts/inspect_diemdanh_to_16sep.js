require('dotenv').config();
const { sequelize, DiemDanhHS, DiemDanhPhong, HocSinh, Phong } = require('../src/models');
const { Op } = require('sequelize');

(async () => {
    try {
        const hsDates = await DiemDanhHS.findAll({
            attributes: ['ngay', [sequelize.fn('count', sequelize.col('id')), 'cnt']],
            group: ['ngay'],
            order: [['ngay', 'ASC']],
            raw: true
        });
        console.log('=== DIEM DANH HS DATES SUMMARY ===');
        console.table(hsDates);

        for (const item of hsDates) {
            const date = item.ngay;
            if (date > '2026-09-16') continue;

            const anCount = await DiemDanhHS.count({
                where: { ngay: date, diem_danh_an: { [Op.ne]: null } }
            });
            const nguCount = await DiemDanhHS.count({
                where: { ngay: date, diem_danh_ngu: { [Op.ne]: null } }
            });

            console.log('\n========================================');
            console.log(`DATE: ${date} | HS có điểm danh ĂN: ${anCount} | HS có điểm danh NGỦ: ${nguCount}`);

            // Ca An (loai_truc: 0)
            if (anCount > 0) {
                const studentsWithAn = await DiemDanhHS.findAll({
                    where: { ngay: date, diem_danh_an: { [Op.ne]: null } },
                    include: [{ model: HocSinh, as: 'hoc_sinh', attributes: ['ma_phong_an_id'] }],
                    raw: true
                });
                const roomCounts = {};
                studentsWithAn.forEach(s => {
                    const r = s['hoc_sinh.ma_phong_an_id'] || 'KHONG_PHONG';
                    roomCounts[r] = (roomCounts[r] || 0) + 1;
                });

                console.log(`-- Ca ĂN (loai_truc = 0) --`);
                for (const [roomId, count] of Object.entries(roomCounts)) {
                    const dp = await DiemDanhPhong.findOne({
                        where: { ngay: date, loai_truc: 0, ma_phong_id: roomId }
                    });
                    const statusStr = dp ? `${dp.trang_thai_chot} (da_diem_danh: ${dp.da_diem_danh}, time: ${dp.thoi_gian})` : 'CHƯA CÓ TRONG DiemDanhPhong';
                    console.log(`   Phòng ${roomId.padEnd(5)}: ${String(count).padStart(3)} HS có điểm => Status: ${statusStr}`);
                }
            }

            // Ca Ngu (loai_truc: 1)
            if (nguCount > 0) {
                const studentsWithNgu = await DiemDanhHS.findAll({
                    where: { ngay: date, diem_danh_ngu: { [Op.ne]: null } },
                    include: [{ model: HocSinh, as: 'hoc_sinh', attributes: ['ma_phong_ngu_id'] }],
                    raw: true
                });
                const roomCounts = {};
                studentsWithNgu.forEach(s => {
                    const r = s['hoc_sinh.ma_phong_ngu_id'] || 'KHONG_PHONG';
                    roomCounts[r] = (roomCounts[r] || 0) + 1;
                });

                console.log(`-- Ca NGỦ (loai_truc = 1) --`);
                for (const [roomId, count] of Object.entries(roomCounts)) {
                    const dp = await DiemDanhPhong.findOne({
                        where: { ngay: date, loai_truc: 1, ma_phong_id: roomId }
                    });
                    const statusStr = dp ? `${dp.trang_thai_chot} (da_diem_danh: ${dp.da_diem_danh}, time: ${dp.thoi_gian})` : 'CHƯA CÓ TRONG DiemDanhPhong';
                    console.log(`   Phòng ${roomId.padEnd(5)}: ${String(count).padStart(3)} HS có điểm => Status: ${statusStr}`);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
