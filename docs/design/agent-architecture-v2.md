# maicraft-next Agent 架构设计 v2.0

> **改进版本**: 基于对原 maicraft 架构的深度反思和重新设计

---

## 🎯 架构问题分析与改进

### 问题 1: ThinkingLog 设计混乱

**原设计的问题**:

```python
# maicraft 的 ThinkingLog
- ❌ 混合多种类型日志（thinking, action, event, notice）但职责不清
- ❌ 与 event_store 重复，event 类型日志又从 event_store 获取（循环依赖）
- ❌ 多个 get 方法（get_thinking_log, get_thinking_log_full）逻辑重复
- ❌ 硬编码的数量限制（-3, -8, -5, -10）缺乏灵活性
- ❌ 作为"AI记忆"却混入了游戏事件，职责混乱
```

**改进方案**: **分离关注点 + 结构化存储**

```typescript
/**
 * AI 记忆系统 - 只负责 AI 的思考和决策过程
 * 游戏事件由 EventStore 管理，不在这里存储
 */
class AIMemory {
  private thoughtStream: ThoughtEntry[] = []; // 思考流
  private conversationHistory: ConversationEntry[] = []; // 对话历史
  private decisionHistory: DecisionEntry[] = []; // 决策历史

  private maxThoughts = 50;
  private maxConversations = 30;
  private maxDecisions = 100;

  /**
   * 记录思考过程
   */
  recordThought(content: string, context?: Record<string, any>): void {
    this.thoughtStream.push({
      id: this.generateId(),
      content,
      context,
      timestamp: Date.now(),
    });

    this.limitSize(this.thoughtStream, this.maxThoughts);
  }

  /**
   * 记录对话
   */
  recordConversation(speaker: 'ai' | 'player', message: string, context?: Record<string, any>): void {
    this.conversationHistory.push({
      id: this.generateId(),
      speaker,
      message,
      context,
      timestamp: Date.now(),
    });

    this.limitSize(this.conversationHistory, this.maxConversations);
  }

  /**
   * 记录决策
   */
  recordDecision(intention: string, actions: ActionCall[], result: 'success' | 'failed' | 'interrupted', feedback?: string): void {
    this.decisionHistory.push({
      id: this.generateId(),
      intention,
      actions,
      result,
      feedback,
      timestamp: Date.now(),
    });

    this.limitSize(this.decisionHistory, this.maxDecisions);
  }

  /**
   * 构建上下文摘要（用于 LLM prompt）
   * 灵活的查询接口，按需组合
   */
  buildContextSummary(options: {
    includeThoughts?: number; // 最近 N 条思考
    includeConversations?: number; // 最近 N 条对话
    includeDecisions?: number; // 最近 N 条决策
    includeEvents?: number; // 最近 N 条游戏事件（从 EventStore 获取）
    timeRange?: [number, number]; // 时间范围过滤
  }): string {
    const parts: string[] = [];

    // 最近的思考
    if (options.includeThoughts) {
      const thoughts = this.getRecentThoughts(options.includeThoughts, options.timeRange);
      if (thoughts.length > 0) {
        parts.push('【最近思考】');
        parts.push(thoughts.map(t => `${this.formatTime(t.timestamp)}: ${t.content}`).join('\n'));
      }
    }

    // 最近的对话
    if (options.includeConversations) {
      const conversations = this.getRecentConversations(options.includeConversations, options.timeRange);
      if (conversations.length > 0) {
        parts.push('\n【最近对话】');
        parts.push(conversations.map(c => `${this.formatTime(c.timestamp)} ${c.speaker === 'ai' ? '[我]' : '[玩家]'}: ${c.message}`).join('\n'));
      }
    }

    // 最近的决策
    if (options.includeDecisions) {
      const decisions = this.getRecentDecisions(options.includeDecisions, options.timeRange);
      if (decisions.length > 0) {
        parts.push('\n【最近决策】');
        parts.push(
          decisions
            .map(d => {
              const icon = d.result === 'success' ? '✅' : d.result === 'failed' ? '❌' : '⚠️';
              return `${this.formatTime(d.timestamp)} ${icon} ${d.intention}`;
            })
            .join('\n'),
        );
      }
    }

    // 最近的游戏事件（从 EventStore 获取，不在 AIMemory 存储）
    if (options.includeEvents) {
      const events = this.context.events.getRecentEvents(options.includeEvents, options.timeRange);
      if (events.length > 0) {
        parts.push('\n【最近游戏事件】');
        parts.push(events.map(e => `${this.formatTime(e.timestamp)} ${e.toString()}`).join('\n'));
      }
    }

    return parts.join('\n');
  }

  /**
   * 获取最近的思考
   */
  private getRecentThoughts(count: number, timeRange?: [number, number]): ThoughtEntry[] {
    let thoughts = [...this.thoughtStream];

    if (timeRange) {
      thoughts = thoughts.filter(t => t.timestamp >= timeRange[0] && t.timestamp <= timeRange[1]);
    }

    return thoughts.slice(-count);
  }

  private getRecentConversations(count: number, timeRange?: [number, number]): ConversationEntry[] {
    let conversations = [...this.conversationHistory];

    if (timeRange) {
      conversations = conversations.filter(c => c.timestamp >= timeRange[0] && c.timestamp <= timeRange[1]);
    }

    return conversations.slice(-count);
  }

  private getRecentDecisions(count: number, timeRange?: [number, number]): DecisionEntry[] {
    let decisions = [...this.decisionHistory];

    if (timeRange) {
      decisions = decisions.filter(d => d.timestamp >= timeRange[0] && d.timestamp <= timeRange[1]);
    }

    return decisions.slice(-count);
  }

  private limitSize<T>(array: T[], maxSize: number): void {
    if (array.length > maxSize) {
      array.splice(0, array.length - maxSize);
    }
  }

  private formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 思考条目
 */
interface ThoughtEntry {
  id: string;
  content: string;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * 对话条目
 */
interface ConversationEntry {
  id: string;
  speaker: 'ai' | 'player';
  message: string;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * 决策条目
 */
interface DecisionEntry {
  id: string;
  intention: string; // 决策意图
  actions: ActionCall[]; // 执行的动作
  result: 'success' | 'failed' | 'interrupted';
  feedback?: string; // 执行反馈
  timestamp: number;
}
```

