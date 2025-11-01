# 动作系统设计文档 v2.0

> 基于对 maicraft (Python)、maicraft-mcp-server 和当前设计的评估，提出改进方案

---

## 🎯 架构定位

**maicraft-next = MCP Server + AI Agent 一体化架构**

```
┌─────────────────────────────────────────────────┐
│              maicraft-next                      │
├─────────────────────────────────────────────────┤
│  模式1: 独立 AI Agent                            │
│  ├─ LLM Manager (直接调用 OpenAI/Claude)         │
│  ├─ Action Manager (内部调用，零开销)             │
│  └─ Mineflayer Bot                              │
├─────────────────────────────────────────────────┤
│  模式2: MCP Server                               │
│  ├─ MCP Protocol Handler                        │
│  ├─ Action Manager (通过 MCP 暴露)               │
│  └─ Mineflayer Bot                              │
└─────────────────────────────────────────────────┘
```

**设计原则:**

1. **双模式运行**: 可作为独立 Agent，也可作为 MCP Server
2. **零依赖切换**: 同一套动作系统，两种调用方式
3. **性能优先**: 独立模式下无 IPC 开销
4. **标准兼容**: MCP 模式下完全符合协议规范

---

## 🏗️ 核心架构

### 1. 动作上下文 (ActionContext)

```typescript
export interface ActionContext {
  // 核心组件
  bot: Bot; // Mineflayer bot 实例
  executor: ActionExecutor; // 动作执行器

  // 状态管理
  stateManager: StateManager; // ✅ 新增

  // 事件系统
  eventBus: EventBus; // ✅ 新增

  // 工具组件
  logger: Logger;
  config: Config;

  // 世界信息
  world: WorldInfo;

  // AI 上下文 (可选，仅在 AI Agent 模式下提供)
  ai?: AIContext;
}

export interface AIContext {
  llmManager: LLMManager;
  promptManager: PromptManager;
  thinkingLog: ThinkingLog;
  taskList: TaskList;
}

export interface WorldInfo {
  time: number;
  weather: string;
  dimension: string;
  players: string[];
}
```

### 2. 动作基类 (Action)

```typescript
export abstract class Action<T extends ActionParams> {
  // 基础属性
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: ActionCategory;
  abstract readonly timeout: number;

  // 执行方法
  abstract execute(context: ActionContext, params: T): Promise<ActionResult>;

  // AI 描述 (用于生成 LLM 工具定义)
  abstract getAIDescription(): AIDescription;

  // 参数验证 (可选)
  protected validateParams(params: T): ValidationError[] {
    return [];
  }

  // 前置检查 (可选)
  canExecute(context: ActionContext): boolean {
    return true;
  }

  // 生命周期钩子
  protected async onBeforeExecute?(context: ActionContext, params: T): Promise<void>;
  protected async onAfterExecute?(context: ActionContext, result: ActionResult): Promise<void>;
  protected async onError?(context: ActionContext, error: Error): Promise<void>;

  // 事件订阅 (可选)
  protected subscribeEvents?(eventBus: EventBus): ListenerHandle[];

  // 中断支持
  protected interruptRequested: boolean = false;

  interrupt(reason: string): void {
    this.interruptRequested = true;
    this.logger.warn(`动作 ${this.name} 被中断: ${reason}`);
  }

  protected checkInterrupt(): void {
    if (this.interruptRequested) {
      throw new InterruptError('动作被中断');
    }
  }
}
```

### 3. 动作执行器 (ActionExecutor)

