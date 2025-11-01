# 动作系统设计对比总结

## 📊 三版本对比

| 维度         | 原设计 (action-system.md) | 现有实现 (ActionExecutor.ts) | 改进方案 (v2.0)         |
| ------------ | ------------------------- | ---------------------------- | ----------------------- |
| **架构定位** | ❌ 去除MCP中间层（矛盾）  | ✅ MCP Server                | ✅ 双模式 (Agent + MCP) |
| **事件系统** | ⚠️ 提及但未设计           | ❌ 无                        | ✅ 完整 EventBus        |
| **状态管理** | ❌ 无                     | ❌ 无                        | ✅ 5个管理器            |
| **错误处理** | ⚠️ 仅 timeout             | ⚠️ 基础 try-catch            | ✅ 重试+分类+降级       |
| **复合动作** | ⚠️ 示例简化               | ❌ 无                        | ✅ 回滚+部分成功        |
| **持久化**   | ❌ 无                     | ❌ 无                        | ✅ 历史+状态            |
| **AI 集成**  | ⚠️ 路径不明               | ❌ 无                        | ✅ 三种模式             |
| **监控指标** | ❌ 无                     | ⚠️ 基础日志                  | ✅ 完整指标             |

## 🎯 关键改进点

### 1. 架构定位 🏗️

**原设计问题:**

```
"去除MCP协议中间层" ← 但代码中仍有MCP
目标不清晰，导致架构混乱
```

**改进方案:**

```
maicraft-next = MCP Server + AI Agent 一体化
├─ 模式1: 独立Agent (零开销)
└─ 模式2: MCP Server (标准协议)
```

### 2. 核心组件对比 🧩

#### 动作上下文

**原设计:**

```typescript
interface ActionContext {
  bot: Bot;
  world: WorldInfo;
  executor: ActionExecutor;
  eventBus: EventBus; // ⚠️ 仅声明，无实现
  logger: Logger;
  config: Config;
}
```

**改进方案:**

```typescript
interface ActionContext {
  bot: Bot;
  executor: ActionExecutor;

  stateManager: StateManager; // ✅ 新增
  eventBus: EventBus; // ✅ 完整实现

  logger: Logger;
  config: Config;
  world: WorldInfo;
  ai?: AIContext; // ✅ AI模式专用
}
```

#### 动作执行器

**现有实现 (ActionExecutor.ts):**

```typescript
class ActionExecutor {
  ✅ register(action)
  ✅ execute(name, bot, params)
  ✅ queueAction() - 队列管理
  ✅ discoverAndRegisterActions()
  ⚠️ 简单的 try-catch 错误处理
  ❌ 无重试机制
  ❌ 无状态管理
  ❌ 无事件系统
}
```

**改进方案:**

```typescript
class ActionExecutor {
  ✅ register(action)
  ✅ execute(name, bot, params, options)
  ✅ queueAction()
  ✅ discoverAndRegisterActions()
  ✅ executeWithRetry() - 智能重试
  ✅ createContext() - 完整上下文
  ✅ getHistory() - 执行历史
  ✅ getMetrics() - 性能指标
  ✅ getToolDefinitions() - AI工具
  ✅ getMcpTools() - MCP工具
}
```

### 3. 错误处理对比 🛡️

**现有实现:**

```typescript
catch (error) {
  return {
    success: false,
    message: `执行错误: ${error.message}`,
    error: 'EXECUTION_ERROR'  // ❌ 太笼统
  };
}
```

**改进方案:**

```typescript
// 1. 错误分类
enum ActionErrorType {
  // 可重试
  TIMEOUT, NETWORK_ERROR, PATH_NOT_FOUND,
  // 不可重试
  INVALID_PARAMS, ACTION_NOT_FOUND,
  // 致命错误
  FATAL_ERROR
}

// 2. 智能重试
async executeWithRetry(fn, actionId) {
  for (attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      await sleep(calculateBackoff(attempt));
    }
  }
}
```

### 4. 状态管理对比 💾

**maicraft (Python) 现有功能:**

```python
✅ block_cache      - 方块缓存
✅ container_cache  - 容器缓存
✅ locations        - 位置标记
✅ thinking_log     - 思考日志
✅ to_do_list       - 任务列表
```

**原设计:**

```
❌ 完全没有提及状态管理
```

**改进方案:**

```typescript
✅ StateManager {
    blockCache: BlockCache          // 记忆方块
    containerCache: ContainerCache  // 箱子/熔炉
    locationManager: LocationManager // 地标
    taskList: TaskList              // 任务
    thinkingLog: ThinkingLog        // AI思考
}
```

### 5. 事件系统对比 📡

**maicraft (Python) 现有事件:**

```python
✅ 25+ 事件类型
  - health_event
  - death_event
  - entity_hurt_event
  - chat_event
  - ...
```

