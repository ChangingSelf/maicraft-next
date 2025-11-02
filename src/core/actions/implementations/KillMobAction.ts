/**
 * KillMobAction - 击杀生物
 *
 * 击杀附近指定名称的生物
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, KillMobParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { MovementUtils, GoalType } from '@/utils/MovementUtils';

export class KillMobAction extends BaseAction<KillMobParams> {
  readonly id = ActionIds.KILL_MOB;
  readonly name = 'KillMobAction';
  readonly description = '击杀指定名称的生物';

  async execute(context: RuntimeContext, params: KillMobParams): Promise<ActionResult> {
    try {
      const timeoutMs = (params.timeout ?? 300) * 1000;
      const startTime = Date.now();

      // 寻找最近目标生物
      const targetEntity = context.bot.nearestEntity((e: any) => e.name === params.entity && e.position.distanceTo(context.bot.entity.position) < 64);
      if (!targetEntity) {
        return this.failure(`附近未发现 ${params.entity}，请先探索或靠近目标`);
      }

      context.logger.info(
        `发现目标生物 ${params.entity}，位置: (${targetEntity.position.x.toFixed(1)}, ${targetEntity.position.y.toFixed(1)}, ${targetEntity.position.z.toFixed(1)})`,
      );

      // 装备护甲
      if ((context.bot as any).armorManager) {
        (context.bot as any).armorManager.equipAll();
      }

      // 尝试装备最佳武器（简化版）
      await this.equipBestWeapon(context);

      // 使用现有的攻击逻辑
      if ((context.bot as any).pvp?.attack) {
        context.logger.info('使用PVP插件进行攻击');
        await (context.bot as any).pvp.attack(targetEntity);
      } else {
        context.logger.info('使用简单攻击');
        // 移动到目标附近
        const moveResult = await MovementUtils.moveTo(context.bot, {
          type: 'coordinate',
          x: targetEntity.position.x,
          y: targetEntity.position.y,
          z: targetEntity.position.z,
          distance: 2,
          maxDistance: 50,
          useRelativeCoords: false,
          goalType: GoalType.GoalFollow,
        });

        if (!moveResult.success) {
          context.logger.warn(`移动到目标实体失败: ${moveResult.error}，尝试直接攻击`);
        }

        await context.bot.attack(targetEntity);
      }

      // 等待生物死亡
      await this.waitForMobDeath(context, targetEntity, timeoutMs, startTime);

      const stillExists = context.bot.entities[targetEntity.id];
      if (stillExists) {
        return this.failure(`在 ${params.timeout ?? 300}s 内未能击杀 ${params.entity}`);
      }

      return this.success(`已成功击杀 ${params.entity}`);
    } catch (error) {
      const err = error as Error;
      context.logger.error(`击杀 ${params.entity} 失败:`, err);
      return this.failure(`击杀 ${params.entity} 失败: ${err.message}`, err);
    }
  }

  /**
   * 装备最佳武器（简化版）
   */
  private async equipBestWeapon(context: RuntimeContext): Promise<void> {
    try {
      const mcData = context.bot.registry;

      // 武器优先级列表
      const weaponPriority = ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'];

      // 查找最佳武器
      for (const weaponName of weaponPriority) {
        const weaponItem = mcData.itemsByName[weaponName];
        if (!weaponItem) continue;

        const item = context.bot.inventory.findInventoryItem(weaponItem.id, null, false);
        if (item) {
          await context.bot.equip(weaponItem.id, 'hand');
          context.logger.info(`装备武器: ${weaponName}`);
          return;
        }
      }

      context.logger.warn('未找到合适的武器，使用空手');
    } catch (error) {
      context.logger.warn(`装备武器失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 等待生物死亡
   */
  private async waitForMobDeath(context: RuntimeContext, targetEntity: any, timeoutMs: number, startTime: number): Promise<void> {
    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        const stillAlive = context.bot.entities[targetEntity.id];
        const elapsed = Date.now() - startTime;
        if (!stillAlive || elapsed > timeoutMs) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      entity: {
        type: 'string',
        description: '目标生物名称（如 cow、pig、zombie）',
      },
      timeout: {
        type: 'number',
        description: '等待超时时间（秒），默认 300',
        optional: true,
      },
    };
  }
}
