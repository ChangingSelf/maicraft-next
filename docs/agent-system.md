# 代理系统 (Agent System)

> 本文档介绍 Maicraft-Next 的 Agent 架构和工作原理

---

## 🎯 Agent 的职责

Agent 是整个系统的**主协调器**，负责：

1. **初始化和管理**所有子系统（记忆、规划、模式等）
2. **协调**决策循环（MainDecisionLoop、ChatLoop）的运行
3. **管理**Agent 的生命周期（启动、停止、暂停）
4. **提供**统一的状态访问接口

---

## 📐 系统架构

```
Agent (主协调器)
  ├── AgentState (共享状态)
  │   ├── RuntimeContext (运行时上下文)
  │   ├── MemoryManager (记忆管理)
  │   ├── GoalPlanningManager (规划管理)
  │   ├── ModeManager (模式管理)
  │   └── InterruptController (中断控制)
  │
  ├── MainDecisionLoop (主决策循环)
  ├── ChatLoop (聊天循环)
  └── EventListeners (事件监听器)
```

---

## 💻 基本使用

### 创建 Agent

```typescript
import { createBot } from 'mineflayer';
import { Agent } from '@/core/agent/Agent';
import { ActionExecutor } from '@/core/actions/ActionExecutor';
import { LLMManager } from '@/llm/LLMManager';

// 1. 创建 bot
const bot = createBot({
  /* ... */
});

// 2. 创建 ActionExecutor
const executor = new ActionExecutor(bot, logger, config);

// 3. 创建 LLMManager
const llmManager = LLMManagerFactory.create(config.llm, logger);

// 4. 创建 Agent
const agent = new Agent(bot, executor, llmManager, config);

// 5. 启动 Agent
await agent.start();
```

### Agent 生命周期

```typescript
// 启动
await agent.start();

// 暂停
await agent.pause();

// 恢复
await agent.resume();

// 停止
await agent.stop();

// 获取状态
const status = agent.getStatus();
console.log(status.isRunning);
```

---

## 🔧 子系统详解

### 1. AgentState - 共享状态

所有子系统共享的状态对象：

```typescript
interface AgentState {
  goal: string; // 当前总目标
  isRunning: boolean; // 运行状态
  context: RuntimeContext; // 运行时上下文
  modeManager: ModeManager; // 模式管理器
  planningManager: GoalPlanningManager; // 规划管理器
  memory: MemoryManager; // 记忆管理器
  interrupt: InterruptController; // 中断控制器
  config: Config; // 配置对象
}
```

### 2. MainDecisionLoop - 主决策循环

负责 Agent 的主要决策逻辑：

```typescript
class MainDecisionLoop {
  async run(): Promise<void> {
    while (this.state.isRunning) {
      // 1. 生成 prompt
      const prompt = await this.generatePrompt();

      // 2. 调用 LLM
      const response = await this.llmManager.chat(prompt);

      // 3. 解析和执行动作
      await this.executeAction(response);

      // 4. 更新状态和记忆
      await this.updateState();

      // 5. 等待下一次循环
      await this.sleep();
    }
  }
}
```

### 3. ChatLoop - 聊天循环

处理玩家聊天互动：

```typescript
class ChatLoop {
  async handleMessage(username: string, message: string): Promise<void> {
    // 1. 记录对话
    await this.state.memory.conversation.record({
      /* ... */
    });

    // 2. 生成回复
    const response = await this.llmManager.chat(/* ... */);

    // 3. 发送回复
    await this.state.context.executor.execute(ActionIds.CHAT, {
      message: response.content,
    });
  }
}
```

---

## 🔄 与 Maicraft Python 的对比

| 方面         | Maicraft Python        | Maicraft-Next        |
| ------------ | ---------------------- | -------------------- |
| **主类**     | MaiAgent               | Agent                |
| **架构**     | 扁平，所有逻辑在一个类 | 模块化，清晰的子系统 |
| **决策循环** | think_loop 方法        | MainDecisionLoop 类  |
| **聊天处理** | chat_loop 方法         | ChatLoop 类          |
| **状态管理** | 全局变量               | AgentState 共享对象  |
| **模式系统** | mode_manager           | ModeManager          |

---

## 📚 相关文档

- [架构概览](architecture-overview.md)
- [记忆系统](memory-system.md)
- [规划系统](planning-system.md)
- [模式系统](mode-system.md)
- [决策循环](decision-loop.md)

---

_最后更新: 2025-11-01_