```typescript
export class ActionExecutor {
  private actions: Map<string, Action<any>> = new Map();
  private actionQueue: QueuedAction[] = [];
  private history: ActionHistory;
  private metrics: MetricsCollector;
  private errorHandler: ErrorHandler;

  constructor(
    private eventBus: EventBus,
    private stateManager: StateManager,
    private logger: Logger,
    private config: Config,
  ) {
    this.history = new ActionHistory();
    this.metrics = new MetricsCollector();
    this.errorHandler = new ErrorHandler(config);
  }

  /**
   * 注册动作
   */
  register(action: Action<any>): void {
    this.actions.set(action.id, action);
    this.logger.info(`已注册动作: ${action.id} - ${action.name}`);

    // 订阅动作相关事件
    if (action.subscribeEvents) {
      action.subscribeEvents(this.eventBus);
    }
  }

  /**
   * 执行动作 (带完整错误处理和重试)
   */
  async execute<T extends ActionParams>(actionId: string, bot: Bot, params: T, options?: ExecuteOptions): Promise<ActionResult> {
    const action = this.actions.get(actionId);

    if (!action) {
      return {
        success: false,
        message: `未找到动作: ${actionId}`,
        error: ActionErrorType.ACTION_NOT_FOUND,
      };
    }

    // 创建动作上下文
    const context = this.createContext(bot, options);

    // 生成执行ID
    const executionId = this.generateExecutionId();

    // 记录开始
    this.history.recordStart(executionId, actionId, params);
    this.eventBus.emit(new ActionStartEvent(executionId, actionId, params));

    const startTime = Date.now();

    try {
      // 参数验证
      const validationErrors = action.validateParams(params);
      if (validationErrors.length > 0) {
        throw new ValidationError('参数验证失败', validationErrors);
      }

      // 前置检查
      if (!action.canExecute(context)) {
        throw new PreconditionError('前置条件不满足');
      }

      // 执行前钩子
      if (action.onBeforeExecute) {
        await action.onBeforeExecute(context, params);
      }

      // 执行动作 (带超时和重试)
      const result = await this.errorHandler.executeWithRetry(() => this.executeWithTimeout(action, context, params, action.timeout), actionId);

      // 执行后钩子
      if (action.onAfterExecute) {
        await action.onAfterExecute(context, result);
      }

      // 记录结束
      const executionTime = Date.now() - startTime;
      this.history.recordEnd(executionId, result);
      this.metrics.recordExecution(actionId, executionTime, result.success);
      this.eventBus.emit(new ActionCompleteEvent(executionId, actionId, result));

      return result;
    } catch (error) {
      // 错误处理钩子
      if (action.onError) {
        await action.onError(context, error as Error);
      }

      // 记录错误
      const executionTime = Date.now() - startTime;
      const errorResult = this.createErrorResult(error);
      this.history.recordEnd(executionId, errorResult);
      this.metrics.recordExecution(actionId, executionTime, false);
      this.eventBus.emit(new ActionErrorEvent(executionId, actionId, error));

      return errorResult;
    }
  }

  /**
   * 带超时执行
   */
  private async executeWithTimeout<T extends ActionParams>(
    action: Action<T>,
    context: ActionContext,
    params: T,
    timeout: number,
  ): Promise<ActionResult> {
    return Promise.race([
      action.execute(context, params),
      new Promise<ActionResult>((_, reject) => setTimeout(() => reject(new TimeoutError(`动作 ${action.id} 执行超时 (${timeout}ms)`)), timeout)),
    ]);
  }

  /**
   * 创建动作上下文
   */
  private createContext(bot: Bot, options?: ExecuteOptions): ActionContext {
    return {
      bot,
      executor: this,
      stateManager: this.stateManager,
      eventBus: this.eventBus,
      logger: this.logger,
      config: this.config,
      world: this.getWorldInfo(bot),
      ai: options?.aiContext,
    };
  }

  /**
   * 获取工具定义 (用于 LLM)
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.actions.values()).map(action => {
      const aiDesc = action.getAIDescription();
      return {
        type: 'function',
        function: {
          name: action.id,
          description: aiDesc.description,
          parameters: aiDesc.parameters,
        },
      };
    });
  }

  /**
   * 获取 MCP 工具定义
   */
  getMcpTools(): McpToolSpec[] {
    const tools: McpToolSpec[] = [];

    for (const action of this.actions.values()) {
      const aiDesc = action.getAIDescription();

      tools.push({
        toolName: action.id,
        description: aiDesc.description,
        schema: this.convertToZodSchema(aiDesc.parameters),
        actionName: action.id,
        mapInputToParams: input => input as any,
      });
    }

    return tools;
  }

  /**
   * 获取执行历史
   */
  getHistory(limit?: number): ActionExecutionRecord[] {
    return this.history.getHistory(limit);
  }

  /**
   * 获取性能指标
   */
  getMetrics(actionId?: string): ActionMetrics[] {
    return this.metrics.getMetrics(actionId);
  }
}
```

