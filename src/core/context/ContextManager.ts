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
import type { ActionExecutor } from '@/core/actions/ActionExecutor';
import { BlockCache } from '@/core/cache/BlockCache';
import { ContainerCache } from '@/core/cache/ContainerCache';
import { LocationManager } from '@/core/cache/LocationManager';
import { InterruptSignal } from '@/core/interrupt/InterruptSignal';
import { EventManager } from '@/core/events/EventManager';
import { GameState } from '@/core/state/GameState';
import type { PlaceBlockUtils } from '@/utils/PlaceBlockUtils';
import type { MovementUtils } from '@/utils/MovementUtils';
import type { CraftManager } from '@/core/crafting/CraftManager';

/**
 * 上下文管理器
 */
export class ContextManager {
  private context?: RuntimeContext;

  /**
   * 创建基础上下文（全局共享）
   */
  createContext(params: {
    bot: Bot;
    executor?: ActionExecutor | null;
    config: Config;
    logger: Logger;
    placeBlockUtils: PlaceBlockUtils;
    movementUtils: MovementUtils;
  }): RuntimeContext {
    if (this.context) {
      throw new Error('Context already created. Use getContext() to access existing context.');
    }

    const { bot, executor, config, logger, placeBlockUtils, movementUtils } = params;

    // 创建 GameState 实例（包含缓存系统）
    const gameState = new GameState();
    gameState.initialize(bot);

    // 等待 GameState 初始化完成以获取缓存实例
    setTimeout(() => {
      // 确保 GameState 中的缓存已初始化
      if (!gameState.blockCache) {
        gameState.blockCache = new BlockCache();
      }
      if (!gameState.containerCache) {
        gameState.containerCache = new ContainerCache();
      }
    }, 100);

    // 创建位置管理器
    const locationManager = new LocationManager();

    // 创建全局共享的中断信号（用于系统级中断）
    const globalInterruptSignal = new InterruptSignal();

    // 如果 executor 未提供，创建一个临时的 EventManager
    const events = executor ? executor.getEventManager() : new EventManager(bot);

    this.context = {
      bot,
      executor: executor || ({} as ActionExecutor), // 临时赋值，后续会更新
      gameState,
      blockCache: gameState.blockCache!,
      containerCache: gameState.containerCache!,
      locationManager,
      events,
      interruptSignal: globalInterruptSignal,
      logger,
      config,
      placeBlockUtils,
      movementUtils,
    };

    return this.context;
  }

  /**
   * 创建上下文（使用依赖注入的版本）
   * @param params 参数，包括注入的依赖
   */
  createContextWithDI(params: {
    bot: Bot;
    executor: ActionExecutor | null;
    config: Config;
    logger: Logger;
    gameState: GameState;
    blockCache: BlockCache;
    containerCache: ContainerCache;
    locationManager: LocationManager;
    interruptSignal: any;
    placeBlockUtils: PlaceBlockUtils;
    movementUtils: MovementUtils;
    craftManager: CraftManager;
  }): RuntimeContext {
    if (this.context) {
      throw new Error('Context already created. Use getContext() to access existing context.');
    }

    const {
      bot,
      executor,
      config,
      logger,
      gameState,
      blockCache,
      containerCache,
      locationManager,
      interruptSignal,
      placeBlockUtils,
      movementUtils,
      craftManager,
    } = params;

    // 初始化 GameState
    gameState.initialize(bot);

    // 如果 executor 未提供，创建一个临时的 EventManager
    const events = executor ? executor.getEventManager() : new EventManager(bot);

    this.context = {
      bot,
      executor: executor || ({} as ActionExecutor), // 临时赋值，后续会更新
      gameState,
      blockCache,
      containerCache,
      locationManager,
      events,
      interruptSignal,
      logger,
      config,
      placeBlockUtils,
      movementUtils,
      craftManager,
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
    if (this.context) {
      // 清理 GameState
      this.context.gameState.cleanup();
    }
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

    // 如果之前使用的是临时 EventManager，现在替换为真正的
    if (this.context.events && typeof (this.context.events as any).listenerCount === 'function') {
      // 如果是临时创建的 EventManager，替换为真正的
      this.context.events = executor.getEventManager();
    }
  }

  /**
   * 检查上下文是否已创建
   */
  hasContext(): boolean {
    return this.context !== undefined;
  }
}