**优势**:

- ✅ 职责清晰：AI 记忆 vs 游戏事件（EventStore）
- ✅ 结构化：不同类型的记忆分开存储
- ✅ 灵活查询：按需组合，避免硬编码
- ✅ 易于扩展：添加新的记忆类型很容易

---

### 问题 2: Agent 结构不够清晰

**原设计的问题**:

```typescript
// v1.0 的设计
class Agent {
  private decisionLoop: DecisionLoop; // DecisionLoop 持有 Agent 引用
  private chatAgent: ChatAgent; // ChatAgent 持有 Agent 引用
}

// DecisionLoop 访问 Agent 私有成员
this.agent['interruptFlag'];
this.agent['modeManager'];
// ❌ 循环依赖，职责不清
```

**改进方案**: **共享状态 + 清晰分层**

```typescript
/**
 * Agent 共享状态
 * 所有子系统都可以访问，但不能直接修改 Agent 内部实现
 */
interface AgentState {
  // 基础信息
  readonly goal: string;
  readonly isRunning: boolean;

  // 运行时上下文
  readonly context: RuntimeContext;

  // 子系统
  readonly modeManager: ModeManager;
  readonly taskManager: TaskManager;
  readonly memory: AIMemory;

  // 中断控制
  readonly interrupt: InterruptController;

  // 配置
  readonly config: Config;
}

/**
 * 中断控制器 - 独立管理中断逻辑
 */
class InterruptController {
  private interrupted: boolean = false;
  private reason: string = '';
  private callbacks: Array<(reason: string) => void> = [];

  /**
   * 触发中断
   */
  trigger(reason: string): void {
    this.interrupted = true;
    this.reason = reason;

    // 通知所有回调
    for (const callback of this.callbacks) {
      callback(reason);
    }
  }

  /**
   * 清除中断
   */
  clear(): void {
    this.interrupted = false;
    this.reason = '';
  }

  /**
   * 检查是否中断
   */
  isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * 获取中断原因
   */
  getReason(): string {
    return this.reason;
  }

  /**
   * 注册中断回调
   */
  onInterrupt(callback: (reason: string) => void): void {
    this.callbacks.push(callback);
  }
}

/**
 * Agent 主类 - 重新设计
 */
class Agent {
  // 共享状态（只读）
  readonly state: AgentState;

  // 决策系统（作为内部组件，不暴露）
  private mainLoop: MainDecisionLoop;
  private chatLoop: ChatLoop;

  // 生命周期
  private isRunning: boolean = false;

  constructor(bot: Bot, config: Config) {
    // 初始化共享状态
    this.state = this.initializeState(bot, config);

    // 初始化决策循环（传入共享状态）
    this.mainLoop = new MainDecisionLoop(this.state);
    this.chatLoop = new ChatLoop(this.state);

    // 设置事件监听
    this.setupEventListeners();
  }

  /**
   * 初始化共享状态
   */
  private initializeState(bot: Bot, config: Config): AgentState {
    const context = this.createContext(bot, config);

    return {
      goal: config.agent.goal,
      isRunning: false,
      context,
      modeManager: new ModeManager(context),
      taskManager: new TaskManager(),
      memory: new AIMemory(context),
      interrupt: new InterruptController(),
      config,
    };
  }

  /**
   * 创建运行时上下文
   */
  private createContext(bot: Bot, config: Config): RuntimeContext {
    return {
      bot,
      executor: new ActionExecutor(bot, config),
      gameState: globalGameState,
      blockCache: new BlockCache(),
      containerCache: new ContainerCache(),
      locationManager: new LocationManager(),
      events: new EventEmitter(bot),
      interruptSignal: new InterruptSignal(),
      logger: getLogger('Agent'),
      config,
    };
  }

  /**
   * 启动 Agent
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    (this.state as any).isRunning = true;

    this.state.context.logger.info('🚀 Agent 启动中...');

    // 初始化状态
    await this.state.context.gameState.initialize(this.state.context.bot);

    // 注册所有模式
    await this.state.modeManager.registerModes();
    await this.state.modeManager.setMode(ModeType.MAIN, '初始化');

    // 启动决策循环
    this.mainLoop.start();
    this.chatLoop.start();

    this.state.context.logger.info('✅ Agent 启动完成');
  }

  /**
   * 停止 Agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.state.context.logger.info('🛑 Agent 停止中...');

    this.isRunning = false;
    (this.state as any).isRunning = false;

    // 停止决策循环
    this.mainLoop.stop();
    this.chatLoop.stop();

    // 保存状态
    await this.saveState();

    this.state.context.logger.info('✅ Agent 已停止');
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    const { context, interrupt, modeManager } = this.state;

    // 受伤事件
    context.events.on('entityHurt', async data => {
      if (data.source) {
        // 尝试切换到战斗模式
        await modeManager.trySetMode(ModeType.COMBAT, '受到攻击');
      }
    });

    // 死亡事件
    context.events.on('death', () => {
      interrupt.trigger('玩家死亡');
      this.state.taskManager.pauseCurrentTask();
    });

    // 低血量警告
    context.events.on('health', data => {
      if (data.health < 6) {
        this.state.memory.recordThought('⚠️ 生命值过低，需要回血或进食', { health: data.health });
      }
    });
  }

  /**
   * 保存状态
   */
  private async saveState(): Promise<void> {
    await Promise.all([
      this.state.taskManager.save(),
      this.state.memory.save(),
      this.state.context.blockCache.save(),
      this.state.context.containerCache.save(),
      this.state.context.locationManager.save(),
    ]);
  }

  /**
   * 获取状态摘要
   */
  getStatus(): AgentStatus {
    return {
      isRunning: this.isRunning,
      currentMode: this.state.modeManager.getCurrentMode(),
      goal: this.state.goal,
      currentTask: this.state.taskManager.getCurrentTask(),
      interrupted: this.state.interrupt.isInterrupted(),
      interruptReason: this.state.interrupt.getReason(),
    };
  }
}
```

