# Maicraft-Next 架构概览

> 本文档介绍 Maicraft-Next 的整体架构设计和核心理念

---

## 📐 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         Agent                               │
│          (主协调器 - 管理所有子系统)                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │MemoryManager │  │PlanningManager│  │ ModeManager  │    │
│  │              │  │               │  │              │    │
│  │- Thought     │  │- Goals        │  │- MainMode    │    │
│  │- Conversation│  │- Plans        │  │- CombatMode  │    │
│  │- Decision    │  │- Tasks        │  │- MainMode    │    │
│  │- Experience  │  │- Trackers     │  │- CombatMode  │    │
│  │              │  │               │  │-监听器机制    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │           Decision Loops                          │     │
│  │  ┌──────────────────┐  ┌──────────────────┐     │     │
│  │  │MainDecisionLoop  │  │   ChatLoop       │     │     │
│  │  │  (主决策循环)     │  │  (聊天循环)       │     │     │
│  │  └──────────────────┘  └──────────────────┘     │     │
│  └──────────────────────────────────────────────────┘     │
│                                                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │            RuntimeContext                         │     │
│  │  (共享的运行时上下文)                               │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    ActionExecutor                           │
│              (动作执行器 - 类型安全的动作调用)                  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Move    │  │   Mine   │  │  Craft   │  │  Chat    │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ... 15 个核心动作 ...                                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 RuntimeContext 共享组件                      │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │GameState │  │BlockCache│  │Container │  │Location  │  │
│  │          │  │          │  │Cache     │  │Manager   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                             │
│  ┌──────────┐  ┌──────────┐                                │
│  │ Events   │  │ Logger   │                                │
│  └──────────┘  └──────────┘                                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Mineflayer Bot                             │
│            (游戏客户端 - 与 Minecraft 服务器交互)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 核心设计理念

### 1. 单体架构，零跨进程开销

**设计目标**：消除 Maicraft Python 版本中 MCP 协议带来的跨进程通信开销

**实现方式**：

- 所有组件在同一进程内运行
- 通过 TypeScript 类型系统保证接口安全
- 内存直接调用，性能提升 10-50x

**对比**：

```typescript
// ❌ Maicraft Python: 跨进程调用
const result = await mcpClient.callTool('move', { x: 100, y: 64, z: 200 });

// ✅ Maicraft-Next: 内存直调
await executor.execute(ActionIds.MOVE, { x: 100, y: 64, z: 200 });
```

### 2. 全局状态，实时访问

**设计目标**：去除查询类动作，状态实时可访问

**实现方式**：

- `GameState` 通过 mineflayer bot 事件自动同步
- 所有组件通过 `RuntimeContext` 访问全局状态
- 零轮询开销

**对比**：

```typescript
// ❌ Maicraft Python: 需要查询
const status = await mcpClient.callTool('query_player_status', {});
const health = status.data.health;

// ✅ Maicraft-Next: 直接访问
const health = context.gameState.health;
const food = context.gameState.food;
const inventory = context.gameState.inventory;
```

### 3. 类型安全，编译时检查

**设计目标**：利用 TypeScript 类型系统，在编译时发现错误

**实现方式**：

- 所有动作参数都有完整的类型定义
- 使用 `ActionIds` 常量避免拼写错误
- IDE 自动补全和参数提示

**示例**：

```typescript
// ✅ 类型安全的动作调用
await executor.execute(ActionIds.MINE_BLOCK, {
  name: 'iron_ore',
  count: 10,
});

// ❌ 编译时就会报错
await executor.execute(ActionIds.MINE_BLOCK, {
  name: 'iron_ore',
  // count 必须是 number，不能是 string
  count: '10', // ← TypeScript 编译错误
});
```

### 4. 模块化设计，高内聚低耦合

**设计目标**：每个模块职责清晰，易于测试和维护

**核心模块**：

1. **Agent** - 主协调器，管理所有子系统
2. **ActionExecutor** - 动作执行，连接到 bot
3. **MemoryManager** - 记忆管理
4. **GoalPlanningManager** - 目标和任务规划
5. **ModeManager** - 模式管理和切换
6. **GameState** - 游戏状态同步
7. **EventEmitter** - 统一事件管理
8. **LLMManager** - LLM 调用管理

**依赖关系**：

- 通过 `RuntimeContext` 共享状态
- 通过接口定义清晰的边界
- 易于单元测试和集成测试

---

## 🔄 数据流

### 1. 决策循环数据流

