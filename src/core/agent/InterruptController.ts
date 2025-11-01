/**
 * 中断控制器
 * 独立管理中断逻辑
 */

import { getLogger, type Logger } from '@/utils/Logger';

export class InterruptController {
  private interrupted: boolean = false;
  private reason: string = '';
  private callbacks: Array<(reason: string) => void> = [];
  private logger: Logger;

  constructor() {
    this.logger = getLogger('InterruptController');
  }

  /**
   * 触发中断
   */
  trigger(reason: string): void {
    this.interrupted = true;
    this.reason = reason;

    this.logger.warn(`🚨 触发中断: ${reason}`);

    // 通知所有回调
    for (const callback of this.callbacks) {
      try {
        callback(reason);
      } catch (error) {
        this.logger.error('中断回调执行失败:', undefined, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * 清除中断
   */
  clear(): void {
    if (this.interrupted) {
      this.logger.info(`✅ 清除中断: ${this.reason}`);
    }
    this.interrupted = false;
    this.reason = '';
  }

  /**
   * 检查是否中断
   */
  isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * 获取中断原因
   */
  getReason(): string {
    return this.reason;
  }

  /**
   * 注册中断回调
   */
  onInterrupt(callback: (reason: string) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * 移除中断回调
   */
  offInterrupt(callback: (reason: string) => void): void {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }

  /**
   * 清除所有回调
   */
  clearCallbacks(): void {
    this.callbacks = [];
  }
}