**决策循环重新设计**:

```typescript
/**
 * 主决策循环
 * 不再持有 Agent 引用，只访问共享状态
 */
class MainDecisionLoop {
  private state: AgentState;
  private isRunning: boolean = false;
  private loopTask: Promise<void> | null = null;
  private logger: Logger;

  private llmManager: LLMManager;
  private promptManager: PromptManager;

  private evaluationCounter: number = 0;

  constructor(state: AgentState) {
    this.state = state;
    this.logger = getLogger('MainDecisionLoop');

    this.llmManager = new LLMManager(state.config.llm);
    this.promptManager = new PromptManager();
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.loopTask = this.runLoop();
  }

  stop(): void {
    this.isRunning = false;
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning && this.state.isRunning) {
      try {
        // 检查中断
        if (this.state.interrupt.isInterrupted()) {
          const reason = this.state.interrupt.getReason();
          this.state.interrupt.clear();
          this.logger.warn(`⚠️ 决策循环被中断: ${reason}`);
          await this.sleep(1000);
          continue;
        }

        // 检查是否允许 LLM 决策
        if (!this.state.modeManager.canUseLLMDecision()) {
          const autoSwitched = await this.state.modeManager.checkAutoTransitions();
          if (!autoSwitched) {
            await this.sleep(1000);
          }
          continue;
        }

        // 执行决策
        await this.executeDecisionCycle();

        // 定期评估
        this.evaluationCounter++;
        if (this.evaluationCounter % 5 === 0) {
          await this.evaluateTask();
        }
      } catch (error) {
        this.logger.error('❌ 决策循环异常:', error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * 执行一次决策周期
   */
  private async executeDecisionCycle(): Promise<void> {
    // 1. 收集环境信息
    const environmentData = this.collectEnvironmentData();

    // 2. 构建记忆上下文
    const memoryContext = this.state.memory.buildContextSummary({
      includeThoughts: 3,
      includeConversations: 5,
      includeDecisions: 8,
      includeEvents: 5,
    });

    // 3. 生成提示词
    const prompt = this.promptManager.generatePrompt('main_thinking', {
      ...environmentData,
      memoryContext,
    });

    // 4. 调用 LLM
    const response = await this.llmManager.chat(prompt);

    // 5. 解析响应
    const { thinking, actions } = this.parseResponse(response);

    if (!actions || actions.length === 0) {
      this.logger.warn('⚠️ 无有效动作');
      return;
    }

    // 6. 记录思考
    if (thinking) {
      this.state.memory.recordThought(thinking);
    }

    // 7. 执行动作
    const result = await this.executeActions(actions, thinking || '未知意图');

    // 8. 记录决策
    this.state.memory.recordDecision(thinking || '未知意图', actions, result.success ? 'success' : 'failed', result.feedback);
  }

  /**
   * 收集环境数据
   */
  private collectEnvironmentData(): Record<string, any> {
    const { gameState, config } = this.state;
    const { taskManager } = this.state;

    return {
      playerName: gameState.playerName,
      position: gameState.getPositionDescription(),
      health: `${gameState.health}/${gameState.healthMax}`,
      food: `${gameState.food}/${gameState.foodMax}`,
      inventory: gameState.getInventoryDescription(),
      nearbyEntities: gameState.getNearbyEntitiesDescription(),
      goal: this.state.goal,
      currentTask: taskManager.getCurrentTask()?.toString(),
      todoList: taskManager.getTodoListString(),
      currentMode: this.state.modeManager.getCurrentMode(),
    };
  }

  /**
   * 解析响应
   */
  private parseResponse(response: string): {
    thinking: string | null;
    actions: ActionCall[];
  } {
    // 提取思考
    const thinkingMatch = response.match(/【思考】([\s\S]*?)【动作】/);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;

    // 提取动作
    const jsonRegex = /\{[\s\S]*?"action_type"[\s\S]*?\}/g;
    const jsonMatches = response.match(jsonRegex);

    const actions: ActionCall[] = [];
    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const actionData = JSON.parse(jsonStr);
          actions.push({
            actionType: actionData.action_type,
            params: actionData,
          });
        } catch (error) {
          this.logger.warn(`⚠️ 解析动作失败: ${jsonStr}`);
        }
      }
    }

    return { thinking, actions };
  }

  /**
   * 执行动作列表
   */
  private async executeActions(actions: ActionCall[], intention: string): Promise<{ success: boolean; feedback: string }> {
    const feedbacks: string[] = [];
    let allSuccess = true;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      try {
        const result = await this.state.context.executor.execute(action.actionType as ActionId, action.params);

        feedbacks.push(`动作 ${i + 1}: ${action.actionType} - ${result.success ? '成功' : '失败'}: ${result.message}`);

        if (!result.success) {
          allSuccess = false;
          break;
        }
      } catch (error) {
        feedbacks.push(`动作 ${i + 1}: ${action.actionType} - 异常: ${error}`);
        allSuccess = false;
        break;
      }
    }

    return {
      success: allSuccess,
      feedback: feedbacks.join('\n'),
    };
  }

  /**
   * 评估任务
   */
  private async evaluateTask(): Promise<void> {
    // 实现任务评估逻辑
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 聊天循环
 */
class ChatLoop {
  private state: AgentState;
  private isRunning: boolean = false;
  private loopTask: Promise<void> | null = null;
  private logger: Logger;

  private llmManager: LLMManager;
  private promptManager: PromptManager;

  private activeValue: number = 5;
  private selfTriggered: boolean = false;

  constructor(state: AgentState) {
    this.state = state;
    this.logger = getLogger('ChatLoop');

    this.llmManager = new LLMManager(state.config.llm);
    this.promptManager = new PromptManager();

    // 监听聊天事件
    this.setupChatListener();
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.loopTask = this.runLoop();
  }

  stop(): void {
    this.isRunning = false;
  }

  private setupChatListener(): void {
    this.state.context.events.on('chat', data => {
      // 记录到记忆系统
      this.state.memory.recordConversation('player', data.message, {
        username: data.username,
      });

      // 检查是否被呼叫
      const botName = this.state.config.bot.name;
      if (data.message.includes(botName)) {
        this.activeValue += 3;
      }
    });
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning && this.state.isRunning) {
      await this.sleep(500);

      try {
        // 获取最近的对话
        const recentConversations = this.state.memory['conversationHistory'] || [];

        if (recentConversations.length === 0) {
          continue;
        }

        const lastConversation = recentConversations[recentConversations.length - 1];

        // 检查是否应该响应
        if (this.shouldRespond(lastConversation)) {
          await this.respondToChat();
          this.activeValue -= 1;
        } else if (Math.random() < 0.02 && !this.selfTriggered) {
          await this.initiateChat();
          this.selfTriggered = true;
        }
      } catch (error) {
        this.logger.error('❌ 聊天循环异常:', error);
      }
    }
  }

  private shouldRespond(conversation: ConversationEntry): boolean {
    if (conversation.speaker === 'ai') {
      return false; // 不响应自己的消息
    }

    const botName = this.state.config.bot.name;
    if (conversation.message.includes(botName)) {
      return true; // 被呼叫，一定响应
    }

    return this.activeValue > 0 && Math.random() < 0.3;
  }

  private async respondToChat(): Promise<void> {
    const memoryContext = this.state.memory.buildContextSummary({
      includeThoughts: 2,
      includeConversations: 10,
      includeDecisions: 3,
    });

    const environmentData = {
      position: this.state.context.gameState.getPositionDescription(),
      currentActivity: this.state.taskManager.getCurrentTask()?.details,
      memoryContext,
    };

    const prompt = this.promptManager.generatePrompt('chat_response', environmentData);

    const response = await this.llmManager.chat(prompt);

    const { message } = this.parseChatResponse(response);

    if (message) {
      await this.state.context.executor.execute(ActionIds.CHAT, { message });
      this.state.memory.recordConversation('ai', message);
    }
  }

  private async initiateChat(): Promise<void> {
    // 主动聊天逻辑
  }

  private parseChatResponse(response: string): { message: string | null } {
    // 解析聊天响应
    return { message: response };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**优势**:

- ✅ 清晰的依赖关系：Agent → State ← Loops
- ✅ 无循环依赖：Loops 只访问共享状态
- ✅ 职责分明：Agent 管理生命周期，Loops 执行逻辑
- ✅ 易于测试：可以独立测试 Loops

---

### 问题 3: 模式系统改进

**原设计的问题**:

```python
# maicraft 的模式系统
- ❌ 字符串类型（"main_mode", "combat_mode"）容易拼写错误
- ❌ 模式切换逻辑分散在各处
- ❌ 没有清晰的状态转换规则
- ❌ 优先级机制过于简单
```

**改进方案**: **状态机模式 + 转换规则**

```typescript
/**
 * 模式类型（使用枚举，避免字符串错误）
 */
