/**
 * MineInDirectionAction - 按方向挖掘
 *
 * 持续在指定方向挖掘，直到超时或被中断
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MineInDirectionParams } from '@/core/actions/types';
import { ActionIds, Direction } from '@/core/actions/ActionIds';
import { Vec3 } from 'vec3';

export class MineInDirectionAction extends BaseAction<MineInDirectionParams> {
  readonly id = ActionIds.MINE_IN_DIRECTION;
  readonly name = 'MineInDirectionAction';
  readonly description = '持续在指定方向挖掘，直到超时';

  async execute(context: RuntimeContext, params: MineInDirectionParams): Promise<ActionResult> {
    try {
      const { direction, timeout } = params;

      if (!direction) {
        return this.failure('请指定挖掘方向');
      }

      const timeoutMs = timeout * 1000;
      const startTime = Date.now();
      let minedCount = 0;

      context.logger.info(`开始向 ${direction} 方向挖掘，超时时间: ${timeout}秒`);

      while (Date.now() - startTime < timeoutMs) {
        // 检查中断
        context.interruptSignal.throwIfInterrupted();

        // 获取目标位置
        const targetPos = this.getTargetPosition(context.bot.entity.position, direction);
        const targetBlock = context.bot.blockAt(targetPos);

        if (!targetBlock) {
          context.logger.warn('目标位置没有方块');
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        // 跳过空气和流体
        if (targetBlock.name === 'air' || targetBlock.name === 'water' || targetBlock.name === 'lava') {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        try {
          // 使用 collectBlock 插件挖掘
          await (context.bot as any).collectBlock.collect(targetBlock, {
            ignoreNoPath: false,
            count: 1,
          });

          minedCount++;
          context.logger.debug(`已挖掘 ${minedCount} 个方块`);

          // 短暂延迟
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          const err = error as Error;
          const errorMessage = err.message.toLowerCase();

          // 检查是否是工具相关的问题
          if (errorMessage.includes('harvestable tool') || errorMessage.includes('tool') || errorMessage.includes('cannot harvest')) {
            context.logger.warn(`挖掘失败: 缺少合适的挖掘工具 - ${err.message}`);
            // 对于工具问题，直接失败并返回具体的错误信息
            return this.failure(`缺少合适的挖掘工具，无法挖掘 ${targetBlock.name} 方块。请先获取合适的工具（如木镐、石镐等）`, undefined, {
              errorType: 'missing_tool',
              blockType: targetBlock.name,
              requiredTool: this.getRequiredTool(targetBlock.name),
            });
          }

          context.logger.warn(`挖掘失败: ${err.message}`);
          // 对于其他类型的错误，继续尝试下一个方块
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      }

      if (minedCount === 0) {
        return this.failure('未能挖掘任何方块');
      }

      return this.success(`在 ${direction} 方向挖掘了 ${minedCount} 个方块`, {
        direction,
        minedCount,
        timeElapsed: (Date.now() - startTime) / 1000,
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('按方向挖掘失败:', err);
      return this.failure(`按方向挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 根据方向获取目标位置
   */
  private getTargetPosition(currentPos: Vec3, direction: Direction): Vec3 {
    const pos = currentPos.clone();

    switch (direction) {
      case Direction.PLUS_X:
        pos.x += 1;
        break;
      case Direction.MINUS_X:
        pos.x -= 1;
        break;
      case Direction.PLUS_Y:
        pos.y += 1;
        break;
      case Direction.MINUS_Y:
        pos.y -= 1;
        break;
      case Direction.PLUS_Z:
        pos.z += 1;
        break;
      case Direction.MINUS_Z:
        pos.z -= 1;
        break;
      default:
        break;
    }

    return pos.floor();
  }

  /**
   * 获取方块所需的工具
   */
  private getRequiredTool(blockName: string): string {
    // Minecraft 方块挖掘工具要求
    const toolRequirements: { [key: string]: string } = {
      // 需要镐子的方块
      stone: '镐子',
      cobblestone: '镐子',
      coal_ore: '镐子',
      iron_ore: '镐子',
      gold_ore: '铁镐',
      diamond_ore: '铁镐',
      redstone_ore: '铁镐',
      lapis_ore: '镐子',
      emerald_ore: '铁镐',
      netherrack: '镐子',
      nether_bricks: '镐子',
      quartz_ore: '镐子',

      // 需要斧头的方块
      oak_log: '斧头',
      spruce_log: '斧头',
      birch_log: '斧头',
      jungle_log: '斧头',
      acacia_log: '斧头',
      dark_oak_log: '斧头',
      crimson_stem: '斧头',
      warped_stem: '斧头',
      wood: '斧头',
      planks: '斧头',

      // 需要锹的方块
      dirt: '锹',
      grass_block: '锹',
      sand: '锹',
      gravel: '锹',
      clay: '锹',
      soul_sand: '锹',
      snow: '锹',
    };

    // 检查精确匹配
    if (toolRequirements[blockName]) {
      return toolRequirements[blockName];
    }

    // 检查包含匹配（例如各种石头类型）
    for (const [pattern, tool] of Object.entries(toolRequirements)) {
      if (blockName.includes(pattern.replace('_', ''))) {
        return tool;
      }
    }

    // 默认返回镐子
    return '镐子';
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      direction: {
        type: 'string',
        description: '挖掘方向：+x, -x, +y, -y, +z, -z',
      },
      timeout: {
        type: 'number',
        description: '超时时间（秒）',
      },
    };
  }
}
