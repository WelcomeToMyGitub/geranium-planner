// 管理员库存：localStorage 里没有库存时，用这份作为初始值。
// 改这里 = 改这台机器（以及所有人首次打开）的默认库存。
// 在页面里点「存为默认库存」会下载一个同样格式的 stock.js，覆盖本文件即可。
window.GP_ADMIN_STOCK = {
  flower: {},
  growing: {},
  seed: {}
};