### 4. 状态管理器 (StateManager)

```typescript
export class StateManager {
  blockCache: BlockCache;
  containerCache: ContainerCache;
  locationManager: LocationManager;
  taskList: TaskList;
  thinkingLog: ThinkingLog;

  constructor(private dataDir: string) {
    this.blockCache = new BlockCache(path.join(dataDir, 'block_cache.json'));
    this.containerCache = new ContainerCache(path.join(dataDir, 'container_cache.json'));
    this.locationManager = new LocationManager(path.join(dataDir, 'locations.json'));
    this.taskList = new TaskList(path.join(dataDir, 'tasks.json'));
    this.thinkingLog = new ThinkingLog(path.join(dataDir, 'thinking_log.json'));
  }

  async load(): Promise<void> {
    await Promise.all([
      this.blockCache.load(),
      this.containerCache.load(),
      this.locationManager.load(),
      this.taskList.load(),
      this.thinkingLog.load(),
    ]);
  }

  async save(): Promise<void> {
    await Promise.all([
      this.blockCache.save(),
      this.containerCache.save(),
      this.locationManager.save(),
      this.taskList.save(),
      this.thinkingLog.save(),
    ]);
  }
}

/**
 * 方块缓存
 */
export class BlockCache {
  private cache: Map<string, BlockInfo> = new Map();

  remember(position: Vec3, blockType: string, metadata?: any): void {
    const key = this.positionToKey(position);
    this.cache.set(key, {
      position,
      blockType,
      metadata,
      timestamp: Date.now(),
    });
  }

  recall(position: Vec3): BlockInfo | null {
    const key = this.positionToKey(position);
    return this.cache.get(key) || null;
  }

  forget(position: Vec3): void {
    const key = this.positionToKey(position);
    this.cache.delete(key);
  }

  findNearest(blockType: string, from: Vec3, maxDistance: number = 100): Vec3 | null {
    let nearest: Vec3 | null = null;
    let nearestDist = Infinity;

    for (const info of this.cache.values()) {
      if (info.blockType === blockType) {
        const dist = from.distanceTo(info.position);
        if (dist < nearestDist && dist <= maxDistance) {
          nearestDist = dist;
          nearest = info.position;
        }
      }
    }

    return nearest;
  }

  private positionToKey(pos: Vec3): string {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }

  async save(): Promise<void> {
    const data = Array.from(this.cache.entries());
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async load(): Promise<void> {
    if (
      await fs.promises
        .access(this.filePath)
        .then(() => true)
        .catch(() => false)
    ) {
      const data = JSON.parse(await fs.promises.readFile(this.filePath, 'utf-8'));
      this.cache = new Map(data);
    }
  }
}

/**
 * 任务列表
 */
export class TaskList {
  private tasks: Map<string, Task> = new Map();

  addTask(description: string, priority: number = 0, metadata?: any): string {
    const taskId = this.generateTaskId();
    this.tasks.set(taskId, {
      id: taskId,
      description,
      priority,
      status: 'pending',
      createdAt: Date.now(),
      metadata,
    });
    return taskId;
  }

  completeTask(taskId: string, result?: any): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;
    }
  }

  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.completedAt = Date.now();
      task.error = error;
    }
  }

  updateProgress(taskId: string, progress: TaskProgress): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = progress;
    }
  }

  getPendingTasks(): Task[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => b.priority - a.priority);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 5. 事件系统 (EventBus)

```typescript
export class EventBus {
  private listeners: Map<string, EventListener[]> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 订阅事件
   */
  on(eventType: string, handler: EventHandler): ListenerHandle {
    const listener: EventListener = {
      id: this.generateListenerId(),
      handler,
      once: false,
    };

    const listeners = this.listeners.get(eventType) || [];
    listeners.push(listener);
    this.listeners.set(eventType, listeners);

    // 返回取消订阅的句柄
    return {
      remove: () => this.off(eventType, listener.id),
    };
  }

