/**
 * Xóa dữ liệu BaoCaoTruc (form đã nộp) từ 23:00 ngày 14/09/2026 đến hiện tại
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Op } = require('sequelize');
const { sequelize, BaoCaoTruc } = require('../src/models');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Ket noi DB thanh cong');

        const fromTime = new Date('2026-09-14T23:00:00+07:00');
        console.log(`Tim ban ghi co created_at >= ${fromTime.toISOString()} (23h ngay 14/09/2026 VN)`);

        const records = await BaoCaoTruc.findAll({
            where: { created_at: { [Op.gte]: fromTime } },
            order: [['created_at', 'ASC']],
        });

        if (records.length === 0) {
            console.log('Khong tim thay ban ghi nao.');
            process.exit(0);
        }

        console.log(`Tim thay ${records.length} ban ghi se bi xoa:`);
        records.forEach((r, i) => {
            const d = r.dataValues;
            console.log(`  ${i + 1}. [ID=${d.id}] Ngay=${d.ngay} | Ca=${d.ca_truc === 0 ? 'An' : d.ca_truc === 1 ? 'Ngu' : 'GS'} | Phong=${d.ma_phong} | GV=${d.ho_ten_gv} | Luc=${d.created_at}`);
        });

        const deleted = await BaoCaoTruc.destroy({
            where: { created_at: { [Op.gte]: fromTime } },
        });

        console.log(`Da xoa thanh cong ${deleted} ban ghi.`);
        process.exit(0);
    } catch (err) {
        console.error('Loi:', err.message);
        process.exit(1);
    }
})();
