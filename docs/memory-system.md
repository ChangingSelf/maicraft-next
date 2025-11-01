# 记忆系统 (Memory System)

> 本文档介绍 Maicraft-Next 的记忆系统设计和使用方式

---

## 🎯 设计理念

### Maicraft Python 的局限

```python
# ❌ 简单的 thinking_log
thinking_log = []
thinking_log.append({
    "timestamp": time.time(),
    "content": "我需要收集木头"
})
```

**问题**：
- 只有一种记忆类型
- 无法区分不同类型的信息
- 查询不方便
- 无持久化机制

### Maicraft-Next 的改进

```typescript
// ✅ 四种专门记忆类型
await memory.thought.record({ /* 思维 */ });
await memory.conversation.record({ /* 对话 */ });
await memory.decision.record({ /* 决策 */ });
await memory.experience.record({ /* 经验 */ });

// ✅ 支持查询
const recentThoughts = await memory.thought.query({ limit: 10 });

// ✅ 自动持久化
await memory.saveAll();
```

---

## 📦 四种记忆类型

### 1. ThoughtMemory - 思维记忆

**用途**：记录 AI 的内部思考过程

```typescript
await memory.thought.record({
  category: 'planning',
  content: '我需要先收集 10 个木头，然后制作工作台',
  context: { goal: 'build_house' },
  importance: 'high'
});
```

**适用场景**：
- 规划和推理过程
- 问题分析
- 策略思考

### 2. ConversationMemory - 对话记忆

**用途**：记录与玩家的聊天互动

```typescript
await memory.conversation.record({
  speaker: 'Player123',
  message: '帮我建造一个房子',
  response: '好的，我会开始收集材料',
  context: { location: homePosition }
});
```

**适用场景**：
- 玩家指令
- 聊天对话
- 社交互动

### 3. DecisionMemory - 决策记忆

**用途**：记录行动决策及其结果

```typescript
await memory.decision.record({
  action: 'mine_block',
  params: { name: 'iron_ore', count: 10 },
  result: { success: true, message: '成功挖掘 10 个铁矿' },
  reasoning: '需要铁矿来制作工具',
  context: { goal: 'craft_iron_pickaxe' }
});
```

**适用场景**：
- 动作执行记录
- 决策依据
- 结果评估

### 4. ExperienceMemory - 经验记忆

**用途**：记录学习到的经验教训

```typescript
await memory.experience.record({
  category: 'mining',
  lesson: '在夜晚挖矿很危险，容易遭遇怪物攻击',
  context: { event: 'death', cause: 'zombie' },
  importance: 'high'
});
```

**适用场景**：
- 成功经验
- 失败教训
- 技巧总结

---

## 💻 基本使用

### 初始化记忆系统

```typescript
import { MemoryManager } from '@/core/agent/memory/MemoryManager';

const memory = new MemoryManager();

// 加载持久化的记忆
await memory.loadAll();
```

### 记录记忆

```typescript
// 记录思维
await memory.thought.record({
  category: 'planning',
  content: '我需要找到铁矿',
  context: { currentTask: 'gather_materials' }
});

// 记录对话
await memory.conversation.record({
  speaker: 'Player1',
  message: '你好',
  response: '你好！有什么我可以帮忙的吗？'
});

// 记录决策
await memory.decision.record({
  action: 'move',
  params: { x: 100, y: 64, z: 200 },
  result: { success: true },
  reasoning: '移动到矿洞入口'
});

// 记录经验
await memory.experience.record({
  category: 'combat',
  lesson: '对付僵尸时保持距离很重要',
  importance: 'high'
});
```

### 查询记忆

```typescript
// 查询最近的思维
const recentThoughts = await memory.thought.query({
  limit: 10,
  filters: { category: 'planning' }
});

// 查询对话历史
const conversations = await memory.conversation.query({
  limit: 20,
  filters: { speaker: 'Player1' }
});

// 查询决策记录
const decisions = await memory.decision.query({
  limit: 15,
  filters: { action: 'mine_block' }
});

// 查询经验教训
const experiences = await memory.experience.query({
  filters: { category: 'mining', importance: 'high' }
});
```

