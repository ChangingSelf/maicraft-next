/**
 * MineBlockByPositionAction - 按坐标挖掘方块
 *
 * 挖掘指定坐标位置的方块
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MineBlockByPositionParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { Vec3 } from 'vec3';
import { MovementUtils } from '@/utils/MovementUtils';

export class MineBlockByPositionAction extends BaseAction<MineBlockByPositionParams> {
  readonly id = ActionIds.MINE_BLOCK_BY_POSITION;
  readonly name = 'MineBlockByPositionAction';
  readonly description = '挖掘指定坐标位置的方块';

  async execute(context: RuntimeContext, params: MineBlockByPositionParams): Promise<ActionResult> {
    const { x, y, z } = params;

    try {
      // 验证参数
      if (x === undefined || y === undefined || z === undefined) {
        return this.failure('坐标参数不完整');
      }

      const targetPos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
      context.logger.info(`挖掘指定位置的方块: (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`);

      // 获取目标位置的方块
      const targetBlock = context.bot.blockAt(targetPos);

      if (!targetBlock) {
        return this.failure(`目标位置没有方块: (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`);
      }

      // 检查是否是空气方块
      if (targetBlock.name === 'air') {
        return this.failure('目标位置是空气方块');
      }

      context.logger.info(`目标方块: ${targetBlock.name}`);

      // 检查是否可以到达
      const distance = context.bot.entity.position.distanceTo(targetPos);
      if (distance > 6) {
        context.logger.warn(`方块距离过远 (${distance.toFixed(2)} > 6)，尝试移动靠近`);

        // 使用 MovementUtils 移动到方块附近
        const moveResult = await context.movementUtils.moveToCoordinate(
          context.bot,
          targetPos.x,
          targetPos.y,
          targetPos.z,
          4, // 到达距离
          64, // 最大移动距离
          false, // 不使用相对坐标
        );

        if (!moveResult.success) {
          return this.failure(`移动到目标位置失败: ${moveResult.message}`);
        }
      }

      // 检查是否有 collectBlock 插件
      if ((context.bot as any).collectBlock) {
        context.logger.info('使用 collectBlock 插件挖掘');
        await (context.bot as any).collectBlock.collect(targetBlock, {
          ignoreNoPath: false,
          count: 1,
        });
      } else {
        // 使用基本的 dig 方法
        context.logger.info('使用基本 dig 方法挖掘');

        // 如果方块需要工具，装备合适的工具
        await this.equipBestTool(context, targetBlock);

        // 挖掘方块
        await context.bot.dig(targetBlock);
      }

      context.logger.info(`成功挖掘 ${targetBlock.name}`);

      return this.success(`成功挖掘 ${targetBlock.name}`, {
        blockType: targetBlock.name,
        position: {
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
        },
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('挖掘失败:', err);
      return this.failure(`挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 装备最适合的工具
   */
  private async equipBestTool(context: RuntimeContext, block: any): Promise<void> {
    try {
      // 查找最适合的工具
      const tool = this.findBestTool(context, block);
      if (tool) {
        context.logger.info(`装备工具: ${tool.name}`);
        await context.bot.equip(tool, 'hand');
      }
    } catch (error) {
      // 装备失败不影响挖掘
      context.logger.warn('装备工具失败:', error);
    }
  }

  /**
   * 查找最适合的工具
   */
  private findBestTool(context: RuntimeContext, block: any): any {
    const tools = context.bot.inventory.items();
    let bestTool = null;
    let bestTime = Infinity;

    for (const tool of tools) {
      const time = block.digTime(tool);
      if (time < bestTime) {
        bestTime = time;
        bestTool = tool;
      }
    }

    return bestTool;
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      x: {
        type: 'number',
        description: 'X 坐标',
      },
      y: {
        type: 'number',
        description: 'Y 坐标（高度）',
      },
      z: {
        type: 'number',
        description: 'Z 坐标',
      },
    };
  }
}
