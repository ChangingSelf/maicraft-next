# 记忆接口

## 概述

记忆接口允许客户端订阅和接收 Maicraft-Next 的实时记忆数据，支持查询、添加、修改和删除记忆。记忆系统分为四种类型：思维、对话、决策和经验记忆。

## 订阅记忆

客户端发送订阅请求：

```json
{
  "type": "subscribe",
  "dataTypes": ["memory"],
  "updateInterval": 0, // 0表示事件驱动
  "filters": {
    "memoryTypes": ["thought", "decision"], // 可选：过滤记忆类型
    "importance": "high" // 可选：过滤重要性
  }
}
```

**参数说明：**

- `dataTypes`: 必须包含 `"memory"`
- `updateInterval`: 记忆建议使用 0（事件驱动）
- `filters`:
  - `memoryTypes`: 记忆类型数组 ["thought", "conversation", "decision", "experience"]
  - `importance`: 重要性级别过滤 "high" | "normal" | "low"

## 记忆推送

服务端推送记忆数据：

```json
{
  "type": "memory_push",
  "timestamp": 1704067200000,
  "data": {
    "memoryType": "thought",
    "entry": {
      "id": "1704067200000_abc123def",
      "content": "我需要收集更多木头",
      "context": { "goal": "craft_tools" },
      "timestamp": 1704067200000
    }
  }
}
```

## 记忆条目数据结构

```typescript
interface MemoryEntry {
  id: string;
  timestamp: number;
  // 其他字段根据记忆类型而定
  [key: string]: any;
}
```

## 记忆操作

### 查询记忆

```json
{
  "type": "memory_query",
  "data": {
    "memoryTypes": ["thought", "conversation"],
    "limit": 50,
    "filters": {
      "speaker": "用户名",
      "importance": "high"
    }
  }
}
```

### 添加记忆

```json
{
  "type": "memory_add",
  "data": {
    "memoryType": "experience",
    "entry": {
      "lesson": "在下雨天更容易找到史莱姆",
      "context": "weather_exploration",
      "confidence": 0.8
    }
  }
}
```

### 修改记忆

```json
{
  "type": "memory_update",
  "data": {
    "memoryType": "experience",
    "id": "1704067200000_abc123def",
    "updates": {
      "confidence": 0.95,
      "occurrences": 5
    }
  }
}
```

### 删除记忆

```json
{
  "type": "memory_delete",
  "data": {
    "memoryType": "thought",
    "id": "1704067200000_outdated123"
  }
}
```

## 取消订阅

```json
{
  "type": "unsubscribe",
  "dataTypes": ["memory"]
}
```

## 订阅确认

服务端确认记忆订阅请求：

```json
{
  "type": "subscriptionConfirmed",
  "timestamp": 1704067200000,
  "data": {
    "subscribedTypes": ["memory"],
    "updateInterval": 0,
    "filters": {
      "memoryTypes": ["thought", "decision"],
      "importance": "high"
    }
  }
}
```

## 记忆类型说明

| 类型           | 说明         | 主要字段                        |
| -------------- | ------------ | ------------------------------- |
| `thought`      | AI思维过程   | content, context                |
| `conversation` | 对话记录     | speaker, message                |
| `decision`     | 决策执行记录 | intention, actions, result      |
| `experience`   | 经验教训     | lesson, confidence, occurrences |

## 常见过滤条件

- **重要性**: `importance: "high"` - 只接收重要记忆
- **说话者**: `speaker: "用户名"` - 只接收指定用户的对话
- **执行结果**: `result: "success"` - 只接收成功决策
- **记忆类型**: `memoryTypes: ["thought", "decision"]` - 只接收思维和决策记忆

## 示例

### 订阅重要思维和决策记忆

```json
{
  "type": "subscribe",
  "dataTypes": ["memory"],
  "updateInterval": 0,
  "filters": {
    "memoryTypes": ["thought", "decision"],
    "importance": "high"
  }
}
```

### 查询最近的对话记忆

```json
{
  "type": "memory_query",
  "data": {
    "memoryTypes": ["conversation"],
    "limit": 20,
    "filters": {
      "speaker": "player"
    }
  }
}
```

### 添加新的经验教训

```json
{
  "type": "memory_add",
  "data": {
    "memoryType": "experience",
    "entry": {
      "lesson": "铁矿通常在Y=12层分布",
      "context": "mining_exploration",
      "confidence": 0.9
    }
  }
}
```

### 删除过时记忆

```json
{
  "type": "memory_delete",
  "data": {
    "memoryType": "thought",
    "id": "1704067200000_outdated123"
  }
}
```
