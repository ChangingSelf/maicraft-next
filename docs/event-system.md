# 事件系统 (Event System)

> 本文档介绍 Maicraft-Next 的事件管理系统

---

## 🎯 设计理念

### 薄层封装，保持一致

Maicraft-Next 的事件系统是对 mineflayer 事件的薄层封装，设计目标：

- ✅ 保持 mineflayer 原始事件名
- ✅ 统一管理游戏事件和自定义事件
- ✅ 解耦组件，易于测试
- ✅ 性能开销 < 1%

---

## 📦 核心组件

### EventEmitter

统一的事件管理器，支持：
- 监听 mineflayer 事件
- 发送自定义事件
- 类型安全的事件处理

---

## 💻 基本使用

### 创建 EventEmitter

```typescript
import { EventEmitter } from '@/core/events/EventEmitter';

const events = new EventEmitter(bot);
```

### 监听 mineflayer 事件

```typescript
// 生命值变化
events.on('health', (data) => {
  console.log(`生命值: ${data.health}`);
});

// 受到伤害
events.on('entityHurt', (data) => {
  console.log(`${data.entity.name} 受到伤害`);
});

// 死亡
events.on('death', () => {
  console.log('你死了');
});

// 聊天消息
events.on('chat', (data) => {
  console.log(`${data.username}: ${data.message}`);
});
```

### 发送自定义事件

```typescript
// 发送自定义事件
events.emit('actionComplete', {
  actionId: 'move',
  actionName: 'MoveAction',
  result: { success: true },
  duration: 1500
});

// 监听自定义事件
events.on('actionComplete', (data) => {
  console.log(`动作 ${data.actionName} 完成，耗时 ${data.duration}ms`);
});
```

---

## 📋 常用 mineflayer 事件

### 生命和状态

| 事件 | 说明 | 数据 |
|------|------|------|
| `health` | 生命值变化 | `{ health, food }` |
| `death` | 死亡 | 无 |
| `spawn` | 重生 | 无 |
| `breath` | 氧气变化 | `{ breath }` |

### 实体和战斗

| 事件 | 说明 | 数据 |
|------|------|------|
| `entityHurt` | 实体受伤 | `{ entity, damage }` |
| `entityDead` | 实体死亡 | `{ entity }` |
| `playerCollect` | 拾取物品 | `{ collector, collected }` |

### 环境

| 事件 | 说明 | 数据 |
|------|------|------|
| `time` | 时间变化 | `{ time }` |
| `weather` | 天气变化 | `{ isRaining, thunderState }` |
| `rain` | 开始下雨 | 无 |

### 交互

| 事件 | 说明 | 数据 |
|------|------|------|
| `chat` | 聊天消息 | `{ username, message }` |
| `whisper` | 私聊消息 | `{ username, message }` |
| `playerJoined` | 玩家加入 | `{ player }` |
| `playerLeft` | 玩家离开 | `{ player }` |

### 移动

| 事件 | 说明 | 数据 |
|------|------|------|
| `move` | 位置变化 | `{ position }` |
| `forcedMove` | 强制移动 | `{ position }` |

---

## 🔄 与 Maicraft Python 的对比

### Maicraft Python

```python
# Python 中需要手动封装事件
from agent.events import global_event_emitter

@global_event_emitter.on('health_event')
def on_health(event):
    print(f"生命值: {event.health}")
```

**问题**：
- 需要定义自己的事件类
- 事件名与 mineflayer 不一致
- 跨进程传递事件数据

### Maicraft-Next

```typescript
// 直接使用 mineflayer 事件名
events.on('health', (data) => {
  console.log(`生命值: ${data.health}`);
});
```

**优势**：
- 保持 mineflayer 事件名
- 无跨进程开销
- 类型安全

---

## 📚 在 Agent 中使用

### 在 Agent 中监听事件

```typescript
export class Agent {
  private setupEventListeners(): void {
    const { events } = this.state.context;

    // 监听生命值变化
    events.on('health', () => {
      // 检查是否需要吃食物
      if (this.state.context.gameState.food < 10) {
        this.state.interrupt.requestInterrupt('饥饿，需要吃食物');
      }
    });

    // 监听受伤
    events.on('entityHurt', (data) => {
      if (data.entity === this.state.context.bot.entity) {
        // 切换到战斗模式
        this.state.modeManager.switchMode(ModeType.COMBAT);
      }
    });

    // 监听聊天
    events.on('chat', async (data) => {
      if (data.message.startsWith('@bot')) {
        // 触发聊天循环
        await this.chatLoop.handleMessage(data.username, data.message);
      }
    });

    // 监听死亡
    events.on('death', () => {
      // 记录经验
      this.state.memory.experience.record({
        category: 'survival',
        lesson: '死亡了，需要更加小心',
        importance: 'high'
      });
    });
  }
}
```

### 在模式中使用事件

```typescript
export class CombatMode extends Mode {
  async onEnter(): Promise<void> {
    // 监听战斗相关事件
    this.eventHandles.push(
      this.context.events.on('entityHurt', (data) => {
        // 处理战斗伤害
      })
    );
  }

  async onExit(): Promise<void> {
    // 清理事件监听器
    this.eventHandles.forEach(handle => handle.remove());
  }
}
```

---

## 🚀 最佳实践

### 1. 及时移除事件监听器

```typescript
// ✅ 保存句柄并在不需要时移除
const handle = events.on('health', () => { /* ... */ });

// 清理
handle.remove();
```

### 2. 使用事件驱动状态更新

```typescript
// ✅ 通过事件自动更新 GameState
bot.on('health', () => {
  globalGameState.updateHealth(bot);
});

// ❌ 不要轮询
setInterval(() => {
  // 不要这样做
  checkHealth();
}, 1000);
```

### 3. 在关键事件中记录日志

```typescript
events.on('death', () => {
  logger.error('玩家死亡', {
    position: gameState.position,
    health: gameState.health,
    killer: gameState.lastDamageSource
  });
});
```

### 4. 使用自定义事件解耦组件

```typescript
// 动作完成后发送事件
executor.execute(ActionIds.MOVE, params).then(result => {
  events.emit('actionComplete', {
    action: 'move',
    result
  });
});

// 其他组件监听
events.on('actionComplete', (data) => {
  // 更新记忆
  memory.decision.record({
    action: data.action,
    result: data.result
  });
});
```

---

## 📚 相关文档

- [架构概览](architecture-overview.md) - 了解事件系统在整体架构中的位置
- [状态管理](state-management.md) - 了解事件如何驱动状态更新

---

_最后更新: 2025-11-01_

