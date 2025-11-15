/**
 * 战斗模式
 *
 * 参考原maicraft的CombatMode设计
 * 实现GameStateListener接口，实时响应威胁变化
 * 包含完整的战斗逻辑和自动转换机制
 */

import { BaseMode } from '@/core/agent/mode/BaseMode';
import { ModeManager } from '@/core/agent/mode/ModeManager';
import type { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionIds } from '@/core/actions/ActionIds';
import { getLogger } from '@/utils/Logger';

export class CombatMode extends BaseMode {
  readonly type = ModeManager.MODE_TYPES.COMBAT;
  readonly name = '战斗模式';
  readonly description = '自动战斗响应';
  readonly priority = 100; // 高优先级，参考原maicraft
  readonly requiresLLMDecision = false; // 不需要LLM决策，自动执行

  // 模式配置 - 参考原maicraft设计
  readonly maxDuration = 300; // 5分钟
  readonly autoRestore = true; // 自动恢复到主模式
  readonly restoreDelay = 10; // 10秒后恢复

  // GameStateListener 实现
  readonly listenerName = 'CombatMode';

  // 敌对生物列表 - 参考原maicraft
  private readonly hostileEntityNames = [
    'zombie',
    'skeleton',
    'creeper',
    'spider',
    'cave_spider',
    'enderman',
    'witch',
    'blaze',
    'ghast',
    'magma_cube',
    'slime',
    'piglin',
    'hoglin',
    'zoglin',
    'drowned',
    'husk',
    'stray',
    'phantom',
    'pillager',
    'vindicator',
    'evoker',
    'vex',
    'ravager',
    'shulker',
  ];

  // 战斗状态
  private currentEnemy: any | null = null;
  private lastAttackTime: number = 0;
  private combatStartTime: number = 0;
  private threatCount: number = 0;

  constructor(context: RuntimeContext) {
    super(context);
    // 重新设置logger以使用正确的名称
    this.logger = getLogger(this.name);
  }

  /**
   * 激活模式
   */
  protected async onActivate(reason: string): Promise<void> {
    this.combatStartTime = Date.now();
    this.currentEnemy = null;
    this.lastAttackTime = 0;
    this.threatCount = 0;

    this.logger.info(`⚔️ 进入战斗状态: ${reason}`);

    // 记录战斗开始到思考日志
    if (this.state?.memory) {
      this.state.memory.recordThought(`⚔️ 开始战斗: ${reason}`);
    }
  }

  /**
   * 停用模式
   */
  protected async onDeactivate(reason: string): Promise<void> {
    this.logger.info(`✌️ 退出战斗状态: ${reason}`);

    // 记录战斗结束到思考日志
    if (this.state?.memory) {
      const duration = ((Date.now() - this.combatStartTime) / 1000).toFixed(1);
      this.state.memory.recordThought(`✌️ 战斗结束，持续时间: ${duration}秒，原因: ${reason}`);
    }

    // 清理战斗状态
    this.currentEnemy = null;
    this.threatCount = 0;
  }

  /**
   * 模式主逻辑
   */
  async execute(): Promise<void> {
    if (!this.state) {
      return;
    }

    try {
      // 查找最近的敌人
      const nearestEnemy = this.findNearestEnemy();

      if (!nearestEnemy) {
        this.logger.debug('🔍 战斗模式下没有发现敌人，等待威胁检测...');
        return;
      }

      // 检查是否是新的敌人
      if (!this.currentEnemy || this.currentEnemy.id !== nearestEnemy.id) {
        this.currentEnemy = nearestEnemy;
        this.logger.info(`🎯 锁定新目标: ${nearestEnemy.name} (距离: ${nearestEnemy.distance.toFixed(1)}m)`);
      }

      // 检查攻击冷却（避免过于频繁的攻击）
      const now = Date.now();
      const cooldownMs = 1000; // 1秒冷却

      if (now - this.lastAttackTime < cooldownMs) {
        return; // 攻击冷却中
      }

      // 执行攻击
      await this.performAttack(nearestEnemy);
    } catch (error) {
      this.logger.error('❌ 战斗执行异常:', undefined, error as Error);

      if (this.state?.memory) {
        this.state.memory.recordThought(`❌ 战斗异常: ${error}`);
      }
    }
  }

  /**
   * 检查自动转换
   */
  async checkTransitions(): Promise<string[]> {
    const targetModes: string[] = [];

    // 检查是否应该退出战斗
    if (this.shouldExitCombat()) {
      targetModes.push(ModeManager.MODE_TYPES.MAIN);
    }

    // 检查是否超时
    if (this.isExpired()) {
      targetModes.push(ModeManager.MODE_TYPES.MAIN);
    }

    return targetModes;
  }

