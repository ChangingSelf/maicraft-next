/**
 * WebSocket API测试脚本
 * 用于测试Maicraft-Next的WebSocket接口
 */

const WebSocket = require('ws');

// 配置
const WS_URL = 'ws://localhost:25114/ws';

// 测试函数
async function testWebSocketAPI() {
  console.log('🔌 开始测试WebSocket API...');

  try {
    // 1. 建立连接
    console.log('📡 连接到WebSocket服务器...');
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('✅ WebSocket连接成功');
      runTests(ws);
    });

    ws.on('message', data => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 收到消息:', message);
      } catch (error) {
        console.log('📨 收到原始消息:', data.toString());
      }
    });

    ws.on('error', error => {
      console.error('❌ WebSocket错误:', error.message);
    });

    ws.on('close', (code, reason) => {
      console.log('🔌 连接关闭:', code, reason.toString());
    });
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
async function runTests(ws) {
  console.log('\n🧪 开始运行测试...');

  // 等待连接稳定
  await sleep(1000);

  // 测试1: 订阅日志
  console.log('\n1️⃣ 测试日志订阅...');
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      dataTypes: ['logs'],
      updateInterval: 0,
      filters: {
        levels: ['INFO', 'ERROR'],
      },
    }),
  );

  await sleep(20000);

  // 测试2: 发送ping
  console.log('\n2️⃣ 测试心跳...');
  ws.send(
    JSON.stringify({
      type: 'ping',
      timestamp: Date.now(),
    }),
  );

  await sleep(20000);

  // 测试3: 取消订阅
  console.log('\n3️⃣ 测试取消订阅...');
  ws.send(
    JSON.stringify({
      type: 'unsubscribe',
      dataTypes: ['logs'],
    }),
  );

  await sleep(2000);

  // 关闭连接
  console.log('\n🔚 关闭连接...');
  ws.close();

  console.log('✅ 测试完成');
}

// 工具函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行测试
if (require.main === module) {
  testWebSocketAPI().catch(console.error);
}

module.exports = { testWebSocketAPI };
