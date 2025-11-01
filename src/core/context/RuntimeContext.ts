/**
 * 运行时上下文
 * 提供动作执行所需的所有资源和能力
 *
 * 设计理念:
 * - 通用的运行时上下文，不仅限于动作
 * - 提供所有核心资源的访问
 * - 自动创建带前缀的 logger
 */

import { Bot } from 'mineflayer';
import { GameState } from '../state/GameState';
import { EventEmitter } from '../events/EventEmitter';
import { InterruptSignal } from '../interrupt/InterruptSignal';

/**
 * Logger 接口
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * 配置接口（待实现）
 */
export interface Config {
  [key: string]: any;
}

/**
 * 方块缓存接口（待实现）
 */
export interface BlockCache {
  // 后续实现
}

/**
 * 容器缓存接口（待实现）
 */
export interface ContainerCache {
  // 后续实现
}

/**
 * 地标管理器接口（待实现）
 */
export interface LocationManager {
  // 后续实现
}

/**
 * 动作执行器接口（前向声明）
 */
export interface ActionExecutor {
  // 后续实现
  execute(actionId: string, params: any): Promise<any>;
  interruptAll(reason: string): void;
}

/**
 * 运行时上下文接口
 */
export interface RuntimeContext {
  // 核心资源
  bot: Bot;
  executor: ActionExecutor;

  // 全局状态（实时可访问）
  gameState: GameState;

  // 缓存管理
  blockCache: BlockCache;
  containerCache: ContainerCache;
  locationManager: LocationManager;

  // 事件系统
  events: EventEmitter;

  // 中断控制
  interruptSignal: InterruptSignal;

  // 日志（每个动作自动分配独立的 logger）
  logger: Logger;

  // 配置
  config: Config;
}

/**
 * 创建带前缀的 Logger
 */
export function createPrefixedLogger(baseLogger: Logger, prefix: string): Logger {
  return {
    debug: (message: string, ...args: any[]) => baseLogger.debug(`[${prefix}] ${message}`, ...args),
    info: (message: string, ...args: any[]) => baseLogger.info(`[${prefix}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => baseLogger.warn(`[${prefix}] ${message}`, ...args),
    error: (message: string, ...args: any[]) => baseLogger.error(`[${prefix}] ${message}`, ...args),
  };
}