  /**
   * GameStateListener: 实体更新处理
   */
  async onEntitiesUpdated(entities: any[]): Promise<void> {
    // 计算威胁数量
    const hostileEntities = entities.filter((e: any) => this.hostileEntityNames.includes(e.name?.toLowerCase()));

    const previousThreatCount = this.threatCount;
    this.threatCount = hostileEntities.length;

    // 威胁出现时切换到战斗模式
    if (previousThreatCount === 0 && this.threatCount > 0) {
      const nearestEnemy = hostileEntities.reduce((nearest: any, current: any) => (current.distance < nearest.distance ? current : nearest));

      this.logger.info(`⚠️ 检测到威胁: ${nearestEnemy.name} (距离: ${nearestEnemy.distance.toFixed(1)}m)`);

      // 触发模式切换
      if (this.state?.modeManager && this.state.modeManager.getCurrentMode() !== this.type) {
        await this.state.modeManager.setMode(this.type, `检测到威胁生物: ${nearestEnemy.name}`);
      }
    }
    // 威胁消除时退出战斗模式
    else if (previousThreatCount > 0 && this.threatCount === 0) {
      this.logger.info('✅ 威胁消除');

      // 触发模式切换
      if (this.state?.modeManager && this.state.modeManager.getCurrentMode() === this.type) {
        await this.state.modeManager.setMode(ModeManager.MODE_TYPES.MAIN, '威胁消除');
      }
    }
  }

  /**
   * 查找最近的敌人
   */
  private findNearestEnemy(): any | null {
    if (!this.state?.context?.gameState?.nearbyEntities) {
      return null;
    }

    const entities = this.state.context.gameState.nearbyEntities;
    const enemies = entities.filter((e: any) => this.hostileEntityNames.includes(e.name?.toLowerCase()));

    if (enemies.length === 0) {
      return null;
    }

    // 返回最近的敌人
    return enemies.reduce((nearest: any, current: any) => (current.distance < nearest.distance ? current : nearest));
  }

  /**
   * 执行攻击
   */
  private async performAttack(enemy: any): Promise<void> {
    try {
      this.logger.info(`⚔️ 攻击目标: ${enemy.name} (距离: ${enemy.distance.toFixed(1)}m)`);
      this.lastAttackTime = Date.now();

      // 执行攻击动作
      const result = await this.state!.context.executor.execute(ActionIds.KILL_MOB, {
        entity: enemy.name,
        timeout: 30,
      });

      // 记录决策结果
      const decisionResult = result.success ? 'success' : 'failed';
      if (this.state?.memory) {
        this.state.memory.recordDecision(
          `战斗行动: 攻击 ${enemy.name}`,
          [
            {
              actionType: 'kill_mob',
              params: {
                entity: enemy.name,
                timeout: 30,
              },
            },
          ],
          decisionResult,
          `战斗持续${this.getRunningTime()}秒，敌人血量${enemy.health}，距离${enemy.distance} - ${result.message}`,
        );

        // 记录战斗结果到思考日志
        if (result.success) {
          this.state.memory.recordThought(`⚔️ 成功击杀 ${enemy.name}`);
          this.logger.info(`✅ 成功击杀: ${enemy.name}`);
        } else {
          this.state.memory.recordThought(`⚠️ 战斗失败: ${result.message}`);
          this.logger.warn(`⚠️ 战斗失败: ${result.message}`);
        }
      }

      if (result.success) {
        // 清理当前敌人，下次循环会寻找新目标
        this.currentEnemy = null;
      }
    } catch (error) {
      this.logger.error('❌ 攻击动作执行异常:', undefined, error as Error);

      if (this.state?.memory) {
        this.state.memory.recordThought(`❌ 攻击异常: ${error}`);
      }
    }
  }

  /**
   * 判断是否应该退出战斗
   * 参考原maicraft设计：威胁消除时立即退出
   */
  private shouldExitCombat(): boolean {
    return this.threatCount === 0;
  }

  /**
   * 获取战斗统计信息
   */
  getCombatStats(): {
    duration: number;
    threatCount: number;
    currentEnemy: string | null;
  } {
    return {
      duration: this.getRunningTime(),
      threatCount: this.threatCount,
      currentEnemy: this.currentEnemy?.name || null,
    };
  }
}
