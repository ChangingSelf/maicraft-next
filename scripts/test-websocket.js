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
        console.log('📨 收到消息:', JSON.stringify(message, null, 2));
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

  await sleep(5000);

  // 测试2: 订阅记忆
  console.log('\n2️⃣ 测试记忆订阅...');
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      dataTypes: ['memory'],
      updateInterval: 0,
      filters: {
        memoryTypes: ['thought', 'conversation'],
      },
    }),
  );

  await sleep(5000);

  // 测试3: 查询记忆
  console.log('\n3️⃣ 测试记忆查询...');
  ws.send(
    JSON.stringify({
      type: 'memory_query',
      data: {
        memoryTypes: ['thought', 'conversation'],
        limit: 5,
      },
    }),
  );

  await sleep(5000);

  // 测试4: 添加记忆
  console.log('\n4️⃣ 测试添加记忆...');
  const testId = `test_${Date.now()}`;
  ws.send(
    JSON.stringify({
      type: 'memory_add',
      data: {
        memoryType: 'thought',
        entry: {
          content: '这是一个测试记忆',
          context: {
            importance: 'normal',
            test: true,
          },
        },
      },
    }),
  );

  await sleep(5000);

  // 测试5: 查询刚才添加的记忆
  console.log('\n5️⃣ 测试查询新记忆...');
  ws.send(
    JSON.stringify({
      type: 'memory_query',
      data: {
        memoryTypes: ['thought'],
        limit: 5,
        filters: {
          importance: 'normal',
        },
      },
    }),
  );

  await sleep(5000);

  // 测试6: 修改记忆 (如果有记忆的话)
  console.log('\n6️⃣ 测试修改记忆...');
  ws.send(
    JSON.stringify({
      type: 'memory_update',
      data: {
        memoryType: 'thought',
        id: testId, // 这个ID可能不存在，但可以测试错误处理
        updates: {
          content: '修改后的测试记忆',
        },
      },
    }),
  );

  await sleep(5000);

  // 测试7: 发送ping
  console.log('\n7️⃣ 测试心跳...');
  ws.send(
    JSON.stringify({
      type: 'ping',
      timestamp: Date.now(),
    }),
  );

  await sleep(5000);

  // 测试8: 取消订阅
  console.log('\n8️⃣ 测试取消订阅...');
  ws.send(
    JSON.stringify({
      type: 'unsubscribe',
      dataTypes: ['logs', 'memory'],
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
