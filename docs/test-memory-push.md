# 记忆推送功能测试指南

## 测试前准备

1. 确保已应用所有修复（见 `fix-memory-push.md`）
2. 重新启动 Maicraft-Next 服务器
3. 确保 WebSocket 服务器正常运行在 `ws://localhost:25114/ws`

## 测试步骤

### 方式一：使用测试脚本

```bash
# 在 maicraft-next 目录下运行
node scripts/test-websocket.js
```

脚本会自动：
1. ✅ 连接到 WebSocket 服务器
2. ✅ 订阅 'memory' 数据类型
3. ✅ 添加测试记忆
4. ✅ 等待并显示推送的记忆消息

### 方式二：使用 Web UI

1. 启动 `maicraft-web-ui` 前端项目
2. 打开记忆查看器页面
3. 观察是否实时收到新记忆

### 方式三：手动测试

使用任何 WebSocket 客户端（如 `wscat`）：

```bash
# 安装 wscat
npm install -g wscat

# 连接到服务器
wscat -c ws://localhost:25114/ws

# 订阅记忆数据
> {"type": "subscribe", "dataTypes": ["memory"]}

# 等待接收推送消息
```

## 预期结果

### 1. 连接成功

```json
{
  "type": "welcome",
  "message": "连接成功"
}
```

### 2. 订阅成功

```json
{
  "type": "subscribe_response",
  "success": true,
  "message": "订阅成功",
  "dataTypes": ["memory"]
}
```

### 3. 收到记忆推送

当 AI 代理记录新记忆时，应该收到：

```json
{
  "type": "memory_push",
  "timestamp": 1699435200000,
  "data": {
    "memoryType": "thought",
    "entry": {
      "id": "1699435200000_abc123",
      "content": "这是一个思考内容",
      "context": {},
      "timestamp": 1699435200000
    }
  }
}
```

## 检查日志

### 成功的日志输出

启动时应该看到：

```
✅ WebSocket服务器启动完成
🧠 记忆数据提供器已初始化
📡 WebSocket服务器已连接到记忆管理器 { serverExists: true, hasMemoryDataProvider: true }
```

记录记忆时应该看到：

```
📤 推送记忆: thought - 1699435200000_abc123
```

### 失败的日志输出

如果看到以下警告，说明推送失败：

```
❌ WebSocket服务器未设置，无法推送思考记忆
```
或
```
❌ memoryDataProvider 未初始化，无法推送思考记忆
```

## 故障排查

### 问题 1: 连接失败

**症状：** 无法连接到 `ws://localhost:25114/ws`

**解决方案：**
1. 检查 WebSocket 服务器是否启动
2. 检查端口 25114 是否被占用
3. 查看日志中的错误信息

### 问题 2: 订阅成功但收不到推送

**症状：** 订阅返回成功，但没有收到 `memory_push` 消息

**检查清单：**
1. ✅ 确认启动顺序已修正（WebSocket 服务器在 Agent 之前启动）
2. ✅ 检查日志中是否有 `📡 WebSocket服务器已连接到记忆管理器`
3. ✅ 确认 `hasMemoryDataProvider: true`
4. ✅ 检查日志中是否有 `📤 推送记忆` 消息

### 问题 3: 推送消息不完整

**症状：** 收到推送但数据不完整或格式错误

**检查：**
1. 查看 `MemoryDataProvider.pushMemory()` 的实现
2. 检查 `broadcastToSubscribed()` 是否正常工作
3. 查看客户端解析 JSON 是否正确

## 性能测试

测试大量记忆推送时的性能：

```javascript
// 在浏览器控制台或 Node.js 中
const ws = new WebSocket('ws://localhost:25114/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    dataTypes: ['memory']
  }));
};

let count = 0;
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'memory_push') {
    count++;
    console.log(`收到第 ${count} 条记忆推送`);
  }
};
```

## 成功标准

✅ 所有测试通过的标准：

1. WebSocket 连接成功建立
2. 订阅 'memory' 数据类型成功
3. AI 代理记录记忆时，客户端实时收到推送
4. 推送消息格式正确，包含完整的记忆数据
5. 所有四种记忆类型（thought, conversation, decision, experience）都能正确推送
6. 日志中没有推送失败的警告信息

## 相关文档

- [修复说明](./fix-memory-push.md)
- [记忆 API 文档](./api/memory.md)
- [WebSocket API 文档](./api/websocket.md)