**原设计:**

```typescript
⚠️ ActionContext 提到 eventBus
❌ 但没有详细设计
```

**改进方案:**

```typescript
✅ EventBus {
    on(event, handler)
    once(event, handler)
    emit(event)
    off(event, handler)
}

✅ 预定义事件
  - HealthChangeEvent
  - DeathEvent
  - EntityHurtEvent
  - ActionStartEvent
  - ActionCompleteEvent
  - ...

✅ 动作可以订阅事件
class MineBlockAction {
  subscribeEvents(eventBus) {
    eventBus.on('entity_hurt', () => {
      this.interrupt('受攻击');
    });
  }
}
```

### 6. 复合动作对比 🔗

**原设计:**

```typescript
class BuildHouseAction {
  createSubActions() {
    for (let i...) {
      actions.push(new PlaceBlockAction(...));
    }
    return actions;
  }
}
// ❌ 没有说明失败处理、回滚、部分成功
```

**改进方案:**

```typescript
abstract class CompositeAction {
  async execute() {
    for (step of subActions) {
      result = await executor.execute(step);

      if (!result.success && step.required) {
        if (shouldRollback()) {
          await rollback(completedSteps);
        }
        return partialSuccess();
      }

      await saveProgress(currentStep);
    }
  }

  async rollback(steps) {
    for (step of steps.reverse()) {
      await executor.execute(step.rollbackAction);
    }
  }
}
```

### 7. AI 集成对比 🤖

**原设计:**

```typescript
⚠️ 提到"从提示词模式到工具调用模式"
❌ 但没有具体实现路径
```

**改进方案:**

```typescript
✅ AIActionAdapter {
  // 方案A: OpenAI Function Calling
  executeToolCalls(toolCalls) {...}

  // 方案B: 提示词模式 (兼容maicraft)
  executeFromPrompt(aiResponse) {...}

  // 方案C: MCP协议
  executeFromMCP(request) {...}

  getToolDefinitions() {...}
}

✅ 三种模式无缝切换
```

## 🎯 推荐实施方案

### 立即采用改进方案的理由

1. **完整性** ✅
   - 覆盖了所有缺失的功能
   - 与 maicraft (Python) 功能对齐

2. **兼容性** ✅
   - 保留了原设计的优点
   - 平滑迁移 maicraft 功能

3. **可扩展性** ✅
   - 模块化设计
   - 易于添加新功能

4. **实用性** ✅
   - 有完整代码示例
   - 有清晰的实现路径

### 实施优先级

#### 🔥 P0 - 立即开始 (Week 1-2)

```
✅ EventBus 实现
✅ StateManager (BlockCache + TaskList)
✅ 增强 ActionExecutor
✅ ErrorHandler (重试机制)
```

#### ⚡ P1 - 短期目标 (Week 3-4)

```
✅ CompositeAction 基类
✅ ActionHistory 持久化
✅ MetricsCollector
✅ 迁移现有动作
```

#### 🌟 P2 - 中期目标 (Week 5-8)

```
✅ AIActionAdapter
✅ ThinkingLog
✅ 双模式启动脚本
✅ 完整文档
```

## 📈 预期收益

### 功能完整性

- 从 **60%** → **95%** (补齐事件、状态、错误处理)

### 代码质量

- 错误处理: **基础** → **企业级** (分类、重试、降级)
- 可观测性: **日志** → **完整指标** (历史、性能、追踪)

### AI 能力

- 集成方式: **单一** → **三种** (工具调用、提示词、MCP)
- 状态记忆: **无** → **完整** (方块、任务、思考日志)

### 可维护性

- 架构清晰度: **模糊** → **清晰** (双模式定位)
- 测试覆盖: **困难** → **容易** (模块化设计)

## 🚀 下一步行动

### 1. 确认改进方案 ✅

- [ ] 评审 `action-system-review.md`
- [ ] 评审 `action-system-v2.md`
- [ ] 确定优先级

### 2. 创建实现分支

```bash
git checkout -b feature/action-system-v2
```

### 3. 开始 P0 实现

- [ ] 实现 EventBus
- [ ] 实现 StateManager
- [ ] 增强 ActionExecutor
- [ ] 实现 ErrorHandler

### 4. 编写测试

- [ ] 单元测试
- [ ] 集成测试
- [ ] 示例代码

### 5. 文档和迁移

- [ ] API 文档
- [ ] 迁移指南
- [ ] 最佳实践

## 📚 相关文档

- [action-system-review.md](./action-system-review.md) - 详细评估
- [action-system-v2.md](./action-system-v2.md) - 完整设计
- [action-system.md](./action-system.md) - 原设计

---

**建议:** 采用 v2.0 改进方案，按 P0 → P1 → P2 优先级逐步实施。