enum ModeType {
  MAIN = 'main',
  COMBAT = 'combat',
  CHEST_GUI = 'chest_gui',
  FURNACE_GUI = 'furnace_gui',
  CRAFTING = 'crafting',
}

/**
 * 模式转换规则
 */
interface ModeTransitionRule {
  from: ModeType;
  to: ModeType;
  condition: (state: AgentState) => boolean | Promise<boolean>;
  priority: number;
  description: string;
}

/**
 * 模式管理器 - 基于状态机
 */
class ModeManager {
  private modes: Map<ModeType, Mode> = new Map();
  private currentMode: Mode | null = null;
  private transitionRules: ModeTransitionRule[] = [];

  private context: RuntimeContext;
  private state: AgentState;
  private logger: Logger;

  constructor(context: RuntimeContext) {
    this.context = context;
    this.logger = getLogger('ModeManager');
  }

  /**
   * 绑定 Agent 状态（在 Agent 初始化后调用）
   */
  bindState(state: AgentState): void {
    this.state = state;
  }

  /**
   * 注册所有模式
   */
  async registerModes(): Promise<void> {
    // 注册模式
    this.registerMode(new MainMode(this.context));
    this.registerMode(new CombatMode(this.context));
    this.registerMode(new ChestGUIMode(this.context));
    this.registerMode(new FurnaceGUIMode(this.context));

    // 注册转换规则
    this.registerTransitionRules();
  }

