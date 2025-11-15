# 记忆推送功能修复

## 问题描述

记忆 API 不会推送任何消息到 WebSocket 客户端。当 AI 代理记录新的思考、对话、决策或经验时，客户端无法实时收到这些更新。

## 根本原因

有两个关键问题导致记忆推送失败：

### 问题 1: WebSocketServer 未暴露 memoryDataProvider

`MemoryManager` 尝试通过 `this.webSocketServer.memoryDataProvider?.pushMemory()` 推送记忆更新，但 `WebSocketServer` 类没有暴露 `memoryDataProvider` 属性，导致访问失败。

### 问题 2: 启动顺序错误 ⚠️ **关键问题**

在 `main.ts` 的 `initialize()` 方法中，启动顺序错误：

1. `startAgent()` - 尝试设置 WebSocket 服务器到 Agent（但此时 websocketServer 是 undefined）
2. `startWebSocketServer()` - WebSocket 服务器才在这里创建

这导致 Agent 的 MemoryManager 永远无法获得 WebSocket 服务器的引用！

### 代码调用链

**问题前：**

1. `MemoryManager.recordThought()` → 调用 `this.webSocketServer.memoryDataProvider?.pushMemory()`
2. `WebSocketServer` 没有暴露 `memoryDataProvider` 属性 ❌
3. `pushMemory()` 调用失败，记忆更新不会推送

## 修复方案

### 1. 修正启动顺序（最关键）

**在 `main.ts` 中调整初始化顺序：**

```typescript
async initialize(): Promise<void> {
  // ...
  await this.initializeCore();

  // 🔧 修复：WebSocket服务器必须在Agent启动之前启动
  await this.startWebSocketServer();

  await this.initializeAgent();
  await this.startAgent();

  // ...
}
```

### 2. 在 `WebSocketServer.ts` 中添加公共属性

```typescript
export class WebSocketServer {
  // ...
  public memoryDataProvider?: any; // 暴露给MemoryManager使用

  constructor() {
    this.config = this.loadConfig();
    this.subscriptionManager = new SubscriptionManager(this);
    this.messageHandler = new MessageHandler(this.subscriptionManager, this);
    this.logDataProvider = new LogDataProvider(this);
    // 暴露 memoryDataProvider，以便 MemoryManager 可以访问
    this.memoryDataProvider = this.messageHandler.getMemoryDataProvider();
  }
}
```

### 3. 在 `MessageHandler.ts` 中添加 getter 方法

```typescript
/**
 * 获取记忆数据提供器
 */
getMemoryDataProvider(): MemoryDataProvider {
  return this.memoryDataProvider;
}
```

### 4. 更新 `setMemoryManager` 方法

```typescript
setMemoryManager(memoryManager: any): void {
  this.messageHandler.setMemoryManager(memoryManager);
  // 确保 memoryDataProvider 引用是最新的
  this.memoryDataProvider = this.messageHandler.getMemoryDataProvider();
  this.logger.info('🧠 记忆管理器已设置到WebSocket服务器');
}
```

## 修复后的工作流程

**修复后：**

1. `MemoryManager.recordThought()` → 调用 `this.webSocketServer.memoryDataProvider.pushMemory('thought', entry)`
2. `MemoryDataProvider.pushMemory()` → 调用 `this.server.broadcastToSubscribed('memory', message)` ✅
3. `WebSocketServer.broadcastToSubscribed()` → 发送消息给所有订阅了 'memory' 类型的客户端 ✅

### 5. 添加调试日志

**在 `MemoryManager.ts` 中添加详细日志：**

- `setWebSocketServer()` - 记录 WebSocket 服务器和 memoryDataProvider 的存在状态
- `recordThought()` - 如果推送失败，记录警告信息

**在 `MemoryDataProvider.ts` 中：**

- 将 `pushMemory()` 的日志级别从 DEBUG 改为 INFO，方便调试

## 影响的文件

- ✅ `src/main.ts` - **修正启动顺序（最关键）**
- ✅ `src/api/WebSocketServer.ts` - 添加 `memoryDataProvider` 公共属性
- ✅ `src/api/MessageHandler.ts` - 添加 `getMemoryDataProvider()` 方法
- ✅ `src/core/agent/memory/MemoryManager.ts` - 添加调试日志和错误检查
- ✅ `src/api/MemoryDataProvider.ts` - 调整日志级别

## 测试方法

使用 `scripts/test-websocket.js` 进行测试：

```bash
node scripts/test-websocket.js
```

测试步骤：

1. 连接到 WebSocket 服务器
2. 订阅 'memory' 数据类型
3. 触发 AI 代理记录新记忆
4. 验证客户端收到 `memory_push` 消息

## 验证

### 日志检查

启动程序后，检查日志中是否有以下信息：

1. **WebSocket 服务器启动：**

   ```
   ✅ WebSocket服务器启动完成
   ```

2. **记忆管理器连接：**

   ```
   📡 WebSocket服务器已连接到记忆管理器 { serverExists: true, hasMemoryDataProvider: true }
   ```

3. **记忆推送：**
   ```
   📤 推送记忆: thought - 1699435200000_abc123
   ```

### 功能测试

修复后，当 AI 代理记录记忆时：

- ✅ `recordThought()` → 推送思考记忆
- ✅ `recordConversation()` → 推送对话记忆
- ✅ `recordDecision()` → 推送决策记忆
- ✅ `recordExperience()` → 推送经验记忆

### 如果推送仍然失败

检查日志中是否有以下警告：

- `❌ WebSocket服务器未设置，无法推送思考记忆` - 说明 Agent 未获得 WebSocket 引用
- `❌ memoryDataProvider 未初始化，无法推送思考记忆` - 说明 memoryDataProvider 引用丢失

客户端将实时收到类似以下格式的消息：

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
