/**
 * 上下文管理器 - 统一管理 RuntimeContext
 *
 * 功能：
 * - 统一创建和管理 RuntimeContext
 * - 管理共享的缓存实例
 * - 为每个动作创建专用上下文（带独立的中断信号和logger前缀）
 * - 确保上下文的一致性和资源共享
 */

import { Bot } from 'mineflayer';
import { RuntimeContext, Logger, Config, createPrefixedLogger } from './RuntimeContext';
import type { ActionExecutor } from '../actions/ActionExecutor';
import { BlockCache } from '../cache/BlockCache';
import { ContainerCache } from '../cache/ContainerCache';
import { LocationManager } from '../location/LocationManager';
import { InterruptSignal } from '../interrupt/InterruptSignal';
import { EventEmitter } from '../events/EventEmitter';
import { globalGameState } from '../state/GameState';

/**
 * 上下文管理器
 */
export class ContextManager {
  private context?: RuntimeContext;

  /**
   * 创建基础上下文（全局共享）
   */
  createContext(params: { bot: Bot; executor?: ActionExecutor | null; config: Config; logger: Logger }): RuntimeContext {
    if (this.context) {
      throw new Error('Context already created. Use getContext() to access existing context.');
    }

    const { bot, executor, config, logger } = params;

    // 创建共享的缓存实例（全局唯一）
    const blockCache = new BlockCache();
    const containerCache = new ContainerCache();
    const locationManager = new LocationManager();

    // 创建全局共享的中断信号（用于系统级中断）
    const globalInterruptSignal = new InterruptSignal();

    // 如果 executor 未提供，创建一个临时的 EventEmitter
    const events = executor ? executor.getEventEmitter() : new EventEmitter(bot);

    this.context = {
      bot,
      executor: executor || ({} as ActionExecutor), // 临时赋值，后续会更新
      gameState: globalGameState,
      blockCache,
      containerCache,
      locationManager,
      events,
      interruptSignal: globalInterruptSignal,
      logger,
      config,
    };

    return this.context;
  }

  /**
   * 获取基础上下文
   */
  getContext(): RuntimeContext {
    if (!this.context) {
      throw new Error('Context not created. Call createContext() first.');
    }
    return this.context!;
  }

  /**
   * 为特定动作创建上下文（带专用 logger 和 interruptSignal）
   */
  createActionContext(actionName: string): RuntimeContext {
    const baseContext = this.getContext();

    return {
      ...baseContext,
      logger: createPrefixedLogger(baseContext.logger, actionName),
      interruptSignal: new InterruptSignal(), // 每个动作独立的中断信号
    };
  }

  /**
   * 清理上下文（用于测试或重启）
   */
  cleanup(): void {
    this.context = undefined;
  }

  /**
   * 更新 executor 引用（在 executor 创建后调用）
   */
  updateExecutor(executor: ActionExecutor): void {
    if (!this.context) {
      throw new Error('Context not created. Call createContext() first.');
    }

    // 更新 executor 引用
    this.context.executor = executor;

    // 如果之前使用的是临时 EventEmitter，现在替换为真正的
    if (this.context.events && typeof (this.context.events as any).listenerCount === 'function') {
      // 如果是临时创建的 EventEmitter，替换为真正的
      this.context.events = executor.getEventEmitter();
    }
  }

  /**
   * 检查上下文是否已创建
   */
  hasContext(): boolean {
    return this.context !== undefined;
  }
}
