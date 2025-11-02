/**
 * MoveAction - 移动到指定坐标
 *
 * 使用 MovementUtils 统一的移动功能
 */

import { BaseAction } from '../Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MoveParams } from '../types';
import { ActionIds } from '../ActionIds';
import { MovementUtils } from '@/utils/MovementUtils';

export class MoveAction extends BaseAction<MoveParams> {
  readonly id = ActionIds.MOVE;
  readonly name = 'MoveAction';
  readonly description = '移动到指定坐标';

  async execute(context: RuntimeContext, params: MoveParams): Promise<ActionResult> {
    const { x, y, z, timeout = 60000 } = params;

    try {
      // 验证参数
      if (x === undefined || y === undefined || z === undefined) {
        return this.failure('坐标参数不完整');
      }

      const currentPos = context.bot.entity.position;

      context.logger.info(`开始移动: 从 (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}) 到 (${x}, ${y}, ${z})`);

      // 使用 MovementUtils 进行移动
      const moveResult = await MovementUtils.moveToCoordinate(
        context.bot,
        Math.floor(x),
        Math.floor(y),
        Math.floor(z),
        1, // 到达距离
        200, // 最大移动距离
        false, // 不使用相对坐标
      );

      if (moveResult.success) {
        context.logger.info(`移动成功: 最终距离 ${moveResult.distance.toFixed(2)} 格`);
        return this.success(moveResult.message, {
          distance: moveResult.distance,
          position: moveResult.finalPosition,
          targetPosition: moveResult.targetPosition,
          status: moveResult.status,
        });
      } else {
        context.logger.warn(`移动失败: ${moveResult.message}`);
        return this.failure(moveResult.message, undefined);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('移动过程中发生错误:', err);
      return this.failure(`移动失败: ${err.message}`, err);
    }
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
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 60000',
        optional: true,
      },
    };
  }
}
