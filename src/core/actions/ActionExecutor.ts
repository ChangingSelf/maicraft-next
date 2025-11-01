/**
 * 动作执行器
 * 
 * 功能:
 * - 类型安全的动作调用
 * - 支持动态注册新动作
 * - 自动创建带前缀的 logger
 * - 中断控制
 */

import { Bot } from 'mineflayer';
import { Action } from './Action';
import { ActionId } from './ActionIds';
import { ActionParamsMap, ActionResult, ExecuteOptions } from './types';
import { RuntimeContext, Logger, Config, BlockCache, ContainerCache, LocationManager, createPrefixedLogger } from '../context/RuntimeContext';
import { globalGameState } from '../state/GameState';
import { EventEmitter } from '../events/EventEmitter';
import { InterruptSignal } from '../interrupt/InterruptSignal';

/**
 * 动作执行器类
 */
export class ActionExecutor {
  private bot: Bot;
  private actions: Map<ActionId, Action> = new Map();
  private events: EventEmitter;
  private baseLogger: Logger;
  private config: Config;
  
  // 缓存管理器（待实现）
  private blockCache: BlockCache = {} as BlockCache;
  private containerCache: ContainerCache = {} as ContainerCache;
  private locationManager: LocationManager = {} as LocationManager;
  
  // 当前执行的动作
  private currentAction: string | null = null;
  private currentInterruptSignal: InterruptSignal | null = null;
  
  constructor(
    bot: Bot,
    logger: Logger,
    config: Config = {}
  ) {
    this.bot = bot;
    this.baseLogger = logger;
    this.config = config;
    this.events = new EventEmitter(bot);
  }
  
  /**
   * 注册动作（支持动态注册）
   */
  register(action: Action): void {
    this.actions.set(action.id as ActionId, action);
    this.baseLogger.info(`注册动作: ${action.name} (${action.id})`);
  }
  
  /**
   * 批量注册动作
   */
  registerAll(actions: Action[]): void {
    for (const action of actions) {
      this.register(action);
    }
  }
  
  /**
   * 执行动作（类型安全）
   */
  async execute<T extends ActionId>(
    actionId: T,
    params: ActionParamsMap[T],
    options?: ExecuteOptions
  ): Promise<ActionResult> {
    const action = this.actions.get(actionId);
    if (!action) {
      const error = new Error(`动作 ${actionId} 未注册`);
      this.baseLogger.error(error.message);
      return {
        success: false,
        message: error.message,
        error,
      };
    }
    
    // 创建带动作名前缀的 logger
    const actionLogger = createPrefixedLogger(this.baseLogger, action.name);
    
    // 创建中断信号
    const interruptSignal = new InterruptSignal();
    this.currentAction = actionId;
    this.currentInterruptSignal = interruptSignal;
    
    // 创建运行时上下文
    const context: RuntimeContext = {
      bot: this.bot,
      executor: this,
      gameState: globalGameState,
      blockCache: this.blockCache,
      containerCache: this.containerCache,
      locationManager: this.locationManager,
      events: this.events,
      interruptSignal,
      logger: actionLogger,
      config: this.config,
    };
    
    try {
      actionLogger.info(`开始执行动作`);
      const startTime = Date.now();
      
      // 执行动作
      const result = await action.execute(context, params);
      
      const duration = Date.now() - startTime;
      actionLogger.info(`动作执行${result.success ? '成功' : '失败'}: ${result.message} (耗时: ${duration}ms)`);
      
      // 触发自定义事件
      this.events.emit('actionComplete', {
        actionId,
        actionName: action.name,
        result,
        duration,
      });
      
      return result;
    } catch (error) {
      const err = error as Error;
      actionLogger.error(`动作执行异常:`, err);
      
      // 触发错误事件
      this.events.emit('actionError', {
        actionId,
        actionName: action.name,
        error: err,
      });
      
      return {
        success: false,
        message: `动作执行异常: ${err.message}`,
        error: err,
      };
    } finally {
      this.currentAction = null;
      this.currentInterruptSignal = null;
    }
  }
  
  /**
   * 中断所有正在执行的动作
   */
  interruptAll(reason: string): void {
    if (this.currentInterruptSignal) {
      this.baseLogger.warn(`中断当前动作: ${this.currentAction}, 原因: ${reason}`);
      this.currentInterruptSignal.interrupt(reason);
    }
  }
  
  /**
   * 中断当前动作
   */
  interrupt(reason: string): void {
    this.interruptAll(reason);
  }
  
  /**
   * 获取已注册的动作列表
   */
  getRegisteredActions(): Action[] {
    return Array.from(this.actions.values());
  }
  
  /**
   * 获取动作
   */
  getAction(actionId: ActionId): Action | undefined {
    return this.actions.get(actionId);
  }
  
  /**
   * 检查动作是否已注册
   */
  hasAction(actionId: ActionId): boolean {
    return this.actions.has(actionId);
  }
  
  /**
   * 获取事件发射器
   */
  getEventEmitter(): EventEmitter {
    return this.events;
  }
  
  /**
   * 生成 LLM 提示词
   */
  generatePrompt(): string {
    const actions = this.getRegisteredActions();
    
    if (actions.length === 0) {
      return '# 可用动作\n\n暂无可用动作';
    }
    
    const lines: string[] = [
      '# 可用动作',
      '',
    ];
    
    for (const action of actions) {
      lines.push(`## ${action.name}`);
      lines.push(action.description);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify({
        action_type: action.id,
        ...action.getParamsSchema?.(),
      }, null, 2));
      lines.push('```');
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * 设置缓存管理器
   */
  setBlockCache(blockCache: BlockCache): void {
    this.blockCache = blockCache;
  }
  
  setContainerCache(containerCache: ContainerCache): void {
    this.containerCache = containerCache;
  }
  
  setLocationManager(locationManager: LocationManager): void {
    this.locationManager = locationManager;
  }
}

