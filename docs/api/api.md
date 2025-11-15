# Maicraft-Next API

## 概述

Maicraft-Next 提供基于 WebSocket 的实时 API，用于监控和控制 AI 代理的各种状态和行为。

## WebSocket 端点

### 单一端点：`/ws`

Maicraft-Next 使用单一 WebSocket 端点处理所有实时数据通信。

**连接地址：** `ws://localhost:25114/ws` （端口根据配置而定，默认为25114）

## 数据类型定义

### 数据类型枚举

```typescript
enum DataType {
  PLAYER = 'player', // 玩家状态
  WORLD = 'world', // 世界状态
  LOGS = 'logs', // 日志
  TASKS = 'tasks', // 任务列表
  MEMORY = 'memory', // 记忆统计
  USAGE = 'usage', // Token使用量
}
```

### 订阅消息接口

```typescript
interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  dataTypes: string[]; // ["player", "world", "logs"]
  updateInterval?: number; // 0表示事件驱动，>0表示定期推送
  filters?: Record<string, any>; // 可选的过滤条件（根据数据类型而定）
}
```

## 通用数据结构

### 消息格式

所有 WebSocket 消息都遵循统一的 JSON 格式：

```typescript
interface WSMessage {
  type: string; // 消息类型
  timestamp?: number; // 时间戳（毫秒）
  data?: any; // 消息数据（可选）
  [key: string]: any; // 其他字段
}
```

### 响应状态

```typescript
interface APIResponse {
  timestamp: number; // 时间戳
  success: boolean; // 是否成功
  message: string; // 响应消息
  data?: any; // 响应数据（可选）
}
```

## 订阅机制

### 订阅数据

客户端发送订阅请求：

```json
{
  "type": "subscribe",
  "dataTypes": ["logs", "player"],
  "updateInterval": 0, // 0表示事件驱动，>0表示定期推送
  "filters": {} // 可选的过滤条件（根据数据类型而定）
}
```

**参数说明：**

- `dataTypes`: 要订阅的数据类型数组
- `updateInterval`: 更新间隔（毫秒），0表示事件驱动，>0表示定期推送
- `filters`: 可选的过滤条件对象（具体字段根据数据类型而定）

### 取消订阅

```json
{
  "type": "unsubscribe",
  "dataTypes": ["logs"]
}
```

**参数说明：**

- `dataTypes`: 要取消订阅的数据类型数组

### 订阅确认

服务端确认订阅请求：

```json
{
  "type": "subscriptionConfirmed",
  "timestamp": 1704067200000,
  "data": {
    "subscribedTypes": ["logs"],
    "updateInterval": 0,
    "filters": {}
  }
}
```

## 模块文档

各功能模块的详细API说明请参考以下文档：

- **[日志接口](logs.md)** - 日志订阅和推送
- **[玩家接口](player.md)** - 玩家状态监控（计划中）
- **[世界接口](world.md)** - 世界状态监控（计划中）
- **[任务接口](tasks.md)** - 任务管理（计划中）
- **[记忆接口](memory.md)** - 记忆统计（计划中）
- **[使用统计接口](usage.md)** - Token使用量监控（计划中）

## 心跳机制

所有 WebSocket 连接都需要维持心跳：

### 客户端发送

```json
{
  "type": "ping",
  "timestamp": 1704067200000
}
```

### 服务端回复

```json
{
  "type": "pong",
  "timestamp": 1704067200000,
  "serverTimestamp": 1704067200001
}
```

**心跳间隔：** 建议每30秒发送一次ping消息

## 错误处理

### 错误消息格式

```json
{
  "type": "error",
  "errorCode": "ERROR_CODE",
  "message": "错误描述",
  "timestamp": 1704067200000
}
```

### 常见错误码

- `INVALID_JSON`: JSON格式错误
- `UNKNOWN_MESSAGE_TYPE`: 未知消息类型
- `SUBSCRIPTION_ERROR`: 订阅错误
- `CONNECTION_ERROR`: 连接错误
- `INTERNAL_ERROR`: 内部错误
