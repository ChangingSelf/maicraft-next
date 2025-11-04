# Maicraft-Next WebSocket API

Maicraft-Next 提供基于 WebSocket 的实时 API，用于监控和控制 AI 代理的各种状态和行为。

## 快速开始

### 1. 启动服务器

确保 Maicraft-Next 已启动，WebSocket 服务器会自动在端口 25114 上启动。

```bash
pnpm dev
```

### 2. 连接WebSocket

```javascript
const ws = new WebSocket('ws://localhost:25114/ws');
```

### 3. 订阅数据

```javascript
// 订阅日志
ws.send(JSON.stringify({
  type: 'subscribe',
  dataTypes: ['logs'],
  updateInterval: 0,
  filters: {
    levels: ['INFO', 'ERROR']
  }
}));
```

## 可用数据类型

- **`logs`** - 实时日志数据
- **`player`** - 玩家状态（计划中）
- **`world`** - 世界状态（计划中）
- **`tasks`** - 任务状态（计划中）
- **`memory`** - 记忆统计（计划中）
- **`usage`** - Token使用量（计划中）

## 消息格式

### 客户端消息

```typescript
interface WSMessage {
  type: string;        // 消息类型
  timestamp?: number;  // 时间戳（可选）
  data?: any;         // 消息数据（可选）
  [key: string]: any; // 其他字段
}
```

### 服务端消息

所有服务端消息都遵循相同的格式，`type` 字段表示消息类型。

## 测试

运行测试脚本验证 API 功能：

```bash
node scripts/test-websocket.js
```

## 文档导航

- **[API概览](api.md)** - API 基础概念和通用结构
- **[日志接口](logs.md)** - 日志订阅和推送的详细说明

## 配置

WebSocket 服务器的配置位于 `config.toml` 中的 `[api.websocket]` 部分：

```toml
[api.websocket]
enabled = true
host = "0.0.0.0"
port = 25114
path = "/ws"
max_connections = 10
heartbeat_interval = 30000
connection_timeout = 60000
```

## 故障排除

### 连接失败

1. 检查 Maicraft-Next 是否正在运行
2. 确认端口 25114 未被其他程序占用
3. 检查防火墙设置

### 订阅失败

1. 确认消息格式正确
2. 检查 `dataTypes` 数组是否包含有效的类型
3. 查看服务器日志以获取详细错误信息

## 开发

WebSocket API 的源代码位于 `src/api/` 目录：

- `WebSocketServer.ts` - WebSocket 服务器主类
- `SubscriptionManager.ts` - 订阅管理
- `MessageHandler.ts` - 消息处理
- `LogDataProvider.ts` - 日志数据提供器
- `WebSocketManager.ts` - 全局管理器
