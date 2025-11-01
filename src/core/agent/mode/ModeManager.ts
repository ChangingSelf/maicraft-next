/**
 * 模式管理器
 * 基于状态机管理模式转换
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { RuntimeContext } from '@/core/context/RuntimeContext';
import type { AgentState } from '../types';
import { Mode } from './Mode';
import { ModeType, type ModeTransitionRule } from './types';
import { MainMode } from './modes/MainMode';
import { CombatMode } from './modes/CombatMode';

export class ModeManager {
  private modes: Map<ModeType, Mode> = new Map();
  private currentMode: Mode | null = null;
  private transitionRules: ModeTransitionRule[] = [];

  private context: RuntimeContext;
  private state: AgentState | null = null;
  private logger: Logger;

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
    this.logger.info('📝 注册模式...');

    // 注册模式
    this.registerMode(new MainMode(this.context));
    this.registerMode(new CombatMode(this.context));

    // 注册转换规则
    this.registerTransitionRules();

    this.logger.info(`✅ 已注册 ${this.modes.size} 个模式`);
  }

  /**
   * 注册模式
   */
  private registerMode(mode: Mode): void {
    this.modes.set(mode.type, mode);
    this.logger.info(`  - ${mode.name} (优先级: ${mode.priority})`);
  }

  /**
   * 注册转换规则
   */
  private registerTransitionRules(): void {
    // 主模式 → 战斗模式
    this.addTransitionRule({
      from: ModeType.MAIN,
      to: ModeType.COMBAT,
      condition: state => this.shouldEnterCombat(state),
      priority: 10,
      description: '检测到敌对生物',
    });

    // 战斗模式 → 主模式
    this.addTransitionRule({
      from: ModeType.COMBAT,
      to: ModeType.MAIN,
      condition: state => this.shouldExitCombat(state),
      priority: 5,
      description: '战斗结束',
    });

    this.logger.info(`📋 已注册 ${this.transitionRules.length} 条转换规则`);
  }

  /**
   * 添加转换规则
   */
  addTransitionRule(rule: ModeTransitionRule): void {
    this.transitionRules.push(rule);

    // 按优先级排序
    this.transitionRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 尝试设置模式（检查优先级和转换规则）
   */
  async trySetMode(targetType: ModeType, reason: string): Promise<boolean> {
    const targetMode = this.modes.get(targetType);
    if (!targetMode) {
      this.logger.warn(`⚠️ 未知模式: ${targetType}`);
      return false;
    }

    // 检查是否已经是当前模式
    if (this.currentMode?.type === targetType) {
      return true;
    }

    // 检查优先级（被动响应模式可以中断任何模式）
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
  async setMode(targetType: ModeType, reason: string): Promise<void> {
    const targetMode = this.modes.get(targetType);
    if (!targetMode) {
      throw new Error(`未知模式: ${targetType}`);
    }

    await this.switchMode(targetMode, reason);
  }

  /**
   * 切换模式
   */
  private async switchMode(newMode: Mode, reason: string): Promise<void> {
    const oldMode = this.currentMode;

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
   */
  async checkAutoTransitions(): Promise<boolean> {
    if (!this.currentMode || !this.state) {
      return false;
    }

    // 查找适用的转换规则
    const applicableRules = this.transitionRules.filter(rule => rule.from === this.currentMode!.type);

    // 按优先级检查每个规则
    for (const rule of applicableRules) {
      try {
        const shouldTransition = await rule.condition(this.state);

        if (shouldTransition) {
          const success = await this.trySetMode(rule.to, rule.description);
          if (success) {
            return true;
          }
        }
      } catch (error) {
        this.logger.error(`❌ 检查转换规则失败: ${rule.description}`, error);
      }
    }

    return false;
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
  getCurrentModeObject(): Mode | null {
    return this.currentMode;
  }

  /**
   * 是否允许 LLM 决策
   */
  canUseLLMDecision(): boolean {
    return this.currentMode?.requiresLLMDecision ?? true;
  }

  /**
   * 转换条件：是否应该进入战斗模式
   */
  private shouldEnterCombat(state: AgentState): boolean {
    const enemies = (state.context.gameState.nearbyEntities || []).filter((e: any) => ['zombie', 'skeleton', 'spider', 'creeper'].includes(e.name));

    return enemies.length > 0 && enemies[0].distance < 10;
  }

  /**
   * 转换条件：是否应该退出战斗模式
   */
  private shouldExitCombat(state: AgentState): boolean {
    const enemies = (state.context.gameState.nearbyEntities || []).filter((e: any) => ['zombie', 'skeleton', 'spider', 'creeper'].includes(e.name));

    return enemies.length === 0;
  }
}
