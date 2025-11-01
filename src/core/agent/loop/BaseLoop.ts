/**
 * 循环基类
 * 提供统一的循环生命周期管理和异常处理
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';

export abstract class BaseLoop<TState = any> {
  protected state: TState;
  protected isRunning: boolean = false;
  protected loopTask: Promise<void> | null = null;
  protected logger: Logger;

  constructor(state: TState, loggerName: string) {
    this.state = state;
    this.logger = getLogger(loggerName);
  }

  /**
   * 启动循环
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn(`${this.constructor.name} 已在运行`);
      return;
    }

    this.isRunning = true;
    this.loopTask = this.runLoop();
    this.logger.info(`🚀 ${this.constructor.name} 已启动`);
  }

  /**
   * 停止循环
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info(`🛑 ${this.constructor.name} 已停止`);
  }

  /**
   * 获取运行状态
   */
  isLoopRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 主循环
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning && this.shouldContinue()) {
      try {
        await this.runLoopIteration();
      } catch (error) {
        this.logger.error(`❌ ${this.constructor.name} 异常`, undefined, error as Error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * 抽象方法：执行一次循环迭代
   * 子类需要实现具体的循环逻辑
   */
  protected abstract runLoopIteration(): Promise<void>;

  /**
   * 判断循环是否应该继续
   * 默认检查状态的isRunning属性，子类可以重写
   */
  protected shouldContinue(): boolean {
    return (this.state as any).isRunning !== false;
  }

  /**
   * 统一的睡眠方法
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 等待循环任务完成
   */
  async waitForCompletion(): Promise<void> {
    if (this.loopTask) {
      await this.loopTask;
    }
  }
}