  /**
   * 注册模式
   */
  private registerMode(mode: Mode): void {
    this.modes.set(mode.type, mode);
    this.logger.info(`📝 注册模式: ${mode.name}`);
  }

  /**
   * 注册转换规则
   */
  private registerTransitionRules(): void {
    // 主模式 → 战斗模式
    this.addTransitionRule({
      from: ModeType.MAIN,
      to: ModeType.COMBAT,
      condition: state => this.shouldEnterCombat(state),
      priority: 10,
      description: '检测到敌对生物',
    });

    // 战斗模式 → 主模式
    this.addTransitionRule({
      from: ModeType.COMBAT,
      to: ModeType.MAIN,
      condition: state => this.shouldExitCombat(state),
      priority: 5,
      description: '战斗结束',
    });

    // GUI 模式 → 主模式（超时）
    this.addTransitionRule({
      from: ModeType.CHEST_GUI,
      to: ModeType.MAIN,
      condition: state => this.isGUITimeout(state),
      priority: 3,
      description: 'GUI 操作超时',
    });

    // 更多规则...
  }

  /**
   * 添加转换规则
   */
  addTransitionRule(rule: ModeTransitionRule): void {
    this.transitionRules.push(rule);

    // 按优先级排序
    this.transitionRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 尝试设置模式（检查优先级和转换规则）
   */
  async trySetMode(targetType: ModeType, reason: string): Promise<boolean> {
    const targetMode = this.modes.get(targetType);
    if (!targetMode) {
      this.logger.warn(`⚠️ 未知模式: ${targetType}`);
      return false;
    }

    // 检查是否已经是当前模式
    if (this.currentMode?.type === targetType) {
      return true;
    }

    // 检查优先级（被动响应模式可以中断任何模式）
    if (targetMode.requiresLLMDecision) {
      if (this.currentMode && this.currentMode.priority > targetMode.priority) {
        this.logger.warn(`⚠️ 无法切换到低优先级模式: ${targetMode.name} (当前: ${this.currentMode.name})`);
        return false;
      }
    }

    // 执行切换
    await this.switchMode(targetMode, reason);
    return true;
  }

  /**
   * 强制设置模式（不检查优先级）
   */
  async setMode(targetType: ModeType, reason: string): Promise<void> {
    const targetMode = this.modes.get(targetType);
    if (!targetMode) {
      throw new Error(`未知模式: ${targetType}`);
    }

    await this.switchMode(targetMode, reason);
  }

  /**
   * 切换模式
   */
  private async switchMode(newMode: Mode, reason: string): Promise<void> {
    const oldMode = this.currentMode;

    // 停用当前模式
    if (oldMode) {
      await oldMode.deactivate(reason);
    }

    // 激活新模式
    await newMode.activate(reason);
    this.currentMode = newMode;

    this.logger.info(`🔄 模式切换: ${oldMode?.name || 'None'} → ${newMode.name} (${reason})`);
  }

  /**
   * 检查自动转换
   */
  async checkAutoTransitions(): Promise<boolean> {
    if (!this.currentMode || !this.state) {
      return false;
    }

    // 查找适用的转换规则
    const applicableRules = this.transitionRules.filter(rule => rule.from === this.currentMode!.type);

    // 按优先级检查每个规则
    for (const rule of applicableRules) {
      try {
        const shouldTransition = await rule.condition(this.state);

        if (shouldTransition) {
          const success = await this.trySetMode(rule.to, rule.description);
          if (success) {
            return true;
          }
        }
      } catch (error) {
        this.logger.error(`❌ 检查转换规则失败: ${rule.description}`, error);
      }
    }

    return false;
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): string {
    return this.currentMode?.type || '';
  }

  /**
   * 是否允许 LLM 决策
   */
  canUseLLMDecision(): boolean {
    return this.currentMode?.requiresLLMDecision ?? true;
  }

  /**
   * 转换条件：是否应该进入战斗模式
   */
  private shouldEnterCombat(state: AgentState): boolean {
    const enemies = state.context.gameState.nearbyEntities.filter(e => ['zombie', 'skeleton', 'spider', 'creeper'].includes(e.name));

    return enemies.length > 0 && enemies[0].distance < 10;
  }

  /**
   * 转换条件：是否应该退出战斗模式
   */
  private shouldExitCombat(state: AgentState): boolean {
    const enemies = state.context.gameState.nearbyEntities.filter(e => ['zombie', 'skeleton', 'spider', 'creeper'].includes(e.name));

    return enemies.length === 0;
  }

  /**
   * 转换条件：GUI 是否超时
   */
  private isGUITimeout(state: AgentState): boolean {
    // 检查 GUI 模式是否超过 5 分钟
    return false; // 实现逻辑
  }
}

/**
 * 模式基类
 */
abstract class Mode {
  abstract readonly type: ModeType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly priority: number;
  abstract readonly requiresLLMDecision: boolean;

