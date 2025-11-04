# 日志接口

## 概述

日志接口允许客户端订阅和接收 Maicraft-Next 的实时日志数据，支持按级别和模块进行过滤。

## 订阅日志

客户端发送订阅请求：

```json
{
  "type": "subscribe",
  "dataTypes": ["logs"],
  "updateInterval": 0,  // 0表示事件驱动
  "filters": {
    "levels": ["INFO", "WARN", "ERROR"],       // 可选：过滤日志级别
    "modules": ["Agent", "ActionExecutor"]     // 可选：过滤模块名称
  }
}
```

**参数说明：**
- `dataTypes`: 必须包含 `"logs"`
- `updateInterval`: 日志建议使用 0（事件驱动）
- `filters`:
  - `levels`: 日志级别过滤，支持字符串数组 ["ERROR","WARN","INFO","DEBUG"]
  - `modules`: 模块名称过滤数组

## 日志推送

服务端推送日志数据：

```json
{
  "type": "logsUpdate",
  "timestamp": 1704067200000,
  "data": {
    "timestamp": 1730532563044,
    "level": "INFO",
    "message": "执行动作：move",
    "module": "ActionExecutor"
  }
}
```

## 日志条目数据结构

```typescript
interface LogEntry {
  timestamp: number;     // 时间戳（毫秒）
  level: string;         // 日志级别 ("ERROR", "WARN", "INFO", "DEBUG")
  message: string;       // 日志消息
  module?: string;       // 模块名称
}
```

## 取消订阅

```json
{
  "type": "unsubscribe",
  "dataTypes": ["logs"]
}
```

## 订阅确认

服务端确认日志订阅请求：

```json
{
  "type": "subscriptionConfirmed",
  "timestamp": 1704067200000,
  "data": {
    "subscribedTypes": ["logs"],
    "updateInterval": 0,
    "filters": {
      "levels": ["INFO", "WARN", "ERROR"],
      "modules": ["Agent", "ActionExecutor"]
    }
  }
}
```

## 日志级别说明

| 级别 | 说明 |
|------|------|
| `ERROR` | 错误信息 |
| `WARN` | 警告信息 |
| `INFO` | 一般信息 |
| `DEBUG` | 调试信息 |

## 常见模块名称

- `Agent`: 代理核心
- `ActionExecutor`: 动作执行器
- `MemoryManager`: 记忆管理器
- `LLMManager`: LLM管理器
- `GameState`: 游戏状态
- `Config`: 配置管理器
- `WebSocket`: WebSocket服务器

## 示例

### 订阅所有错误和警告日志

```json
{
  "type": "subscribe",
  "dataTypes": ["logs"],
  "updateInterval": 0,
  "filters": {
    "levels": ["ERROR", "WARN"]
  }
}
```

### 订阅特定模块的调试日志

```json
{
  "type": "subscribe",
  "dataTypes": ["logs"],
  "updateInterval": 0,
  "filters": {
    "levels": ["DEBUG"],
    "modules": ["ActionExecutor", "Agent"]
  }
}
```

### 订阅所有日志（无过滤）

```json
{
  "type": "subscribe",
  "dataTypes": ["logs"],
  "updateInterval": 0
}
```
