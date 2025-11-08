const { LocationManager } = require('./dist/core/cache/LocationManager.js');
const Vec3 = require('vec3');

async function testLocationManager() {
  console.log('开始测试 LocationManager...');

  // 创建 LocationManager 实例
  const locationManager = new LocationManager('test-locations.json');

  // 测试设置地标
  console.log('测试设置地标...');
  const pos1 = new Vec3(100, 64, 200);
  const location1 = locationManager.setLocation('home', pos1, '我的家', { type: 'home' });
  console.log('设置地标 home:', location1);

  const pos2 = new Vec3(50, 70, 150);
  const location2 = locationManager.setLocation('mine', pos2, '矿场', { type: 'mine' });
  console.log('设置地标 mine:', location2);

  // 测试获取地标
  console.log('测试获取地标...');
  const retrieved1 = locationManager.getLocation('home');
  console.log('获取地标 home:', retrieved1);

  // 测试更新地标
  console.log('测试更新地标...');
  const updated = locationManager.updateLocation('home', '我的新家');
  console.log('更新结果:', updated);
  console.log('更新后的地标:', locationManager.getLocation('home'));

  // 测试查找附近地标
  console.log('测试查找附近地标...');
  const center = new Vec3(80, 65, 180);
  const nearby = locationManager.findNearby(center, 50);
  console.log('附近地标:', nearby);

  // 测试搜索
  console.log('测试搜索地标...');
  const searchResults = locationManager.search('家');
  console.log('搜索结果:', searchResults);

  // 测试获取字符串描述
  console.log('测试获取字符串描述...');
  console.log(locationManager.getAllLocationsString());

  // 测试删除地标
  console.log('测试删除地标...');
  const deleted = locationManager.deleteLocation('mine');
  console.log('删除结果:', deleted);
  console.log('删除后所有地标:', locationManager.getAllLocations());

  // 强制保存
  await locationManager.forceSave();
  console.log('已保存到文件');

  console.log('LocationManager 测试完成！');
}

// 运行测试
testLocationManager().catch(console.error);
