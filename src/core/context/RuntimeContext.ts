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
import { Vec3 } from 'vec3';
import { GameState } from '../state/GameState';
import { EventManager } from '../events/EventManager';
import { InterruptSignal } from '../interrupt/InterruptSignal';
import type { ActionExecutor } from '../actions/ActionExecutor';
import type { Location } from '../cache/LocationManager';

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
 * 地标管理器接口
 */
export interface LocationManager {
  /**
   * 设置地标
   */
  setLocation(name: string, position: Vec3, info: string, metadata?: any): Location;

  /**
   * 获取地标
   */
  getLocation(name: string): Location | undefined;

  /**
   * 删除地标
   */
  deleteLocation(name: string): boolean;

  /**
   * 更新地标信息
   */
  updateLocation(name: string, info: string): boolean;

  /**
   * 获取所有地标
   */
  getAllLocations(): Location[];

  /**
   * 查找附近的地标
   */
  findNearby(center: Vec3, radius?: number): Location[];

  /**
   * 搜索地标（按名称或信息）
   */
  search(query: string): Location[];

  /**
   * 获取最近的地标
   */
  getNearest(center: Vec3): Location | undefined;

  /**
   * 获取所有地标的字符串描述
   */
  getAllLocationsString(): string;

  /**
   * 获取附近地标的字符串描述
   */
  getNearbyLocationsString(center: Vec3, radius?: number): string;

  /**
   * 检查地标是否存在
   */
  hasLocation(name: string): boolean;

  /**
   * 清空所有地标
   */
  clear(): void;

  /**
   * 获取地标数量
   */
  size(): number;

  /**
   * 导出地标数据
   */
  export(): any[];

  /**
   * 导入地标数据
   */
  import(data: any[]): void;

  /**
   * 保存地标数据
   */
  save(): Promise<void>;
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
  events: EventManager;

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
