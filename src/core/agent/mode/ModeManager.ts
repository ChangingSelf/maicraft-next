/**
 * 模式管理器
 *
 * 参考原maicraft的ModeManager设计，适配本项目架构
 * 负责管理所有模式实例的切换，支持环境监听器机制
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { RuntimeContext } from '@/core/context/RuntimeContext';
import type { AgentState } from '../types';
import { BaseMode } from './BaseMode';
import type { GameStateListener } from './GameStateListener';
import { MainMode } from './modes/MainMode';
import { CombatMode } from './modes/CombatMode';
import { FurnaceMode } from './modes/FurnaceMode';
import { ChestMode } from './modes/ChestMode';

export class ModeManager {
  private modes: Map<string, BaseMode> = new Map();
  private currentMode: BaseMode | null = null;
  private transitionHistory: Array<{ from: string; to: string; reason: string; timestamp: number }> = [];
  private gameStateListeners: GameStateListener[] = [];
  private previousGameState: any = null;

  private context: RuntimeContext;
  private state: AgentState | null = null;
  private logger: Logger;

  // 模式类型常量 - 对应原maicraft
  static readonly MODE_TYPES = {
    MAIN: 'main_mode',
    COMBAT: 'combat_mode',
    FURNACE_GUI: 'furnace_gui',
    CHEST_GUI: 'chest_gui',
  } as const;

  constructor(context: RuntimeContext) {
    this.context = context;
    this.logger = getLogger('ModeManager');
  }

  /**
   * 绑定 Agent 状态（在 Agent 初始化后调用）
   */
  bindState(state: AgentState): void {
    this.state = state;
  }

  /**
   * 注册所有模式
   */
  async registerModes(): Promise<void> {
    if (!this.state) {
      throw new Error('Agent状态未绑定，无法注册模式');
    }

    this.logger.info('📝 注册模式...');

    // 注册模式并绑定状态
    const mainMode = new MainMode(this.context);
    mainMode.bindState(this.state);
    this.registerMode(mainMode);

    const combatMode = new CombatMode(this.context);
    combatMode.bindState(this.state);
    this.registerMode(combatMode);

    const furnaceMode = new FurnaceMode(this.context);
    furnaceMode.bindState(this.state);
    this.registerMode(furnaceMode);

    const chestMode = new ChestMode(this.context);
    chestMode.bindState(this.state);
    this.registerMode(chestMode);

    // 注册游戏状态监听器
    this.registerGameStateListeners();

    this.logger.info(`✅ 已注册 ${this.modes.size} 个模式`);
  }

  /**
   * 注册模式
   */
  private registerMode(mode: BaseMode): void {
    this.modes.set(mode.type, mode);
    this.logger.info(`  - ${mode.name} (优先级: ${mode.priority})`);

    // 如果模式实现了GameStateListener，自动注册
    if (
      mode.enabled &&
      (mode.onGameStateUpdated || mode.onEntitiesUpdated || mode.onBlocksUpdated || mode.onInventoryUpdated || mode.onHealthUpdated)
    ) {
      this.gameStateListeners.push(mode);
      this.logger.debug(`    📡 注册为游戏状态监听器: ${mode.listenerName}`);
    }
  }

  /**
   * 注册游戏状态监听器
   */
  private registerGameStateListeners(): void {
    // 所有实现GameStateListener的模式都已在上一步注册
    this.logger.info(`📡 已注册 ${this.gameStateListeners.length} 个游戏状态监听器`);
  }

  /**
   * 尝试设置模式（检查优先级）
   */
  async trySetMode(targetType: string, reason: string): Promise<boolean> {
    const targetMode = this.modes.get(targetType);
    if (!targetMode) {
      this.logger.warn(`⚠️ 未知模式: ${targetType}`);
      return false;
    }

    // 检查是否已经是当前模式
    if (this.currentMode?.type === targetType) {
      return true;
    }

    // 检查优先级（参考原maicraft：被动响应模式可以中断任何模式）
    if (targetMode.requiresLLMDecision) {
      if (this.currentMode && this.currentMode.priority > targetMode.priority) {
        this.logger.warn(`⚠️ 无法切换到低优先级模式: ${targetMode.name} (当前: ${this.currentMode.name})`);
        return false;
      }
    }

    // 执行切换
    await this.switchMode(targetMode, reason);
    return true;
  }

  /**
   * 强制设置模式（不检查优先级）
   */
  async setMode(targetType: string, reason: string): Promise<void> {
    const targetMode = this.modes.get(targetType);
    if (!targetMode) {
      throw new Error(`未知模式: ${targetType}`);
    }

    await this.switchMode(targetMode, reason);
  }

  /**
   * 切换模式
   */
  private async switchMode(newMode: BaseMode, reason: string): Promise<void> {
    const oldMode = this.currentMode;

    // 记录切换历史
    this.transitionHistory.push({
      from: oldMode?.type || 'none',
      to: newMode.type,
      reason,
      timestamp: Date.now(),
    });

    // 保持历史记录在合理范围内
    if (this.transitionHistory.length > 50) {
      this.transitionHistory = this.transitionHistory.slice(-25);
    }

    // 停用当前模式
    if (oldMode) {
      await oldMode.deactivate(reason);
    }

    // 激活新模式
    await newMode.activate(reason);
    this.currentMode = newMode;

    this.logger.info(`🔄 模式切换: ${oldMode?.name || 'None'} → ${newMode.name} (${reason})`);
  }

  /**
   * 检查自动转换
   * 参考原maicraft设计：模式内部检查转换条件
   */
  async checkAutoTransitions(): Promise<boolean> {
    if (!this.currentMode || !this.state) {
      return false;
    }

    try {
      // 让当前模式检查是否需要转换
      const targetModes = await this.currentMode.checkTransitions();

      // 按优先级处理转换目标
      for (const targetType of targetModes) {
        const targetMode = this.modes.get(targetType);
        if (targetMode && targetMode !== this.currentMode) {
          await this.setMode(targetType, `自动转换: ${this.currentMode.name} → ${targetMode.name}`);
          return true;
        }
      }
    } catch (error) {
      this.logger.error(`❌ 检查自动转换失败: ${this.currentMode.name}`, error);
    }

    return false;
  }

  /**
   * 通知游戏状态更新
   * 替代原maicraft的环境监听器机制
   */
  async notifyGameStateUpdate(gameState: any): Promise<void> {
    // 通知所有游戏状态监听器
    for (const listener of this.gameStateListeners) {
      if (listener.enabled && listener.onGameStateUpdated) {
        try {
          await listener.onGameStateUpdated(gameState, this.previousGameState);
        } catch (error) {
          this.logger.error(`❌ 游戏状态监听器异常: ${listener.listenerName}`, error);
        }
      }
    }

    // 更新前一次状态
    this.previousGameState = gameState;

    // 通知实体更新
    if (gameState.nearbyEntities) {
      await this.notifyEntitiesUpdate(gameState.nearbyEntities);
    }

    // 通知库存更新
    if (gameState.getInventoryDescription) {
      await this.notifyInventoryUpdate(gameState.getInventoryDescription());
    }

    // 通知健康更新
    if (gameState.health !== undefined) {
      await this.notifyHealthUpdate({
        health: gameState.health,
        food: gameState.food || 20,
        saturation: gameState.saturation || 5,
      });
    }
  }

  /**
   * 通知实体更新
   */
  private async notifyEntitiesUpdate(entities: any[]): Promise<void> {
    for (const listener of this.gameStateListeners) {
      if (listener.enabled && listener.onEntitiesUpdated) {
        try {
          await listener.onEntitiesUpdated(entities);
        } catch (error) {
          this.logger.error(`❌ 实体监听器异常: ${listener.listenerName}`, error);
        }
      }
    }
  }

  /**
   * 通知库存更新
   */
  private async notifyInventoryUpdate(inventory: any): Promise<void> {
    for (const listener of this.gameStateListeners) {
      if (listener.enabled && listener.onInventoryUpdated) {
        try {
          await listener.onInventoryUpdated(inventory);
        } catch (error) {
          this.logger.error(`❌ 库存监听器异常: ${listener.listenerName}`, error);
        }
      }
    }
  }

  /**
   * 通知健康更新
   */
  private async notifyHealthUpdate(health: { health: number; food: number; saturation: number }): Promise<void> {
    for (const listener of this.gameStateListeners) {
      if (listener.enabled && listener.onHealthUpdated) {
        try {
          await listener.onHealthUpdated(health);
        } catch (error) {
          this.logger.error(`❌ 健康监听器异常: ${listener.listenerName}`, error);
        }
      }
    }
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): string {
    return this.currentMode?.type || '';
  }

  /**
   * 获取当前模式对象
   */
  getCurrentModeObject(): BaseMode | null {
    return this.currentMode;
  }

  /**
   * 是否允许 LLM 决策
   */
  canUseLLMDecision(): boolean {
    return this.currentMode?.requiresLLMDecision ?? true;
  }

  /**
   * 执行当前模式的主逻辑
   * 参考原maicraft：在主循环中调用当前模式的execute方法
   */
  async executeCurrentMode(): Promise<void> {
    if (!this.currentMode) {
      this.logger.warn('⚠️ 没有当前模式，无法执行');
      return;
    }

    try {
      await this.currentMode.execute();
    } catch (error) {
      this.logger.error(`❌ 模式执行失败: ${this.currentMode.name}`, error);
    }
  }

  /**
   * 获取模式切换历史
   */
  getTransitionHistory(): Array<{ from: string; to: string; reason: string; timestamp: number }> {
    return [...this.transitionHistory];
  }

  /**
   * 获取所有已注册的模式
   */
  getAllModes(): BaseMode[] {
    return Array.from(this.modes.values());
  }

  /**
   * 强制恢复到主模式
   * 参考原maicraft的安全机制
   */
  async forceRecoverToMain(reason: string = '系统恢复'): Promise<boolean> {
    try {
      await this.setMode(ModeManager.MODE_TYPES.MAIN, reason);
      this.logger.info(`✅ 已强制恢复到主模式: ${reason}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ 强制恢复失败: ${reason}`, error);
      return false;
    }
  }
}
