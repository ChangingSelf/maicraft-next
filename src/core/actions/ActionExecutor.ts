/**
 * 动作执行器
 *
 * 功能:
 * - 类型安全的动作调用
 * - 支持动态注册新动作
 * - 自动创建带前缀的 logger
 * - 中断控制
 */

import { Action } from './Action';
import { ActionId } from './ActionIds';
import { ActionParamsMap, ActionResult, ExecuteOptions } from './types';
import { Logger } from '../context/RuntimeContext';
import { ContextManager } from '../context/ContextManager';

/**
 * 动作执行器类
 */
export class ActionExecutor {
  private actions: Map<ActionId, Action> = new Map();
  private logger: Logger;
  private contextManager: ContextManager;

  constructor(contextManager: ContextManager, logger: Logger) {
    this.contextManager = contextManager;
    this.logger = logger;
  }

  /**
   * 获取上下文管理器
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * 注册动作（支持动态注册）
   */
  register(action: Action): void {
    this.actions.set(action.id as ActionId, action);
    this.logger.info(`注册动作: ${action.name} (${action.id})`);
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
  async execute<T extends ActionId>(actionId: T, params: ActionParamsMap[T], _options?: ExecuteOptions): Promise<ActionResult> {
    const action = this.actions.get(actionId);
    if (!action) {
      const error = new Error(`动作 ${actionId} 未注册`);
      this.logger.error(error.message);
      return {
        success: false,
        message: error.message,
        error,
      };
    }

    // 使用 ContextManager 创建动作专用上下文
    const context = this.contextManager.createActionContext(action.name);

    try {
      context.logger.info(`开始执行动作`);
      const startTime = Date.now();

      // 执行动作
      const result = await action.execute(context, params);

      const duration = Date.now() - startTime;
      context.logger.info(`动作执行${result.success ? '成功' : '失败'}: ${result.message} (耗时: ${duration}ms)`);

      // 触发自定义事件
      context.events.emit('actionComplete', {
        actionId,
        actionName: action.name,
        result,
        duration,
      });

      return result;
    } catch (error) {
      const err = error as Error;
      context.logger.error(`动作执行异常:`, err);

      // 触发错误事件
      context.events.emit('actionError', {
        actionId,
        actionName: action.name,
        error: err,
      });

      return {
        success: false,
        message: `动作执行异常: ${err.message}`,
        error: err,
      };
    }
  }

  /**
   * 中断所有正在执行的动作
   */
  interruptAll(reason: string): void {
    // 中断全局上下文中的中断信号
    const context = this.contextManager.getContext();
    context.interruptSignal.interrupt(reason);
    this.logger.warn(`中断所有动作，原因: ${reason}`);
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
  getEventEmitter() {
    const context = this.contextManager.getContext();
    return context.events;
  }
}
