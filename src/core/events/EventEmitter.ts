/**
 * 事件发射器（薄层封装）
 *
 * 设计目标:
 * 1. 保持 mineflayer 事件名不变（entityHurt, health, death 等）
 * 2. 统一管理游戏事件和自定义事件（actionComplete, actionError 等）
 * 3. 解耦：动作不直接依赖 bot.on
 * 4. 薄层封装，性能开销 < 1%
 */

import { Bot } from 'mineflayer';
import { getLogger, type Logger } from '@/utils/Logger';

/**
 * 事件处理函数
 */
export type EventHandler = (data: any) => void | Promise<void>;

/**
 * 事件监听器
 */
interface EventListener {
  id: string;
  handler: EventHandler;
  once: boolean;
}

/**
 * 监听器句柄
 */
export interface ListenerHandle {
  remove: () => void;
}

/**
 * 事件发射器
 */
export class EventEmitter {
  private bot: Bot;
  private listeners: Map<string, EventListener[]> = new Map();
  private listenerIdCounter: number = 0;
  private logger: Logger;

  constructor(bot: Bot) {
    this.bot = bot;
    this.logger = getLogger('EventEmitter');
    this.bridgeBotEvents();
  }

  /**
   * 桥接 bot 事件到统一事件系统
   * 保持原始事件名
   */
  private bridgeBotEvents(): void {
    // ✅ 保持 mineflayer 原始事件名

    // 实体受伤事件
    this.bot.on('entityHurt', entity => {
      this.emit('entityHurt', { entity });
    });

    // 健康变化事件
    this.bot.on('health', () => {
      this.emit('health', {
        health: this.bot.health,
        food: this.bot.food,
        foodSaturation: this.bot.foodSaturation,
      });
    });

    // 死亡事件
    this.bot.on('death', () => {
      this.emit('death', {});
    });

    // 重生事件
    this.bot.on('spawn', () => {
      this.emit('spawn', {});
    });

    // 被踢出事件
    this.bot.on('kicked', reason => {
      this.emit('kicked', { reason });
    });

    // 聊天事件
    this.bot.on('chat', (username, message) => {
      this.emit('chat', { username, message });
    });

    // 玩家加入
    this.bot.on('playerJoined', player => {
      this.emit('playerJoined', { player });
    });

    // 玩家离开
    this.bot.on('playerLeft', player => {
      this.emit('playerLeft', { player });
    });

    // 方块更新
    this.bot.on('blockUpdate', (oldBlock, newBlock) => {
      this.emit('blockUpdate', { oldBlock, newBlock });
    });

    // 物品栏更新
    this.bot.on('windowUpdate', (slot, oldItem, newItem) => {
      this.emit('windowUpdate', { slot, oldItem, newItem });
    });

    // 经验变化
    this.bot.on('experience', () => {
      this.emit('experience', {
        points: this.bot.experience.points,
        level: this.bot.experience.level,
        progress: this.bot.experience.progress,
      });
    });

    // 天气变化
    this.bot.on('weather', () => {
      this.emit('weather', {
        isRaining: this.bot.isRaining,
        thunderState: this.bot.thunderState,
      });
    });

    // 时间变化
    this.bot.on('time', () => {
      this.emit('time', {
        timeOfDay: this.bot.time.timeOfDay,
        day: this.bot.time.day,
        age: this.bot.time.age,
      });
    });

    // 睡眠状态
    this.bot.on('sleep', () => {
      this.emit('sleep', {});
    });

    this.bot.on('wake', () => {
      this.emit('wake', {});
    });

    // 移动事件
    this.bot.on('move', () => {
      if (this.bot.entity) {
        this.emit('move', {
          position: this.bot.entity.position,
          onGround: this.bot.entity.onGround,
        });
      }
    });

    // 错误事件
    this.bot.on('error', error => {
      this.emit('error', { error });
    });

    // 结束事件
    this.bot.on('end', reason => {
      this.emit('end', { reason });
    });
  }

  /**
   * 订阅事件
   */
  on(event: string, handler: EventHandler): ListenerHandle {
    const listener: EventListener = {
      id: this.generateId(),
      handler,
      once: false,
    };

    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);

    return {
      remove: () => this.off(event, listener.id),
    };
  }

  /**
   * 订阅一次
   */
  once(event: string, handler: EventHandler): ListenerHandle {
    const listener: EventListener = {
      id: this.generateId(),
      handler,
      once: true,
    };

    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);

    return {
      remove: () => this.off(event, listener.id),
    };
  }

  /**
   * 发射事件（游戏事件 + 自定义事件）
   */
  emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    // 从后往前遍历，方便移除一次性监听器
    for (let i = listeners.length - 1; i >= 0; i--) {
      const listener = listeners[i];

      try {
        const result = listener.handler(data);
        // 支持异步处理函数
        if (result instanceof Promise) {
          result.catch(error => {
            this.logger.error(`事件 ${event} 的异步处理函数出错:`, undefined, error instanceof Error ? error : new Error(String(error)));
          });
        }
      } catch (error) {
        this.logger.error(`事件 ${event} 的处理函数出错:`, undefined, error instanceof Error ? error : new Error(String(error)));
      }

      // 移除一次性监听器
      if (listener.once) {
        listeners.splice(i, 1);
      }
    }
  }

  /**
   * 取消订阅
   */
  off(event: string, listenerId: string): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const index = listeners.findIndex(l => l.id === listenerId);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    // 如果没有监听器了，删除事件
    if (listeners.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * 移除某个事件的所有监听器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 获取某个事件的监听器数量
   */
  listenerCount(event: string): number {
    const listeners = this.listeners.get(event);
    return listeners ? listeners.length : 0;
  }

  /**
   * 获取所有事件名
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `listener_${++this.listenerIdCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