```
┌─────────────────────────────────────────────────────────────┐
│ 1. MainDecisionLoop 获取上下文                               │
│    - GameState (当前状态)                                    │
│    - Memory (历史记忆)                                       │
│    - Planning (当前目标和任务)                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. PromptManager 生成 Prompt                                │
│    - 基本信息模板                                            │
│    - 当前模式提示                                            │
│    - 记忆和任务上下文                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. LLMManager 调用 LLM                                      │
│    - 发送 Prompt                                            │
│    - 接收 LLM 响应（思考 + 动作）                            │
│    - 记录用量统计                                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Parser 解析 LLM 响应                                     │
│    - 提取思考内容                                            │
│    - 提取动作和参数                                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. ActionExecutor 执行动作                                  │
│    - 验证动作参数                                            │
│    - 执行动作逻辑                                            │
│    - 返回执行结果                                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 更新状态和记忆                                            │
│    - 记录思考（ThoughtMemory）                               │
│    - 记录决策（DecisionMemory）                              │
│    - 更新任务进度（PlanningManager）                         │
│    - 触发事件（EventEmitter）                                │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
                  (循环继续)
```

### 2. 事件驱动数据流

```
Minecraft Server Event
         │
         ▼
  Mineflayer Bot
         │
         ▼
   EventEmitter (薄层封装)
         │
         ├──────────────────────┬─────────────────┐
         ▼                      ▼                 ▼
    GameState 更新        事件处理器          自定义监听器
         │                      │                 │
         ▼                      ▼                 ▼
    实时状态同步            模式切换        记忆/规划更新
```

---

## 📦 核心组件详解

### Agent

**职责**：

- 主协调器，管理所有子系统
- 初始化和生命周期管理
- 协调决策循环的运行

**关键方法**：

```typescript
class Agent {
  async start(): Promise<void>; // 启动 Agent
  async stop(): Promise<void>; // 停止 Agent
  getStatus(): AgentStatus; // 获取运行状态
}
```

### RuntimeContext

**职责**：

- 共享的运行时上下文
- 提供所有组件访问核心服务的统一接口

**包含内容**：

```typescript
interface RuntimeContext {
  bot: Bot; // Mineflayer bot 实例
  gameState: GameState; // 游戏状态
  executor: ActionExecutor; // 动作执行器
  events: EventEmitter; // 事件管理器
  blockCache: BlockCache; // 方块缓存
  containerCache: ContainerCache; // 容器缓存
  locationManager: LocationManager; // 地标管理
  logger: Logger; // 日志记录器
}
```

### ActionExecutor

**职责**：

- 动作注册和管理
- 类型安全的动作调用
- 中断机制

**关键特性**：

- 支持动态注册新动作
- 使用 `ActionIds` 常量保证类型安全
- 统一的错误处理和日志记录

### GameState

**职责**：

- 实时同步游戏状态
- 提供格式化的状态描述（用于 LLM）

**同步的状态**：

- 玩家状态：生命值、饥饿度、经验等
- 位置信息：坐标、维度
- 物品栏：物品列表、装备
- 周围实体：玩家、生物等
- 环境信息：天气、时间、生物群系

---

## 🚀 启动流程

```
1. 读取配置 (config.toml)
    ↓
2. 创建 Mineflayer Bot
    ↓
3. 初始化 GameState
    ↓
4. 创建 ActionExecutor
    ↓
5. 注册所有动作
    ↓
6. 初始化 LLMManager
    ↓
7. 创建 Agent
    ↓
8. Agent.start()
    ├─ 启动 MainDecisionLoop
    ├─ 启动 ChatLoop
    └─ 设置事件监听器
    ↓
9. 进入主循环
```

---

## 🎯 与 Maicraft Python 的对比

| 特性         | Maicraft Python             | Maicraft-Next  |
| ------------ | --------------------------- | -------------- |
| **语言**     | Python                      | TypeScript     |
| **架构**     | Agent + MCP Server (双进程) | 单体架构       |
| **通信**     | MCP 协议 (stdio)            | 内存直调       |
| **状态访问** | 工具查询                    | 实时访问       |
| **动作数量** | 25+ (含查询类)              | 15 核心动作    |
| **类型检查** | 运行时                      | 编译时         |
| **记忆系统** | thinking_log                | 4 种记忆类型   |
| **任务管理** | to_do_list                  | Goal-Plan-Task |
| **性能**     | 基准                        | 10-50x 提升    |

---

## 📚 下一步

- 阅读 [模式系统](mode-system.md) 了解重构后的模式驱动架构
- 阅读 [动作系统](action-system.md) 了解动作的设计和实现
- 阅读 [状态管理](state-management.md) 了解 GameState 和缓存系统
- 阅读 [代理系统](agent-system.md) 了解 Agent 的工作原理

## 🔄 最新更新 (2025-11-02)

### 模式系统重构

- ✅ **移除策略系统**：简化架构，解决死循环问题
- ✅ **实现监听器机制**：基于 GameStateListener 的实时响应
- ✅ **统一模式驱动**：每个模式包含完整的业务逻辑
- ✅ **增强安全机制**：超时保护、异常恢复、强制切换

### 架构优势

- 🎯 **简洁性**：移除过度工程化的中间层
- ⚡ **响应性**：实时威胁检测和模式切换
- 🛡️ **稳定性**：多层保护机制，避免系统崩溃
- 🔧 **可维护性**：清晰的职责分离，完整的类型安全

详见 [模式系统重构总结](mode-system-refactor-summary.md)

---

_最后更新: 2025-11-02_
