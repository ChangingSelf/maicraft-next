/**
 * 模式基类
 */

import type { ModeType } from './types';
import type { RuntimeContext } from '@/core/context/RuntimeContext';

export abstract class Mode {
  abstract readonly type: ModeType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly priority: number;
  abstract readonly requiresLLMDecision: boolean;

  protected context: RuntimeContext;
  protected isActive: boolean = false;
  protected startTime: number = 0;

  constructor(context: RuntimeContext) {
    this.context = context;
  }

  /**
   * 激活模式
   */
  async activate(reason: string): Promise<void> {
    this.isActive = true;
    this.startTime = Date.now();
    this.context.logger.info(`🔵 激活模式: ${this.name} (${reason})`);
  }

  /**
   * 停用模式
   */
  async deactivate(reason: string): Promise<void> {
    this.isActive = false;
    this.context.logger.info(`⚪ 停用模式: ${this.name} (${reason})`);
  }

  /**
   * 获取激活时长（毫秒）
   */
  getActiveDuration(): number {
    if (!this.isActive) return 0;
    return Date.now() - this.startTime;
  }
}
