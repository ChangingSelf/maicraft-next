/**
 * 中断信号
 * 
 * 用于在动作执行过程中实现优雅的中断机制
 */

/**
 * 中断错误
 */
export class InterruptError extends Error {
  constructor(reason: string) {
    super(`动作被中断: ${reason}`);
    this.name = 'InterruptError';
  }
}

/**
 * 中断信号类
 */
export class InterruptSignal {
  private interrupted: boolean = false;
  private reason: string = '';
  
  /**
   * 触发中断
   */
  interrupt(reason: string): void {
    this.interrupted = true;
    this.reason = reason;
  }
  
  /**
   * 检查是否被中断
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
   * 重置中断状态
   */
  reset(): void {
    this.interrupted = false;
    this.reason = '';
  }
  
  /**
   * 如果被中断则抛出错误
   * 用于在动作执行过程中定期检查中断状态
   */
  throwIfInterrupted(): void {
    if (this.interrupted) {
      throw new InterruptError(this.reason);
    }
  }
}