### 持久化

```typescript
// 保存所有记忆
await memory.saveAll();

// 保存单个类型
await memory.thought.save();
await memory.conversation.save();

// 加载所有记忆
await memory.loadAll();
```

### 清理记忆

```typescript
// 清理过时记忆（自动保留重要记忆）
await memory.cleanup();

// 清空所有记忆
await memory.clearAll();
```

---

## 🔄 与 Maicraft Python 的对比

| 方面 | Maicraft Python | Maicraft-Next |
|------|-----------------|---------------|
| **记忆类型** | 单一的 thinking_log | 4 种专门记忆类型 |
| **结构化** | 简单的列表 | 类型化的记录结构 |
| **查询** | 遍历列表 | 支持过滤和限制 |
| **持久化** | 需手动实现 | 自动持久化机制 |
| **容量管理** | 无 | 自动清理机制 |

---

## 📚 在 Agent 中使用记忆

### 在决策循环中

```typescript
// MainDecisionLoop.ts
async think(): Promise<void> {
  // 1. 获取相关记忆
  const recentThoughts = await this.state.memory.thought.query({ limit: 5 });
  const recentDecisions = await this.state.memory.decision.query({ limit: 10 });
  
  // 2. 包含在 Prompt 中
  const prompt = this.generatePrompt({
    thoughts: recentThoughts,
    decisions: recentDecisions
  });
  
  // 3. 调用 LLM
  const response = await this.llmManager.chat(prompt);
  
  // 4. 记录新的思维
  await this.state.memory.thought.record({
    category: 'decision',
    content: response.thinking,
    context: { mode: this.state.modeManager.getCurrentMode() }
  });
  
  // 5. 记录决策
  await this.state.memory.decision.record({
    action: response.action,
    params: response.params,
    reasoning: response.thinking
  });
}
```

### 在事件处理中

```typescript
// 监听死亡事件，记录经验
bot.on('death', () => {
  memory.experience.record({
    category: 'survival',
    lesson: '需要更加小心，避免死亡',
    context: { 
      location: gameState.position,
      health: gameState.health,
      cause: 'unknown'
    },
    importance: 'high'
  });
});
```

---

## 🚀 最佳实践

### 1. 合理使用记忆类型

```typescript
// ✅ 正确：思维记忆用于内部推理
await memory.thought.record({
  content: '我需要先做一个工作台'
});

// ❌ 错误：不要在思维记忆中记录对话
await memory.thought.record({
  content: '玩家说：你好'  // 应该用 conversation
});
```

### 2. 设置合适的重要性

```typescript
// ✅ 重要经验标记为 high
await memory.experience.record({
  lesson: '钻石在 Y=12 层最多',
  importance: 'high'
});

// ✅ 日常决策标记为 normal
await memory.decision.record({
  action: 'move',
  importance: 'normal'
});
```

### 3. 定期持久化

```typescript
// 在 Agent 中设置定期保存
setInterval(async () => {
  await memory.saveAll();
}, 5 * 60 * 1000); // 每 5 分钟保存一次
```

### 4. 提供足够的上下文

```typescript
// ✅ 提供丰富的上下文
await memory.decision.record({
  action: 'craft',
  params: { item: 'wooden_pickaxe' },
  result: { success: true },
  reasoning: '需要挖掘石头来制作更好的工具',
  context: {
    goal: 'upgrade_tools',
    currentPlan: 'gather_materials',
    location: gameState.position
  }
});
```

---

## 📚 相关文档

- [代理系统](agent-system.md) - 了解记忆系统在 Agent 中的使用
- [规划系统](planning-system.md) - 了解记忆如何配合任务规划

---

_最后更新: 2025-11-01_

