/**
 * 模式基类
 *
 * 参考原maicraft的BaseMode设计，适配TypeScript和本项目架构
 * 每个模式都是一个完整的类，包含状态管理和业务逻辑
 */

import type { RuntimeContext } from '@/core/context/RuntimeContext';
import type { GameStateListener } from './GameStateListener';
import type { AgentState } from '../types';
import { getLogger, type Logger } from '@/utils/Logger';

export abstract class BaseMode implements GameStateListener {
  protected context: RuntimeContext;
  protected logger: Logger;
  protected state: AgentState | null = null;
  protected isActive: boolean = false;
  protected activatedAt: number = 0;

  // 模式属性
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly priority: number;

  // 模式配置 - 参考原maicraft设计
  readonly maxDuration?: number; // 最大持续时间（秒）
  readonly autoRestore: boolean = false; // 是否自动恢复到主模式
  readonly restoreDelay: number = 0; // 自动恢复延迟（秒）
  readonly requiresLLMDecision: boolean = true; // 是否需要LLM参与决策

  // GameStateListener 实现
  abstract readonly listenerName: string;
  readonly enabled: boolean = true;

  constructor(context: RuntimeContext) {
    this.context = context;
    this.logger = getLogger('BaseMode'); // 使用默认名称，子类构造函数中会重新设置
  }

  /**
   * 激活模式
   */
  async activate(reason: string): Promise<void> {
    if (this.isActive) {
      this.logger.warn(`⚠️ 模式 ${this.name} 已经处于激活状态`);
      return;
    }

    this.isActive = true;
    this.activatedAt = Date.now();

    this.logger.info(`🔄 激活模式: ${this.name} (${reason})`);

    // 子类可重写此方法实现特定激活逻辑
    await this.onActivate(reason);
  }

  /**
   * 停用模式
   */
  async deactivate(reason: string): Promise<void> {
    if (!this.isActive) {
      this.logger.warn(`⚠️ 模式 ${this.name} 已经处于停用状态`);
      return;
    }

    this.isActive = false;

    this.logger.info(`🔄 停用模式: ${this.name} (${reason})`);

    // 子类可重写此方法实现特定停用逻辑
    await this.onDeactivate(reason);
  }

  /**
   * 检查模式是否已过期
   */
  isExpired(): boolean {
    if (!this.maxDuration || !this.isActive) {
      return false;
    }

    const elapsedSeconds = (Date.now() - this.activatedAt) / 1000;
    return elapsedSeconds > this.maxDuration;
  }

  /**
   * 获取模式运行时间（秒）
   */
  getRunningTime(): number {
    if (!this.isActive) {
      return 0;
    }

    return (Date.now() - this.activatedAt) / 1000;
  }

  /**
   * 模式主逻辑 - 子类必须实现
   * 在主决策循环中被调用
   */
  abstract execute(): Promise<void>;

  /**
   * 检查是否应该自动切换到其他模式
   * 子类可重写此方法实现自动转换逻辑
   */
  async checkTransitions(): Promise<string[]> {
    // 默认实现：检查过期
    if (this.isExpired()) {
      return ['main_mode']; // 过期时回归主模式
    }
    return [];
  }

  // GameStateListener 默认实现（子类可选择性重写）
  async onGameStateUpdated?(gameState: any, previousState?: any): Promise<void> {
    // 默认空实现
  }

  async onEntitiesUpdated?(entities: any[]): Promise<void> {
    // 默认空实现
  }

  async onBlocksUpdated?(blocks: any[]): Promise<void> {
    // 默认空实现
  }

  async onInventoryUpdated?(inventory: any): Promise<void> {
    // 默认空实现
  }

  async onHealthUpdated?(health: { health: number; food: number; saturation: number }): Promise<void> {
    // 默认空实现
  }

  // 子类钩子方法
  protected async onActivate(reason: string): Promise<void> {
    // 默认空实现，子类可重写
  }

  protected async onDeactivate(reason: string): Promise<void> {
    // 默认空实现，子类可重写
  }

  /**
   * 绑定Agent状态
   * 子类可重写以进行特定初始化
   */
  bindState(state: AgentState): void {
    this.state = state;
  }
}
