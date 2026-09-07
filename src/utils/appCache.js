const NodeCache = require('node-cache');

// Dữ liệu tĩnh (HS, phòng): TTL 5 phút để đồng bộ kịp thời khi có thay đổi
const appCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Hàm xóa cache liên quan đến dữ liệu HS/phòng (gọi sau khi save/delete/import)
function invalidateStaticCaches() {
    appCache.del(['phong_an', 'phong_ngu', 'hocsinh_full']);
}

module.exports = {
    appCache,
    invalidateStaticCaches,
};
