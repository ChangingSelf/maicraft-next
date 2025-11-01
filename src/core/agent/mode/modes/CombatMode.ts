/**
 * 战斗模式
 * 自动战斗响应
 */

import { Mode } from '../Mode';
import { ModeType } from '../types';
import type { RuntimeContext } from '../../../RuntimeContext';
import { ActionIds } from '../../../actions/ActionIds';

export class CombatMode extends Mode {
  readonly type = ModeType.COMBAT;
  readonly name = '战斗模式';
  readonly description = '自动战斗响应';
  readonly priority = 10;
  readonly requiresLLMDecision = false; // 不需要 LLM 决策，完全自动

  private combatTask: Promise<void> | null = null;

  constructor(context: RuntimeContext) {
    super(context);
  }

  async activate(reason: string): Promise<void> {
    await super.activate(reason);

    // 启动战斗逻辑
    this.combatTask = this.runCombatLogic();
  }

  async deactivate(reason: string): Promise<void> {
    await super.deactivate(reason);

    // 停止战斗逻辑
    this.combatTask = null;
  }

  /**
   * 战斗逻辑
   */
  private async runCombatLogic(): Promise<void> {
    while (this.isActive) {
      // 查找最近的敌对实体
      const nearestEnemy = this.findNearestEnemy();

      if (!nearestEnemy) {
        // 没有敌人，退出战斗模式
        break;
      }

      // 执行战斗动作
      try {
        await this.context.executor.execute(ActionIds.KILL_MOB, {
          entity: nearestEnemy.name,
          timeout: 30,
        });
      } catch (error) {
        this.context.logger.error('战斗动作执行失败:', error);
      }

      await this.sleep(500);
    }
  }

  /**
   * 查找最近的敌对实体
   */
  private findNearestEnemy(): any | null {
    const entities = this.context.gameState.nearbyEntities || [];

    // 查找最近的敌对生物
    const enemies = entities.filter((e: any) => ['zombie', 'skeleton', 'spider', 'creeper'].includes(e.name));

    if (enemies.length === 0) {
      return null;
    }

    // 返回最近的敌人
    return enemies.reduce((nearest: any, current: any) => (current.distance < nearest.distance ? current : nearest));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
