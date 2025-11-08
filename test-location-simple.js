// 简单测试LocationManager的保存功能
const { LocationManager } = require('./dist/core/cache/LocationManager.js');
const Vec3 = require('vec3');
const fs = require('fs');

async function testLocationSave() {
  console.log('测试LocationManager保存功能...');

  // 创建LocationManager实例
  const locationManager = new LocationManager('test-locations.json');

  // 添加一些地标
  locationManager.setLocation('test1', new Vec3(1, 2, 3), '测试地标1');
  locationManager.setLocation('test2', new Vec3(4, 5, 6), '测试地标2');

  console.log('已设置地标，等待自动保存...');

  // 等待30秒让自动保存生效
  await new Promise(resolve => setTimeout(resolve, 31000));

  // 检查文件是否创建
  if (fs.existsSync('test-locations.json')) {
    console.log('✅ 文件已创建！');
    const content = fs.readFileSync('test-locations.json', 'utf-8');
    console.log('文件内容:', content);
  } else {
    console.log('❌ 文件未创建');
  }

  // 手动保存测试
  await locationManager.save();
  console.log('手动保存完成');

  // 清理
  if (fs.existsSync('test-locations.json')) {
    fs.unlinkSync('test-locations.json');
    console.log('清理测试文件');
  }
}

testLocationSave().catch(console.error);