  /**
   * 订阅事件 (只触发一次)
   */
  once(eventType: string, handler: EventHandler): ListenerHandle {
    const listener: EventListener = {
      id: this.generateListenerId(),
      handler,
      once: true,
    };

    const listeners = this.listeners.get(eventType) || [];
    listeners.push(listener);
    this.listeners.set(eventType, listeners);

    return {
      remove: () => this.off(eventType, listener.id),
    };
  }

  /**
   * 取消订阅
   */
  off(eventType: string, listenerId: string): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.findIndex(l => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 发射事件
   */
  emit(event: GameEvent): void {
    const listeners = this.listeners.get(event.type);
    if (!listeners) return;

    for (let i = listeners.length - 1; i >= 0; i--) {
      const listener = listeners[i];

      try {
        listener.handler(event);
      } catch (error) {
        this.logger.error(`事件处理器错误: ${event.type}`, error);
      }

      // 如果是一次性监听器，移除它
      if (listener.once) {
        listeners.splice(i, 1);
      }
    }
  }

  /**
   * 移除某类型的所有监听器
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  private generateListenerId(): string {
    return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 游戏事件基类
 */
export abstract class GameEvent {
  abstract readonly type: string;
  readonly timestamp: number = Date.now();

  constructor(public readonly data: any) {}
}

/**
 * 预定义事件类型
 */
export class HealthChangeEvent extends GameEvent {
  readonly type = 'health_change';
  constructor(
    public readonly oldHealth: number,
    public readonly newHealth: number,
  ) {
    super({ oldHealth, newHealth });
  }
}

export class EntityHurtEvent extends GameEvent {
  readonly type = 'entity_hurt';
  constructor(
    public readonly entityId: number,
    public readonly damage: number,
    public readonly attacker?: number,
  ) {
    super({ entityId, damage, attacker });
  }
}

export class DeathEvent extends GameEvent {
  readonly type = 'death';
  constructor(public readonly message: string) {
    super({ message });
  }
}

export class ActionStartEvent extends GameEvent {
  readonly type = 'action_start';
  constructor(
    public readonly executionId: string,
    public readonly actionId: string,
    public readonly params: any,
  ) {
    super({ executionId, actionId, params });
  }
}

export class ActionCompleteEvent extends GameEvent {
  readonly type = 'action_complete';
  constructor(
    public readonly executionId: string,
    public readonly actionId: string,
    public readonly result: ActionResult,
  ) {
    super({ executionId, actionId, result });
  }
}

export class ActionErrorEvent extends GameEvent {
  readonly type = 'action_error';
  constructor(
    public readonly executionId: string,
    public readonly actionId: string,
    public readonly error: any,
  ) {
    super({ executionId, actionId, error });
  }
}
```

### 6. 错误处理器 (ErrorHandler)

```typescript
export class ErrorHandler {
  private retryConfig: RetryConfig;

  constructor(config: Config) {
    this.retryConfig = config.get('actions.retry', {
      maxRetries: 3,
      retryDelay: 1000,
      retryableErrors: [ActionErrorType.TIMEOUT, ActionErrorType.NETWORK_ERROR, ActionErrorType.PATH_NOT_FOUND, ActionErrorType.RESOURCE_BUSY],
      backoffMultiplier: 2,
    });
  }

  /**
   * 带重试执行
   */
  async executeWithRetry<T>(fn: () => Promise<T>, actionId: string): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const errorType = this.classifyError(error);

        // 不可重试错误直接抛出
        if (!this.isRetryable(errorType)) {
          throw error;
        }

        // 达到最大重试次数
        if (attempt === this.retryConfig.maxRetries) {
          throw error;
        }

        // 计算延迟并等待
        const delay = this.calculateDelay(attempt);
        logger.warn(`动作 ${actionId} 失败 (${errorType})，${delay}ms 后重试 ` + `(${attempt + 1}/${this.retryConfig.maxRetries})`);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * 错误分类
   */
  classifyError(error: any): ActionErrorType {
    if (error instanceof TimeoutError) {
      return ActionErrorType.TIMEOUT;
    }
    if (error instanceof ValidationError) {
      return ActionErrorType.INVALID_PARAMS;
    }
    if (error instanceof PreconditionError) {
      return ActionErrorType.INVALID_STATE;
    }

    // 基于错误消息分类
    const message = error.message?.toLowerCase() || '';

    if (message.includes('timeout') || message.includes('超时')) {
      return ActionErrorType.TIMEOUT;
    }
    if (message.includes('path') || message.includes('路径')) {
      return ActionErrorType.PATH_NOT_FOUND;
    }
    if (message.includes('network') || message.includes('网络')) {
      return ActionErrorType.NETWORK_ERROR;
    }
    if (message.includes('busy') || message.includes('占用')) {
      return ActionErrorType.RESOURCE_BUSY;
    }

    return ActionErrorType.FATAL_ERROR;
  }

  /**
   * 判断是否可重试
   */
  private isRetryable(errorType: ActionErrorType): boolean {
    return this.retryConfig.retryableErrors.includes(errorType);
  }

  /**
   * 计算重试延迟 (指数退避)
   */
  private calculateDelay(attempt: number): number {
    return this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 错误类型
 */
export enum ActionErrorType {
  // 可重试错误
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  RESOURCE_BUSY = 'RESOURCE_BUSY',

  // 不可重试错误
  INVALID_PARAMS = 'INVALID_PARAMS',
  ACTION_NOT_FOUND = 'ACTION_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_STATE = 'INVALID_STATE',

  // 致命错误
  FATAL_ERROR = 'FATAL_ERROR',
}

/**
 * 自定义错误类
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ValidationErrorDetail[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreconditionError';
  }
}

export class InterruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterruptError';
  }
}
```

### 7. AI 适配器 (AIActionAdapter)

```typescript
export class AIActionAdapter {
  constructor(
    private executor: ActionExecutor,
    private bot: Bot,
    private aiContext: AIContext,
  ) {}

  /**
   * 执行 OpenAI 工具调用
   */
  async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (const call of toolCalls) {
      try {
        const params = JSON.parse(call.function.arguments);

        const result = await this.executor.execute(call.function.name, this.bot, params, { aiContext: this.aiContext });

        results.push({
          tool_call_id: call.id,
          output: JSON.stringify(result),
        });

        // 记录到思考日志
        this.aiContext.thinkingLog.add({
          action: call.function.name,
          params,
          result,
          timestamp: Date.now(),
        });
      } catch (error) {
        results.push({
          tool_call_id: call.id,
          output: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    }

    return results;
  }

  /**
   * 从提示词解析并执行动作
   */
  async executeFromPrompt(aiResponse: string): Promise<ActionResult> {
    const parsed = this.parseActionFromPrompt(aiResponse);

    if (!parsed) {
      return {
        success: false,
        message: '无法解析 AI 响应',
        error: ActionErrorType.INVALID_PARAMS,
      };
    }

    return await this.executor.execute(parsed.actionName, this.bot, parsed.params, { aiContext: this.aiContext });
  }

  /**
   * 获取工具定义
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.executor.getToolDefinitions();
  }

  /**
   * 解析提示词中的动作指令
   */
  private parseActionFromPrompt(response: string): { actionName: string; params: any } | null {
    // 尝试 JSON 格式
    try {
      const match = response.match(/\{[\s\S]*"action"[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          actionName: parsed.action,
          params: parsed.params || {},
        };
      }
    } catch {}

    // 尝试结构化格式: [ACTION_NAME] param1:value1, param2:value2
    try {
      const match = response.match(/\[(\w+)\]\s*(.+)/);
      if (match) {
        const actionName = match[1].toLowerCase();
        const paramsStr = match[2];
        const params: any = {};

        const paramPairs = paramsStr.split(',');
        for (const pair of paramPairs) {
          const [key, value] = pair.split(':').map(s => s.trim());
          if (key && value) {
            // 尝试解析为数字
            params[key] = isNaN(Number(value)) ? value : Number(value);
          }
        }

        return { actionName, params };
      }
    } catch {}

    return null;
  }
}
```

---

## 📦 完整使用示例

### 示例 1: 独立 AI Agent 模式

```typescript
import { Bot } from 'mineflayer';
import { ActionExecutor } from './actions/ActionExecutor';
import { StateManager } from './state/StateManager';
import { EventBus } from './events/EventBus';
import { LLMManager } from './llm/LLMManager';
import { AIActionAdapter } from './ai/AIActionAdapter';
import { MoveAction } from './actions/movement/MoveAction';
import { MineBlockAction } from './actions/mining/MineBlockAction';

async function main() {
  // 1. 创建 Bot
  const bot = Bot.createBot({
    host: 'localhost',
    port: 25565,
    username: 'MaiBot',
  });

  // 2. 初始化核心组件
  const eventBus = new EventBus(logger);
  const stateManager = new StateManager('./data');
  await stateManager.load();

  // 3. 创建动作执行器并注册动作
  const executor = new ActionExecutor(eventBus, stateManager, logger, config);
  executor.register(new MoveAction());
  executor.register(new MineBlockAction());
  // ... 注册更多动作

  // 4. 创建 AI 上下文
  const llmManager = new LLMManager(config);
  const aiContext = {
    llmManager,
    promptManager,
    thinkingLog: stateManager.thinkingLog,
    taskList: stateManager.taskList,
  };

  // 5. 创建 AI 适配器
  const aiAdapter = new AIActionAdapter(executor, bot, aiContext);

  // 6. AI 决策循环
  while (true) {
    // 获取当前状态
    const state = getCurrentState(bot, stateManager);

    // 获取工具定义
    const tools = aiAdapter.getToolDefinitions();

    // 调用 LLM
    const response = await llmManager.chat(
      [
        { role: 'system', content: 'You are a Minecraft AI agent.' },
        { role: 'user', content: `Current state: ${JSON.stringify(state)}. What should I do next?` },
      ],
      { tools },
    );

    // 执行工具调用
    if (response.choices[0].message.tool_calls) {
      const results = await aiAdapter.executeToolCalls(response.choices[0].message.tool_calls);

      console.log('执行结果:', results);
    }

    await sleep(1000);
  }
}

main();
```

### 示例 2: MCP Server 模式

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bot } from 'mineflayer';
import { ActionExecutor } from './actions/ActionExecutor';

async function startMcpServer() {
  // 1. 创建 Bot
  const bot = Bot.createBot({
    host: 'localhost',
    port: 25565,
    username: 'MaiBot',
  });

  // 2. 初始化核心组件
  const eventBus = new EventBus(logger);
  const stateManager = new StateManager('./data');
  await stateManager.load();

  // 3. 创建动作执行器
  const executor = new ActionExecutor(eventBus, stateManager, logger, config);
  await executor.discoverAndRegisterActions();

  // 4. 创建 MCP Server
  const server = new Server(
    {
      name: 'maicraft-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // 5. 注册 MCP 工具
  const mcpTools = executor.getMcpTools();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: mcpTools.map(tool => ({
        name: tool.toolName,
        description: tool.description,
        inputSchema: tool.schema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = mcpTools.find(t => t.toolName === request.params.name);

    if (!tool) {
      throw new Error(`未找到工具: ${request.params.name}`);
    }

    // 映射参数并执行动作
    const params = tool.mapInputToParams?.(request.params.arguments, {}) || request.params.arguments;

    const result = await executor.execute(tool.actionName || tool.toolName, bot, params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  // 6. 启动服务器
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('MCP Server 已启动');
}

startMcpServer();
```

### 示例 3: 复合动作实现

```typescript
export class BuildHouseAction extends CompositeAction<BuildHouseParams> {
  readonly id = 'buildHouse';
  readonly name = '建造房屋';
  readonly description = '自动建造一个房屋，包括地板、墙壁和屋顶';
  readonly category = ActionCategory.BUILDING;
  readonly timeout = 600000; // 10分钟

  protected createSubActions(context: ActionContext, params: BuildHouseParams): ActionStep[] {
    const { x, y, z, width, height, depth, material = 'oak_planks' } = params;
    const steps: ActionStep[] = [];

    // 1. 清理建造区域
    steps.push({
      actionName: 'clearArea',
      params: { x, y, z, width, height, depth },
      required: true,
    });

    // 2. 铺设地板
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < depth; j++) {
        steps.push({
          actionName: 'placeBlock',
          params: {
            x: x + i,
            y: y,
            z: z + j,
            blockName: material,
          },
          required: false, // 地板不是必需的
          rollbackAction: 'mineBlock',
          rollbackParams: { x: x + i, y: y, z: z + j },
        });
      }
    }

    // 3. 建造四面墙壁
    // 前墙
    for (let i = 0; i < width; i++) {
      for (let h = 1; h <= height; h++) {
        steps.push({
          actionName: 'placeBlock',
          params: { x: x + i, y: y + h, z: z, blockName: material },
          required: true,
          rollbackAction: 'mineBlock',
          rollbackParams: { x: x + i, y: y + h, z: z },
        });
      }
    }
    // ... 其他三面墙

    // 4. 建造屋顶
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < depth; j++) {
        steps.push({
          actionName: 'placeBlock',
          params: {
            x: x + i,
            y: y + height + 1,
            z: z + j,
            blockName: material,
          },
          required: false,
          rollbackAction: 'mineBlock',
          rollbackParams: { x: x + i, y: y + height + 1, z: z + j },
        });
      }
    }

    return steps;
  }

  protected shouldRollback(): boolean {
    // 建造失败时回滚已完成的部分
    return true;
  }

  getAIDescription(): AIDescription {
    return {
      name: this.id,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '房屋起始X坐标' },
          y: { type: 'number', description: '房屋起始Y坐标' },
          z: { type: 'number', description: '房屋起始Z坐标' },
          width: { type: 'number', description: '房屋宽度 (X方向)', default: 5 },
          height: { type: 'number', description: '房屋高度', default: 3 },
          depth: { type: 'number', description: '房屋深度 (Z方向)', default: 5 },
          material: { type: 'string', description: '建造材料', default: 'oak_planks' },
        },
        required: ['x', 'y', 'z'],
      },
    };
  }
}
```

---

## 🚀 迁移路径

### 阶段 1: 核心架构 (Week 1-2)

- [ ] 实现 EventBus
- [ ] 实现 StateManager (BlockCache, TaskList)
- [ ] 增强 ActionExecutor (事件、状态集成)
- [ ] 实现 ErrorHandler (重试机制)

### 阶段 2: 功能增强 (Week 3-4)

- [ ] 实现 CompositeAction 基类
- [ ] 实现 ActionHistory 和持久化
- [ ] 实现 MetricsCollector
- [ ] 迁移现有动作到新架构

### 阶段 3: AI 集成 (Week 5-6)

- [ ] 实现 AIActionAdapter
- [ ] 支持 OpenAI Function Calling
- [ ] 支持提示词模式 (兼容 maicraft)
- [ ] 实现 ThinkingLog

### 阶段 4: 双模式支持 (Week 7-8)

- [ ] 独立 Agent 模式完善
- [ ] MCP Server 模式完善
- [ ] 配置系统和启动脚本
- [ ] 文档和示例

---

## 📝 总结

**改进要点:**

1. ✅ **明确架构定位**: 双模式支持 (Agent + MCP Server)
2. ✅ **事件系统**: 完整的 EventBus 实现
3. ✅ **状态管理**: BlockCache, TaskList, ThinkingLog 等
4. ✅ **错误处理**: 重试、分类、降级策略
5. ✅ **复合动作**: 支持回滚、部分成功、进度保存
6. ✅ **AI 集成**: 工具调用、提示词、MCP 三种模式
7. ✅ **持久化**: 执行历史、状态保存
8. ✅ **监控**: 性能指标、执行追踪

**核心优势:**

- 🎯 **灵活性**: 双模式运行，适应不同场景
- ⚡ **高性能**: Agent 模式零 IPC 开销
- 🔄 **兼容性**: 平滑迁移 maicraft Python 功能
- 📊 **可观测**: 完整的日志、指标、历史记录
- 🛡️ **健壮性**: 重试、回滚、错误处理

**下一步:**
参考 `action-system-review.md` 的优先级，逐步实现改进方案。