  protected context: RuntimeContext;
  protected isActive: boolean = false;
  protected startTime: number = 0;

  constructor(context: RuntimeContext) {
    this.context = context;
  }

  async activate(reason: string): Promise<void> {
    this.isActive = true;
    this.startTime = Date.now();
    this.context.logger.info(`🔵 激活模式: ${this.name} (${reason})`);
  }

  async deactivate(reason: string): Promise<void> {
    this.isActive = false;
    this.context.logger.info(`⚪ 停用模式: ${this.name} (${reason})`);
  }
}
```

**优势**:

- ✅ 类型安全：使用枚举，避免字符串错误
- ✅ 清晰的转换规则：集中管理，易于维护
- ✅ 灵活的条件判断：支持同步和异步条件
- ✅ 优先级系统：自动排序，按优先级检查
- ✅ 易于扩展：添加新模式和规则很容易

---

## 🎯 总结

### 核心改进

1. **AIMemory 替代 ThinkingLog**
   - 职责清晰：AI 记忆 vs 游戏事件
   - 结构化存储：思考流、对话历史、决策历史
   - 灵活查询：按需组合，避免硬编码

2. **共享状态架构**
   - 清晰的依赖关系
   - 无循环依赖
   - 易于测试和维护

3. **状态机模式管理**
   - 类型安全
   - 集中的转换规则
   - 灵活的条件判断

### 架构对比

| 特性     | v1.0 设计           | v2.0 设计        |
| -------- | ------------------- | ---------------- |
| 记忆系统 | ThinkingLog（混乱） | AIMemory（清晰） |
| 依赖关系 | 循环依赖            | 共享状态         |
| 模式管理 | 字符串类型          | 枚举 + 状态机    |
| 可测试性 | 困难                | 容易             |
| 可维护性 | 一般                | 优秀             |

---

_版本: v2.0_  
_创建日期: 2024-11-01_  
_基于对 v1.0 的深度反思_
