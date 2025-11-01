/**
 * 追踪器工厂
 * 用于创建和反序列化追踪器
 */

import type { TaskTracker } from '../types';
import { InventoryTracker } from './InventoryTracker';
import { LocationTracker } from './LocationTracker';
import { CraftTracker } from './CraftTracker';
import { CompositeTracker } from './CompositeTracker';

export class TrackerFactory {
  private static trackers: Map<string, any> = new Map([
    ['inventory', InventoryTracker],
    ['location', LocationTracker],
    ['craft', CraftTracker],
    ['composite', CompositeTracker],
  ]);

  /**
   * 注册自定义追踪器
   */
  static register(type: string, trackerClass: any): void {
    this.trackers.set(type, trackerClass);
  }

  /**
   * 从 JSON 创建追踪器
   */
  static fromJSON(json: any): TaskTracker {
    const TrackerClass = this.trackers.get(json.type);

    if (!TrackerClass) {
      throw new Error(`未知的追踪器类型: ${json.type}`);
    }

    // CompositeTracker 需要特殊处理
    if (json.type === 'composite') {
      return CompositeTracker.fromJSON(json, TrackerFactory);
    }

    return TrackerClass.fromJSON(json);
  }

  /**
   * 获取所有注册的追踪器类型
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.trackers.keys());
  }
}
