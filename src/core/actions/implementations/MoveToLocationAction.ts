/**
 * MoveToLocationAction - 移动到命名位置
 *
 * 支持移动到预先保存的命名位置，如 "home", "base", "farm" 等
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MoveToLocationParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class MoveToLocationAction extends BaseAction<MoveToLocationParams> {
  readonly id = ActionIds.MOVE_TO_LOCATION;
  readonly name = 'MoveToLocationAction';
  readonly description = '移动到预先保存的命名位置';

  async execute(context: RuntimeContext, params: MoveToLocationParams): Promise<ActionResult> {
    const { locationName, reachDistance = 1, allowPartial = false } = params;

    try {
      // 从位置管理器获取位置坐标
      const location = await context.locationManager.getLocation(locationName);
      if (!location) {
        return this.failure(`未找到位置: ${locationName}`);
      }

      context.logger.info(`开始移动到位置 "${locationName}": (${location.position.x}, ${location.position.y}, ${location.position.z})`);

      // 使用 MovementUtils 进行移动
      const moveResult = await context.movementUtils.moveToCoordinate(
        context.bot,
        location.position.x,
        location.position.y,
        location.position.z,
        reachDistance,
        200, // 最大移动距离
        false, // 绝对坐标
      );

      if (moveResult.success) {
        const message = allowPartial && !moveResult.status.reached
          ? `部分完成移动到 "${locationName}"，距离 ${moveResult.distance.toFixed(2)} 格`
          : `成功移动到 "${locationName}"，距离 ${moveResult.distance.toFixed(2)} 格`;

        context.logger.info(message);
        return this.success(message, {
          locationName,
          distance: moveResult.distance,
          position: moveResult.finalPosition,
          targetPosition: moveResult.targetPosition,
          status: moveResult.status,
          isPartial: allowPartial && !moveResult.status.reached,
        });
      } else {
        context.logger.warn(`移动到 "${locationName}" 失败: ${moveResult.message}`);
        return this.failure(moveResult.message);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error(`移动到位置 "${locationName}" 时发生错误:`, err);
      return this.failure(`移动到位置失败: ${err.message}`, err);
    }
  }

  getParamsSchema(): any {
    return {
      locationName: {
        type: 'string',
        description: '要移动到的位置名称',
      },
      reachDistance: {
        type: 'number',
        description: '到达距离，默认 1',
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