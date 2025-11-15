/**
 * 追踪器工厂
 * 用于创建和反序列化追踪器
 */

import type { TaskTracker } from '@/core/agent/planning/types';
import { InventoryTracker } from './InventoryTracker';
import { LocationTracker } from './LocationTracker';
import { CraftTracker } from './CraftTracker';
import { CompositeTracker } from './CompositeTracker';

export class TrackerFactory {
  private trackers: Map<string, any> = new Map([
    ['inventory', InventoryTracker],
    ['location', LocationTracker],
    ['craft', CraftTracker],
    ['composite', CompositeTracker],
  ]);

  /**
   * 注册自定义追踪器
   */
  register(type: string, trackerClass: any): void {
    this.trackers.set(type, trackerClass);
  }

  /**
   * 从 JSON 创建追踪器
   */
  fromJSON(json: any): TaskTracker {
    const TrackerClass = this.trackers.get(json.type);

    if (!TrackerClass) {
      throw new Error(`未知的追踪器类型: ${json.type}`);
    }

    // CompositeTracker 需要特殊处理
    if (json.type === 'composite') {
      return CompositeTracker.fromJSON(json, this);
    }

    return TrackerClass.fromJSON(json);
  }

  /**
   * 获取所有注册的追踪器类型
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.trackers.keys());
  }

  /**
   * 兼容旧代码的静态方法
   * @deprecated 使用DI容器：container.resolve(ServiceKeys.TrackerFactory).fromJSON(json)
   */
  static fromJSON(json: any): TaskTracker {
    const factory = new TrackerFactory();
    return factory.fromJSON(json);
  }

  /**
   * 兼容旧代码的静态方法
   * @deprecated 使用DI容器
   */
  static register(type: string, trackerClass: any): void {
    const factory = new TrackerFactory();
    factory.register(type, trackerClass);
  }

  /**
   * 兼容旧代码的静态方法
   * @deprecated 使用DI容器
   */
  static getRegisteredTypes(): string[] {
    const factory = new TrackerFactory();
    return factory.getRegisteredTypes();
  }
}
