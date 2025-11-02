# Maicraft-Next 架构分析与优化建议

**生成日期**: 2025-11-02  
**更新日期**: 2025-11-02  
**项目版本**: 2.0  
**分析者**: AI Assistant

---

## 📋 目录

1. [执行摘要](#执行摘要)
2. [架构职责不清的问题](#架构职责不清的问题)
3. [具体优化建议](#具体优化建议)
4. [重构优先级](#重构优先级)
5. [实施路线图](#实施路线图)

---

## 执行摘要

### 🎯 分析目标

对 Maicraft-Next 项目进行全面架构审查，识别职责不清、耦合过紧、设计不合理的部分，并提供可执行的优化方案。

### 📊 主要发现

本次分析发现了 **7 个主要架构问题**，涉及：

- **职责边界模糊** (3个问题)
- **依赖关系混乱** (2个问题)
- **资源管理不当** (2个问题)

### ⚡ 优化收益

预期优化后可获得：

- 🎯 **更清晰的职责分离** - 每个类专注于单一职责
- 🔧 **更容易的测试和维护** - 降低耦合度
- 🚀 **更好的扩展性** - 符合开闭原则
- 📦 **更统一的依赖管理** - 使用依赖注入

---

## 架构职责不清的问题

（前面的问题已经解决）

### 🟡 问题 5: ModeManager 和决策循环职责重叠 (中等)

#### 问题描述

`ModeManager` 负责模式管理，但 `MainDecisionLoop` 也要检查模式：

```typescript:46:52
// 检查是否允许 LLM 决策
if (!this.state.modeManager.canUseLLMDecision()) {
  const autoSwitched = await this.state.modeManager.checkAutoTransitions();
  if (!autoSwitched) {
    await this.sleep(1000);
  }
  return;
}
```

#### 问题

1. **职责不清** - 谁负责决定是否执行决策？
2. **逻辑分散** - 模式切换逻辑分布在多个地方
3. **扩展困难** - 添加新模式需要修改多处代码

#### 优化建议

**引入策略模式 + 责任链模式**

```typescript
/**
 * 决策策略接口
 */
interface DecisionStrategy {
  canExecute(state: AgentState): boolean;
  execute(state: AgentState): Promise<void>;
  getPriority(): number;
}

/**
 * LLM 决策策略
 */
class LLMDecisionStrategy implements DecisionStrategy {
  constructor(
    private llmManager: LLMManager,
    private dataCollector: PromptDataCollector,
  ) {}

  canExecute(state: AgentState): boolean {
    // 只有在允许 LLM 决策的模式下才执行
    return state.modeManager.canUseLLMDecision();
  }

  async execute(state: AgentState): Promise<void> {
    // 执行 LLM 决策
    const inputData = this.dataCollector.collectAllData();
    const prompt = promptManager.generatePrompt('main_thinking', inputData);
    // ... 其余逻辑
  }

  getPriority(): number {
    return 10;
  }
}

/**
 * 模式自动切换策略
 */
class AutoModeSwitchStrategy implements DecisionStrategy {
  canExecute(state: AgentState): boolean {
    // 总是可以检查模式切换
    return true;
  }

  async execute(state: AgentState): Promise<void> {
    await state.modeManager.checkAutoTransitions();
  }

  getPriority(): number {
    return 100; // 高优先级
  }
}

/**
 * 战斗策略
 */
class CombatStrategy implements DecisionStrategy {
  canExecute(state: AgentState): boolean {
    return state.modeManager.getCurrentMode() === ModeType.COMBAT;
  }

  async execute(state: AgentState): Promise<void> {
    // 执行战斗逻辑
  }

  getPriority(): number {
    return 50;
  }
}

/**
 * 决策策略管理器
 */
class DecisionStrategyManager {
  private strategies: DecisionStrategy[] = [];

  addStrategy(strategy: DecisionStrategy): void {
    this.strategies.push(strategy);
    // 按优先级排序
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority());
  }

  async executeStrategies(state: AgentState): Promise<boolean> {
    for (const strategy of this.strategies) {
      if (strategy.canExecute(state)) {
        await strategy.execute(state);
        return true; // 执行了一个策略就返回
      }
    }
    return false; // 没有策略可执行
  }
}

/**
 * 简化后的 MainDecisionLoop
 */
export class MainDecisionLoop extends BaseLoop<AgentState> {
  private strategyManager: DecisionStrategyManager;

  constructor(state: AgentState, llmManager: LLMManager) {
    super(state, 'MainDecisionLoop');

    this.strategyManager = new DecisionStrategyManager();

    // 注册策略
    this.strategyManager.addStrategy(new AutoModeSwitchStrategy());
    this.strategyManager.addStrategy(new CombatStrategy());
    this.strategyManager.addStrategy(new LLMDecisionStrategy(llmManager, new PromptDataCollector(state)));
  }

  protected async runLoopIteration(): Promise<void> {
    // 检查中断
    if (this.state.interrupt.isInterrupted()) {
      this.handleInterrupt();
      return;
    }

    // 执行策略
    const executed = await this.strategyManager.executeStrategies(this.state);

    if (!executed) {
      // 没有策略执行，等待一下
      await this.sleep(1000);
    }
  }
}
```

---


### 🟠 问题 6: LLMManager 在多处创建 (中等)

#### 问题描述

`LLMManager` 既有全局创建，又在 `MainDecisionLoop` 中可能创建新实例：

**全局创建（main.ts）**

```typescript:138:141
this.llmManager = createLLMManager(this.config.llm, this.logger);
this.logger.info('✅ LLM管理器初始化完成', {
  provider: this.llmManager.getActiveProvider(),
});
```

**可能的局部创建（MainDecisionLoop.ts）**

```typescript:22:22
this.llmManager = llmManager || new LLMManager(state.config.llm, this.logger);
```

#### 问题

1. **资源浪费** - 可能创建多个 LLMManager 实例
2. **状态不同步** - 不同实例的用量统计、配置等不同步
3. **职责不清** - 谁负责创建和管理 LLMManager？

#### 优化建议

**使用单例模式 + 依赖注入**

```typescript
/**
 * LLMManager 工厂 - 确保单例
 */
class LLMManagerFactory {
  private static instance: LLMManager | null = null;

  static create(config: LLMConfig, logger?: Logger): LLMManager {
    if (this.instance) {
      throw new Error('LLMManager already exists');
    }
    this.instance = new LLMManager(config, logger);
    return this.instance;
  }

  static getInstance(): LLMManager {
    if (!this.instance) {
      throw new Error('LLMManager not initialized');
    }
    return this.instance;
  }

  static reset(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }
}

// 在 main.ts 中创建
this.llmManager = LLMManagerFactory.create(this.config.llm, this.logger);

// 在 MainDecisionLoop 中使用
constructor(state: AgentState, llmManager: LLMManager) {
  super(state, 'MainDecisionLoop');
  this.llmManager = llmManager; // 必须传入，不允许创建
}
```

---

### 🟠 问题 7: 事件监听设置分散 (中等)

#### 问题描述

事件监听在多个地方设置：

**main.ts - 连接相关事件**

```typescript:300:316
// 连接状态事件（main.ts 只负责连接管理，不处理游戏逻辑）
this.bot.on('error', error => {
  this.logger.error('Bot错误', undefined, error as Error);
});

this.bot.on('kicked', reason => {
  this.logger.warn('被服务器踢出', { reason });
  this.handleDisconnect('kicked');
});

this.bot.on('end', reason => {
  this.logger.warn('连接断开', { reason });
  this.handleDisconnect('ended');
});

// 游戏事件监听已移至 Agent.ts，由 Agent 统一处理游戏逻辑
```

**Agent.ts - 游戏逻辑事件**

```typescript:205:247
private setupEventListeners(): void {
  const { context, interrupt, modeManager } = this.state;

  // 受伤事件 - 切换到战斗模式
  context.events.on('entityHurt', async (data: any) => {
    if (data.entity?.id === context.bot.entity?.id) {
      // 只有当受伤的是自己时才切换模式
      await modeManager.trySetMode(ModeType.COMBAT, '受到攻击');
      this.state.memory.recordThought('⚔️ 受到攻击，切换到战斗模式', { entity: data.entity });
    }
  });

  // 死亡事件 - 触发中断
  context.events.on('death', () => {
    interrupt.trigger('玩家死亡');
    this.logger.warn('💀 玩家死亡');
    this.state.memory.recordThought('💀 玩家死亡，需要重生', {});
  });

  // 重生事件 - 恢复正常状态
  context.events.on('spawn', () => {
    this.logger.info('🎮 玩家重生');
    this.state.memory.recordThought('🎮 玩家重生，恢复正常活动', {});
  });

  // 健康和饥饿状态变化 - AI决策相关
  context.events.on('health', (data: any) => {
    const { health, food } = data;

    // 低血量警告
    if (health < 6) {
      this.state.memory.recordThought('⚠️ 生命值过低，需要回血或进食', { health });
    }

    // 低饥饿值警告
    if (food < 6) {
      this.state.memory.recordThought('⚠️ 饥饿值过低，需要进食', { food });
    }

    // 记录健康状态变化
    this.logger.debug(`健康状态更新: 生命值 ${health}/20, 饥饿值 ${food}/20`);
  });
}
```

**GameState.ts - 状态更新事件**

```typescript:118:156
// 监听健康变化
bot.on('health', () => {
  this.updateHealth(bot);
  this.updateFood(bot);
});

// 监听位置移动
bot.on('move', () => {
  this.updatePosition(bot);
});

// 监听经验变化
bot.on('experience', () => {
  this.updateExperience(bot);
});

// 监听物品栏变化
bot.on('windowUpdate', () => {
  this.updateInventory(bot);
});

// 监听天气和时间
bot.on('time', () => {
  this.timeOfDay = bot.time.timeOfDay;
});

bot.on('weather', () => {
  this.weather = bot.thunderState ? 'thunder' : bot.isRaining ? 'rain' : 'clear';
});

// 监听睡眠状态
bot.on('sleep', () => {
  this.isSleeping = true;
});

bot.on('wake', () => {
  this.isSleeping = false;
});
```

#### 问题

1. **职责分散** - 事件处理逻辑分散在多个文件
2. **难以追踪** - 不清楚哪些事件被监听，在哪里处理
3. **内存泄漏风险** - 事件监听器可能没有正确清理
4. **重复监听** - 同一事件可能在多处监听

#### 优化建议

**引入事件路由器**

```typescript
/**
 * 事件处理器接口
 */
interface IEventHandler {
  readonly eventName: string;
  handle(data: any): void | Promise<void>;
}

/**
 * 事件路由器 - 统一管理所有事件监听
 */
class EventRouter {
  private handlers = new Map<string, IEventHandler[]>();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || getLogger('EventRouter');
  }

  /**
   * 注册事件处理器
   */
  register(handler: IEventHandler): void {
    const handlers = this.handlers.get(handler.eventName) || [];
    handlers.push(handler);
    this.handlers.set(handler.eventName, handlers);
    this.logger.debug(`注册事件处理器: ${handler.eventName} -> ${handler.constructor.name}`);
  }

  /**
   * 批量注册
   */
  registerAll(handlers: IEventHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  /**
   * 绑定到 Bot
   */
  bindToBot(bot: Bot): void {
    for (const [eventName, handlers] of this.handlers.entries()) {
      bot.on(eventName, async (data: any) => {
        for (const handler of handlers) {
          try {
            await handler.handle(data);
          } catch (error) {
            this.logger.error(`事件处理器执行失败: ${handler.constructor.name}`, error);
          }
        }
      });
    }
    this.logger.info(`绑定了 ${this.handlers.size} 个事件到 Bot`);
  }

  /**
   * 清理所有监听器
   */
  cleanup(bot: Bot): void {
    for (const eventName of this.handlers.keys()) {
      bot.removeAllListeners(eventName);
    }
    this.handlers.clear();
  }
}

/**
 * 具体的事件处理器
 */

// 健康事件处理器
class HealthEventHandler implements IEventHandler {
  readonly eventName = 'health';

  constructor(
    private gameState: GameState,
    private memory: MemoryManager,
  ) {}

  async handle(data: any): Promise<void> {
    // 更新状态
    this.gameState.updateHealth(data.health);
    this.gameState.updateFood(data.food);

    // 记录警告
    if (data.health < 6) {
      this.memory.recordThought('⚠️ 生命值过低，需要回血或进食', { health: data.health });
    }

    if (data.food < 6) {
      this.memory.recordThought('⚠️ 饥饿值过低，需要进食', { food: data.food });
    }
  }
}

// 受伤事件处理器
class EntityHurtEventHandler implements IEventHandler {
  readonly eventName = 'entityHurt';

  constructor(
    private bot: Bot,
    private modeManager: ModeManager,
    private memory: MemoryManager,
  ) {}

  async handle(data: any): Promise<void> {
    // 只处理自己受伤
    if (data.entity?.id !== this.bot.entity?.id) {
      return;
    }

    await this.modeManager.trySetMode(ModeType.COMBAT, '受到攻击');
    this.memory.recordThought('⚔️ 受到攻击，切换到战斗模式', { entity: data.entity });
  }
}

// 死亡事件处理器
class DeathEventHandler implements IEventHandler {
  readonly eventName = 'death';

  constructor(
    private interrupt: InterruptController,
    private memory: MemoryManager,
    private logger: Logger,
  ) {}

  async handle(): Promise<void> {
    this.interrupt.trigger('玩家死亡');
    this.logger.warn('💀 玩家死亡');
    this.memory.recordThought('💀 玩家死亡，需要重生', {});
  }
}

/**
 * 事件处理器工厂
 */
class EventHandlerFactory {
  static createAllHandlers(bot: Bot, state: AgentState): IEventHandler[] {
    const { context, memory, modeManager, interrupt } = state;

    return [
      new HealthEventHandler(context.gameState, memory),
      new EntityHurtEventHandler(bot, modeManager, memory),
      new DeathEventHandler(interrupt, memory, context.logger),
      // ... 其他处理器
    ];
  }
}

// 使用方式
class Agent {
  private eventRouter: EventRouter;

  constructor(/* ... */) {
    // 创建事件路由器
    this.eventRouter = new EventRouter(this.logger);

    // 注册所有处理器
    const handlers = EventHandlerFactory.createAllHandlers(this.bot, this.state);
    this.eventRouter.registerAll(handlers);

    // 绑定到 bot
    this.eventRouter.bindToBot(this.bot);
  }

  async stop(): Promise<void> {
    // 清理事件监听
    this.eventRouter.cleanup(this.bot);
    // ...
  }
}
```

---

### 🟡 问题 8: 提示词系统初始化时机不当 (中等)

#### 问题描述

`promptManager` 是全局单例，但在 `MainDecisionLoop` 构造函数中初始化：

```typescript:24:29
// 初始化提示词模板（只初始化一次）
if (!this.promptsInitialized) {
  initAllTemplates();
  this.promptsInitialized = true;
  this.logger.info('✅ 提示词模板初始化完成');
}
```

#### 问题

1. **职责不清** - MainDecisionLoop 不应该负责初始化全局资源
2. **依赖隐式** - 使用全局 `promptManager` 但初始化在构造函数中
3. **测试困难** - 难以 mock promptManager
4. **时机不当** - 应该在应用启动时初始化，而不是在循环创建时

#### 优化建议

**在应用启动时初始化**

```typescript
// main.ts
class MaicraftNext {
  async initialize(): Promise<void> {
    try {
      // 1. 加载配置
      await this.loadConfiguration();

      // 2. 初始化日志系统
      this.logger.info('🚀 Maicraft-Next 正在启动...');

      // 3. 初始化提示词系统
      await this.initializePromptSystem();

      // 4. 初始化LLM管理器
      await this.initializeLLM();

      // 5. 连接到Minecraft服务器
      await this.connectToMinecraft();

      // 6. 初始化核心系统
      await this.initializeCore();

      // 7. 初始化AI代理
      await this.initializeAgent();

      // 8. 启动AI代理
      await this.startAgent();

      this.logger.info('✅ Maicraft-Next 启动完成');
    } catch (error) {
      this.logger.error('初始化失败', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 初始化提示词系统
   */
  private async initializePromptSystem(): Promise<void> {
    this.logger.info('初始化提示词系统...');

    // 初始化所有模板
    initAllTemplates();

    // 验证模板
    const templates = promptManager.listTemplates();
    this.logger.info(`✅ 提示词系统初始化完成，加载了 ${templates.length} 个模板`);
  }
}

// MainDecisionLoop 中不再初始化
export class MainDecisionLoop extends BaseLoop<AgentState> {
  constructor(state: AgentState, llmManager: LLMManager) {
    super(state, 'MainDecisionLoop');
    this.llmManager = llmManager;
    // 不再初始化 promptManager
  }
}
```

---

## 具体优化建议

### 📦 建议 1: 引入依赖注入容器

**目标**: 解决依赖管理混乱、职责不清的问题

**实施方案**:

创建一个简单的 DI 容器：

```typescript
/**
 * 依赖注入容器
 */
class DIContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();

  /**
   * 注册单例服务
   */
  registerSingleton<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  /**
   * 注册工厂
   */
  registerFactory<T>(name: string, factory: () => T): void {
    this.factories.set(name, factory);
  }

  /**
   * 获取服务
   */
  get<T>(name: string): T {
    // 先查找已注册的实例
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    // 然后查找工厂
    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!;
      const instance = factory();
      this.services.set(name, instance); // 缓存实例
      return instance as T;
    }

    throw new Error(`Service ${name} not found`);
  }

  /**
   * 检查服务是否存在
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * 清空容器
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}

// 全局容器实例
export const container = new DIContainer();

// 服务名称常量
export const ServiceNames = {
  BOT: 'bot',
  CONFIG: 'config',
  LOGGER: 'logger',
  GAME_STATE: 'gameState',
  BLOCK_CACHE: 'blockCache',
  CONTAINER_CACHE: 'containerCache',
  LOCATION_MANAGER: 'locationManager',
  EVENT_EMITTER: 'eventEmitter',
  CONTEXT_MANAGER: 'contextManager',
  ACTION_EXECUTOR: 'actionExecutor',
  LLM_MANAGER: 'llmManager',
  AGENT_STATE: 'agentState',
  AGENT: 'agent',
} as const;

// 在 main.ts 中注册所有服务
class MaicraftNext {
  async initialize(): Promise<void> {
    // 1. 注册基础服务
    container.registerSingleton(ServiceNames.CONFIG, this.config!);
    container.registerSingleton(ServiceNames.LOGGER, this.logger);
    container.registerSingleton(ServiceNames.BOT, this.bot!);
    container.registerSingleton(ServiceNames.GAME_STATE, globalGameState);

    // 2. 注册缓存服务（工厂模式，延迟创建）
    container.registerFactory(ServiceNames.BLOCK_CACHE, () => new BlockCache());
    container.registerFactory(ServiceNames.CONTAINER_CACHE, () => new ContainerCache());
    container.registerFactory(ServiceNames.LOCATION_MANAGER, () => new LocationManager());

    // 3. 注册 ContextManager
    container.registerFactory(ServiceNames.CONTEXT_MANAGER, () => {
      const manager = new ContextManager();
      manager.createContext({
        bot: container.get(ServiceNames.BOT),
        executor: container.get(ServiceNames.ACTION_EXECUTOR),
        config: container.get(ServiceNames.CONFIG),
        logger: container.get(ServiceNames.LOGGER),
      });
      return manager;
    });

    // 4. 注册 ActionExecutor
    container.registerFactory(ServiceNames.ACTION_EXECUTOR, () => {
      const contextManager = container.get<ContextManager>(ServiceNames.CONTEXT_MANAGER);
      const logger = container.get<Logger>(ServiceNames.LOGGER);
      return new ActionExecutor(contextManager, logger);
    });

    // 5. 注册 LLMManager
    container.registerSingleton(ServiceNames.LLM_MANAGER, this.llmManager!);

    // 6. 注册 AgentState
    container.registerFactory(ServiceNames.AGENT_STATE, () => {
      const contextFactory = new AgentContextFactory();
      const context = container.get<ContextManager>(ServiceNames.CONTEXT_MANAGER).getContext();
      return contextFactory.createAgentState(context, container.get(ServiceNames.CONFIG));
    });

    // 7. 注册 Agent
    container.registerFactory(ServiceNames.AGENT, () => {
      const state = container.get<AgentState>(ServiceNames.AGENT_STATE);
      const llmManager = container.get<LLMManager>(ServiceNames.LLM_MANAGER);
      const logger = container.get<Logger>(ServiceNames.LOGGER);
      return new Agent(state, llmManager, logger);
    });

    // 8. 获取 Agent 并初始化
    this.agent = container.get<Agent>(ServiceNames.AGENT);
    await this.agent.initialize();
  }

  async shutdown(): Promise<void> {
    // 清空容器
    container.clear();
  }
}

// 在其他地方使用
class SomeClass {
  private logger: Logger;

  constructor() {
    // 从容器获取依赖
    this.logger = container.get<Logger>(ServiceNames.LOGGER);
  }
}
```

---

### 🏗️ 建议 2: 引入分层架构

**目标**: 明确各层职责，降低耦合

**分层结构**:

```
┌─────────────────────────────────────────────────┐
│           应用层 (Application Layer)             │
│  - main.ts                                      │
│  - MaicraftNext 类                              │
│  - 启动/关闭逻辑                                 │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│          AI 代理层 (Agent Layer)                 │
│  - Agent                                        │
│  - MainDecisionLoop, ChatLoop                   │
│  - MemoryManager, GoalPlanningManager           │
│  - ModeManager                                  │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│          领域层 (Domain Layer)                   │
│  - ActionExecutor                               │
│  - Action 实现                                   │
│  - GameState                                    │
│  - 业务逻辑                                      │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│       基础设施层 (Infrastructure Layer)          │
│  - LLMManager                                   │
│  - EventEmitter                                 │
│  - BlockCache, ContainerCache                   │
│  - Logger, Config                               │
│  - Mineflayer Bot                               │
└─────────────────────────────────────────────────┘
```

**依赖规则**:

- ✅ 上层可以依赖下层
- ❌ 下层不能依赖上层
- ✅ 同层之间可以通过接口依赖
- ❌ 跨层依赖必须通过依赖注入

---

### 🧪 建议 3: 提高可测试性

**目标**: 使代码易于单元测试

**措施**:

1. **依赖注入，而不是直接创建**

```typescript
// ❌ 不好：直接创建依赖
class Agent {
  private memory: MemoryManager;

  constructor() {
    this.memory = new MemoryManager(); // 硬编码依赖
  }
}

// ✅ 好：依赖注入
class Agent {
  constructor(private memory: MemoryManager) {
    // 依赖从外部传入
  }
}

// 测试时可以注入 mock
const mockMemory = new MockMemoryManager();
const agent = new Agent(mockMemory);
```

2. **使用接口，而不是具体类**

```typescript
// 定义接口
interface IMemoryManager {
  recordThought(content: string): void;
  recordDecision(intention: string, actions: any[]): void;
  buildContextSummary(options: any): string;
}

// Agent 依赖接口
class Agent {
  constructor(private memory: IMemoryManager) {}
}

// 测试时使用 mock 实现
class MockMemoryManager implements IMemoryManager {
  recordThought(content: string): void {
    // mock 实现
  }
  // ...
}
```

3. **提取函数，减少副作用**

```typescript
// ❌ 不好：副作用多，难以测试
class MainDecisionLoop {
  async executeDecisionCycle(): Promise<void> {
    const data = this.getAllData(); // 依赖多个状态
    const prompt = promptManager.generatePrompt('main_thinking', data); // 全局依赖
    const response = await this.llmManager.chat([...]); // 网络请求
    // ...
  }
}

// ✅ 好：职责分离，易于测试
class MainDecisionLoop {
  constructor(
    private dataCollector: IDataCollector,
    private promptGenerator: IPromptGenerator,
    private llmClient: ILLMClient
  ) {}

  async executeDecisionCycle(): Promise<void> {
    const data = this.dataCollector.collect();
    const prompt = this.promptGenerator.generate('main_thinking', data);
    const response = await this.llmClient.chat([...]);
    // ...
  }
}

// 测试时可以 mock 所有依赖
const mockDataCollector = { collect: () => ({ /* ... */ }) };
const mockPromptGenerator = { generate: () => 'test prompt' };
const mockLLMClient = { chat: async () => ({ /* ... */ }) };

const loop = new MainDecisionLoop(
  mockDataCollector,
  mockPromptGenerator,
  mockLLMClient
);
```

---

### 📝 建议 4: 统一错误处理

**目标**: 统一的错误处理机制

**实施方案**:

```typescript
/**
 * 自定义错误基类
 */
abstract class BaseError extends Error {
  abstract readonly code: string;
  readonly timestamp: number;

  constructor(
    message: string,
    public readonly context?: any,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 具体错误类型
 */
class ActionExecutionError extends BaseError {
  readonly code = 'ACTION_EXECUTION_ERROR';

  constructor(
    message: string,
    public readonly actionId: string,
    context?: any,
  ) {
    super(message, context);
  }
}

class LLMError extends BaseError {
  readonly code = 'LLM_ERROR';

  constructor(
    message: string,
    public readonly provider: string,
    context?: any,
  ) {
    super(message, context);
  }
}

class ConfigurationError extends BaseError {
  readonly code = 'CONFIGURATION_ERROR';
}

/**
 * 错误处理器
 */
class ErrorHandler {
  constructor(private logger: Logger) {}

  handle(error: Error): void {
    if (error instanceof BaseError) {
      this.handleCustomError(error);
    } else {
      this.handleUnknownError(error);
    }
  }

  private handleCustomError(error: BaseError): void {
    this.logger.error(`[${error.code}] ${error.message}`, {
      code: error.code,
      context: error.context,
      timestamp: error.timestamp,
      stack: error.stack,
    });

    // 根据错误类型执行特定处理
    if (error instanceof ActionExecutionError) {
      // 处理动作执行错误
    } else if (error instanceof LLMError) {
      // 处理 LLM 错误（可能需要重试或切换提供商）
    }
  }

  private handleUnknownError(error: Error): void {
    this.logger.error(`[UNKNOWN_ERROR] ${error.message}`, {
      stack: error.stack,
    });
  }
}

// 使用方式
const errorHandler = new ErrorHandler(logger);

try {
  await executor.execute('mine_block', { name: 'stone' });
} catch (error) {
  errorHandler.handle(error as Error);
}
```

---

### 📊 建议 5: 引入配置验证

**目标**: 在启动时验证配置的完整性和正确性

```typescript
/**
 * 配置验证器
 */
class ConfigValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  validate(config: AppConfig): ValidationResult {
    this.errors = [];
    this.warnings = [];

    // 验证 Minecraft 配置
    this.validateMinecraftConfig(config.minecraft);

    // 验证 LLM 配置
    this.validateLLMConfig(config.llm);

    // 验证 Agent 配置
    this.validateAgentConfig(config.agent);

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private validateMinecraftConfig(config: any): void {
    if (!config.host) {
      this.errors.push('minecraft.host is required');
    }

    if (!config.port) {
      this.errors.push('minecraft.port is required');
    } else if (config.port < 1 || config.port > 65535) {
      this.errors.push('minecraft.port must be between 1 and 65535');
    }

    if (!config.username) {
      this.errors.push('minecraft.username is required');
    } else if (config.username.length < 3 || config.username.length > 16) {
      this.errors.push('minecraft.username must be between 3 and 16 characters');
    }
  }

  private validateLLMConfig(config: any): void {
    if (!config.default_provider) {
      this.errors.push('llm.default_provider is required');
    }

    // 验证至少有一个提供商启用
    const providersEnabled = [config.openai?.enabled, config.azure?.enabled, config.anthropic?.enabled].some(enabled => enabled);

    if (!providersEnabled) {
      this.errors.push('At least one LLM provider must be enabled');
    }

    // 验证 OpenAI 配置
    if (config.openai?.enabled) {
      if (!config.openai.api_key) {
        this.errors.push('llm.openai.api_key is required when openai is enabled');
      }

      if (!config.openai.model) {
        this.warnings.push('llm.openai.model is not set, will use default');
      }
    }
  }

  private validateAgentConfig(config: any): void {
    if (!config?.goal) {
      this.warnings.push('agent.goal is not set, will use default');
    }
  }
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// 在启动时验证
class MaicraftNext {
  async initialize(): Promise<void> {
    // 加载配置
    await this.loadConfiguration();

    // 验证配置
    const validator = new ConfigValidator();
    const result = validator.validate(this.config!);

    // 输出警告
    for (const warning of result.warnings) {
      this.logger.warn(`配置警告: ${warning}`);
    }

    // 如果有错误，停止启动
    if (!result.isValid) {
      for (const error of result.errors) {
        this.logger.error(`配置错误: ${error}`);
      }
      throw new ConfigurationError('Configuration validation failed');
    }

    // 继续启动...
  }
}
```

---

## 重构优先级

### 🔴 高优先级（立即处理）

1. **ActionExecutor 职责分离** - 移除提示词生成职责，创建 ActionPromptGenerator
2. **MainDecisionLoop 数据收集重构** - 引入 PromptDataCollector
3. **事件监听统一管理** - 引入 EventRouter

**预期收益**:

- 显著提升代码可维护性
- 解决当前的架构债务
- 为后续扩展打好基础

**实施时间**: 2-3 周

---

### 🟡 中优先级（近期处理）

4. **提示词系统初始化优化** - 在启动时初始化
5. **LLMManager 单例管理** - 使用工厂确保单例
6. **全局状态访问规范** - 统一使用 context 或服务定位器

**预期收益**:

- 提高代码清晰度
- 减少职责重叠
- 提升测试覆盖率

**实施时间**: 2-3 周

---

### 🟢 低优先级（长期优化）

7. **ModeManager 和决策循环解耦** - 引入策略模式
8. **引入依赖注入容器** - 全面使用 DI 管理依赖

**预期收益**:

- 进一步优化架构
- 提高扩展性
- 减少潜在 bug

**实施时间**: 持续优化

---

## 实施路线图

### 第一阶段：职责分离 (2-3 周)

**目标**: 解决最紧急的职责不清问题

**任务列表**:

- [ ] 创建 `ActionPromptGenerator` 类，从 ActionExecutor 中分离提示词生成
- [ ] 创建 `PromptDataCollector` 类，从 MainDecisionLoop 中分离数据收集
- [ ] 创建 `EventRouter` 和事件处理器，从多个类中统一事件监听
- [ ] 编写单元测试覆盖重构部分

**成功标准**:

- ActionExecutor 只负责动作执行
- MainDecisionLoop 只负责决策循环逻辑
- 事件监听统一管理

---

### 第二阶段：系统优化 (2-3 周)

**目标**: 解决系统级配置和资源管理问题

**任务列表**:

- [ ] 将提示词系统初始化移至应用启动时
- [ ] 实现 `LLMManagerFactory` 确保单例模式
- [ ] 规范全局状态访问，减少直接导入 `globalGameState`
- [ ] 添加配置验证机制

**成功标准**:

- 提示词系统在启动时初始化
- LLMManager 单例保证
- 全局状态访问规范化

---

### 第三阶段：架构重构 (长期)

**目标**: 引入现代架构模式

**任务列表**:

- [ ] 引入策略模式优化 ModeManager 和决策循环
- [ ] 创建 `DIContainer` 全面使用依赖注入
- [ ] 完善错误处理机制
- [ ] 优化性能瓶颈

**成功标准**:

- 架构更加清晰和可扩展
- 依赖注入全面应用
- 测试覆盖率 > 80%

---

## 附录：重构前后对比

### 对比 1: Agent 创建

**重构前**:

```typescript
const agent = new Agent(bot, executor, llmManager, config, logger);
// Agent 内部创建所有子系统
```

**重构后**:

```typescript
const contextFactory = new AgentContextFactory();
const context = contextFactory.createContext(bot, config);
const state = contextFactory.createAgentState(context, config);
const agent = new Agent(state, llmManager, logger);
// 所有依赖显式创建和注入
```

---

### 对比 2: ActionExecutor 职责分离

**重构前**:

```typescript
// ActionExecutor 承担过多职责
export class ActionExecutor {
  // 缓存管理
  private blockCache: BlockCache;
  private containerCache: ContainerCache;

  // 事件发射
  private events: EventEmitter;

  // 提示词生成
  generatePrompt(): string {
    // 复杂的提示词生成逻辑
  }

  // 动作执行
  async execute(actionId: T, params: ActionParamsMap[T]) {
    // 执行逻辑
  }
}
```

**重构后**:

```typescript
// ActionExecutor 只负责动作执行
export class ActionExecutor {
  constructor(contextManager: ContextManager, logger: Logger) {}

  async execute(actionId: T, params: ActionParamsMap[T]) {
    const context = this.contextManager.createActionContext(actionName);
    // 只关注执行逻辑
  }
}

// 提示词生成分离到独立类
export class ActionPromptGenerator {
  constructor(private executor: ActionExecutor) {}

  generatePrompt(): string {
    // 专门负责提示词生成
  }
}
```

---

### 对比 3: 事件监听

**重构前**:

```typescript
// main.ts
bot.on('error', ...);
bot.on('kicked', ...);

// Agent.ts
context.events.on('entityHurt', ...);
context.events.on('death', ...);

// GameState.ts
bot.on('health', ...);
bot.on('move', ...);
```

**重构后**:

```typescript
// 统一注册
const eventRouter = new EventRouter(logger);
const handlers = EventHandlerFactory.createAllHandlers(bot, state);
eventRouter.registerAll(handlers);
eventRouter.bindToBot(bot);

// 清理时统一移除
eventRouter.cleanup(bot);
```

---

## 总结

本次架构分析发现了 **8 个主要架构问题**，涵盖职责分离、依赖管理、资源管理等多个方面。其中 **4 个问题已解决**，**4 个问题尚待解决**。通过实施本文档提出的优化建议，可以显著提升代码质量、可维护性和可测试性。

**已解决的关键问题**:

1. ✅ **RuntimeContext 统一管理** - 通过 ContextManager 统一创建和管理
2. ✅ **缓存系统实现** - BlockCache、ContainerCache、LocationManager 已实现完整功能
3. ✅ **ActionExecutor 缓存管理分离** - 不再直接管理缓存实例
4. ✅ **全局状态访问规范** - 统一通过 RuntimeContext 访问，移除直接导入

**剩余关键改进**:

1. 🔄 **职责单一** - ActionExecutor 仍承担提示词生成职责
2. 🔄 **统一管理** - 事件监听仍分散在多个类中
3. 🔄 **依赖注入** - 尚未引入 DI 容器
4. 🔄 **系统优化** - 提示词初始化和 LLMManager 单例管理待完善

**实施建议**:

- 优先处理高优先级问题
- 每个阶段完成后进行测试
- 保持向后兼容
- 逐步迁移现有代码

---

**文档维护**:

本文档应随着项目的演进持续更新。欢迎团队成员提出改进建议和补充。

---

**参考资料**:

- [SOLID 原则](https://en.wikipedia.org/wiki/SOLID)
- [依赖注入模式](https://en.wikipedia.org/wiki/Dependency_injection)
- [分层架构](https://en.wikipedia.org/wiki/Multitier_architecture)
- [设计模式](https://refactoring.guru/design-patterns)
