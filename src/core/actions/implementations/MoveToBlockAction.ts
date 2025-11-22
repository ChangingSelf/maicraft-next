/**
 * MoveToBlockAction - 移动到方块附近
 *
 * 移动到指定类型的方块附近，便于交互（如挖掘、使用箱子等）
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MoveToBlockParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class MoveToBlockAction extends BaseAction<MoveToBlockParams> {
  readonly id = ActionIds.MOVE_TO_BLOCK;
  readonly name = 'MoveToBlockAction';
  readonly description = '移动到指定类型的方块附近，便于交互';

  async execute(context: RuntimeContext, params: MoveToBlockParams): Promise<ActionResult> {
    const { blockType, reachDistance = 4, searchRadius = 64, allowPartial = false } = params;

    try {
      context.logger.info(`开始寻找并移动到 ${blockType} 方块附近，搜索半径: ${searchRadius}，到达距离: ${reachDistance}`);

      // 使用 MovementUtils 进行移动
      const moveResult = await context.movementUtils.moveToBlock(context.bot, blockType, reachDistance, searchRadius);

      if (moveResult.success) {
        const message =
          allowPartial && !moveResult.status.reached
            ? `部分完成移动到 ${blockType} 方块附近，距离 ${moveResult.distance.toFixed(2)} 格`
            : `成功移动到 ${blockType} 方块附近，距离 ${moveResult.distance.toFixed(2)} 格`;

        context.logger.info(message);

        return this.success(message, {
          blockType,
          distance: moveResult.distance,
          position: moveResult.finalPosition,
          targetPosition: moveResult.targetPosition,
          status: moveResult.status,
          searchRadius,
          reachDistance,
          isPartial: allowPartial && !moveResult.status.reached,
        });
      } else {
        context.logger.warn(`移动到 ${blockType} 方块附近失败: ${moveResult.message}`);
        return this.failure(moveResult.message);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error(`移动到 ${blockType} 方块附近时发生错误:`, err);
      return this.failure(`移动到方块附近失败: ${err.message}`, err);
    }
  }

  getParamsSchema(): any {
    return {
      blockType: {
        type: 'string',
        description: '方块类型名称（如 "chest", "crafting_table", "oak_log"）',
      },
      reachDistance: {
        type: 'number',
        description: '交互距离，默认 4 格',
        optional: true,
      },
      searchRadius: {
        type: 'number',
        description: '搜索半径，默认 64 格',
        optional: true,
      },
      allowPartial: {
        type: 'boolean',
        description: '是否允许部分完成，默认 false',
        optional: true,
      },
    };
  }
}
