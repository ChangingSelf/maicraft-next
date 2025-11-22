/**
 * SwimToLandAction - 游向陆地
 *
 * 当机器人在水中时，寻找最近陆地并游过去
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, SwimToLandParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { MovementUtils, GoalType } from '@/utils/MovementUtils';

export class SwimToLandAction extends BaseAction<SwimToLandParams> {
  readonly id = ActionIds.SWIM_TO_LAND;
  readonly name = 'SwimToLandAction';
  readonly description = '游向最近的陆地';

  async execute(context: RuntimeContext, params: SwimToLandParams): Promise<ActionResult> {
    try {
      const maxDist = 64;
      const timeoutSec = 60;

      // 检查是否已在陆地上
      if (context.bot.entity.onGround) {
        const block = context.bot.blockAt(context.bot.entity.position);
        if (block && block.name !== 'water') {
          return this.success('已在陆地上');
        }
      }

      const mcData = context.bot.registry;
      const waterId = mcData.blocksByName.water?.id;

      if (!waterId) {
        return this.failure('无法找到水方块类型');
      }

      // 搜索可站立方块
      const positions = context.bot.findBlocks({
        maxDistance: maxDist,
        count: 200,
        matching: block => {
          if (!block) return false;
          if (block.type === waterId) return false;
          // 需要实体可站立
          const above = context.bot.blockAt(block.position.offset(0, 1, 0));
          const above2 = context.bot.blockAt(block.position.offset(0, 2, 0));
          return above?.name === 'air' && above2?.name === 'air';
        },
      });

      if (positions.length === 0) {
        return this.failure('未找到附近陆地');
      }

      // 按距离排序
      positions.sort((a, b) => context.bot.entity.position.distanceTo(a) - context.bot.entity.position.distanceTo(b));

      const startTime = Date.now();
      for (const pos of positions) {
        // 使用统一的移动工具类移动到陆地位置
        const moveResult = await context.movementUtils.moveTo(context.bot, {
          type: 'coordinate',
          x: pos.x,
          y: pos.y + 1,
          z: pos.z,
          distance: 1,
          maxDistance: maxDist,
          useRelativeCoords: false,
          goalType: GoalType.GoalNear,
        });

        if (!moveResult.success) {
          // 无法到达这个位置，继续尝试下一个
          continue;
        }

        // 检查是否离开水面
        if (context.bot.entity.onGround) {
          const blk = context.bot.blockAt(context.bot.entity.position);
          if (blk && blk.name !== 'water') {
            return this.success('已到达陆地');
          }
        }

        if ((Date.now() - startTime) / 1000 > timeoutSec) {
          break;
        }
      }

      return this.failure('超时未能到达陆地');
    } catch (error) {
      const err = error as Error;
      context.logger.error('游向陆地失败:', err);
      return this.failure(`游向陆地失败: ${err.message}`, err);
    }
  }

  /**
   * 判断是否应该激活此动作
   * 激活条件：玩家在水中，或者氧气 < 20
   */
  shouldActivate(context: RuntimeContext): boolean {
    const { gameState, bot } = context;

    // 氧气不足时激活
    if (gameState.oxygenLevel < 20) {
      return true;
    }

    // 检查是否在水中
    const blockAtFeet = bot.blockAt(bot.entity.position);
    const blockAtHead = bot.blockAt(bot.entity.position.offset(0, 1, 0));

    if (blockAtFeet?.name === 'water' || blockAtHead?.name === 'water') {
      return true;
    }

    return false;
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      // 无参数
    };
  }
}
