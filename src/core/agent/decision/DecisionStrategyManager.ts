/**
 * 决策策略管理器
 *
 * 负责管理所有决策策略，按优先级执行
 */

import type { AgentState } from '../types';
import type { DecisionStrategy, StrategyGroup } from './types';
import { getLogger, type Logger } from '@/utils/Logger';

export class DecisionStrategyManager {
  private strategies: DecisionStrategy[] = [];
  private strategyGroups: Map<StrategyGroup, DecisionStrategy[]> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = getLogger('StrategyManager');
  }

  /**
   * 添加策略
   *
   * @param strategy - 要添加的策略
   */
  addStrategy(strategy: DecisionStrategy): void {
    this.strategies.push(strategy);

    // 按优先级排序（从高到低）
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority());

    // 按分组组织
    const group = strategy.getGroup?.();
    if (group) {
      if (!this.strategyGroups.has(group)) {
        this.strategyGroups.set(group, []);
      }
      this.strategyGroups.get(group)!.push(strategy);
    }

    this.logger.debug(`策略已添加: ${strategy.name} (优先级: ${strategy.getPriority()}, 分组: ${group || '无'})`);
  }

  /**
   * 移除策略
   *
   * @param strategy - 要移除的策略
   */
  removeStrategy(strategy: DecisionStrategy): void {
    const index = this.strategies.indexOf(strategy);
    if (index > -1) {
      this.strategies.splice(index, 1);
      this.logger.debug(`策略已移除: ${strategy.name}`);
    }

    // 从分组中移除
    const group = strategy.getGroup?.();
    if (group) {
      const groupStrategies = this.strategyGroups.get(group);
      if (groupStrategies) {
        const groupIndex = groupStrategies.indexOf(strategy);
        if (groupIndex > -1) {
          groupStrategies.splice(groupIndex, 1);
        }
      }
    }
  }

  /**
   * 执行策略
   *
   * 按优先级顺序检查并执行第一个可执行的策略
   *
   * @param state - Agent状态
   * @returns 是否执行了策略
   */
  async executeStrategies(state: AgentState): Promise<boolean> {
    for (const strategy of this.strategies) {
      try {
        const canExecute = await strategy.canExecute(state);

        if (canExecute) {
          this.logger.debug(`✨ 执行策略: ${strategy.name}`);
          await strategy.execute(state);
          return true;
        }
      } catch (error) {
        this.logger.error(`❌ 策略执行失败: ${strategy.name}`, undefined, error as Error);
        // 继续尝试下一个策略
      }
    }

    return false;
  }

  /**
   * 获取当前可执行的最高优先级策略信息
   *
   * @param state - Agent状态
   * @returns 策略信息，如果没有可执行策略则返回 null
   */
  async getCurrentStrategyInfo(state: AgentState): Promise<{ strategy: DecisionStrategy; group: StrategyGroup | undefined } | null> {
    for (const strategy of this.strategies) {
      try {
        const canExecute = await strategy.canExecute(state);
        if (canExecute) {
          return {
            strategy,
            group: strategy.getGroup?.(),
          };
        }
      } catch (error) {
        this.logger.error(`❌ 检查策略失败: ${strategy.name}`, undefined, error as Error);
      }
    }

    return null;
  }

  /**
   * 获取所有已注册的策略
   *
   * @returns 策略列表
   */
  getStrategies(): DecisionStrategy[] {
    return [...this.strategies];
  }

  /**
   * 获取策略统计信息
   */
  getStats(): {
    totalStrategies: number;
    groups: Map<StrategyGroup, number>;
  } {
    const groups = new Map<StrategyGroup, number>();
    for (const [group, strategies] of this.strategyGroups) {
      groups.set(group, strategies.length);
    }

    return {
      totalStrategies: this.strategies.length,
      groups,
    };
  }
}
