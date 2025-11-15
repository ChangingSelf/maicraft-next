/**
 * MoveToEntityAction - 移动到实体附近
 *
 * 支持跟随或移动到玩家、生物等实体附近
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MoveToEntityParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class MoveToEntityAction extends BaseAction<MoveToEntityParams> {
  readonly id = ActionIds.MOVE_TO_ENTITY;
  readonly name = 'MoveToEntityAction';
  readonly description = '移动到指定类型的实体附近或跟随实体';

  async execute(context: RuntimeContext, params: MoveToEntityParams): Promise<ActionResult> {
    const {
      entityName,
      entityType,
      followDistance = 3,
      maxDistance = 100,
      continuous = false,
    } = params;

    try {
      context.logger.info(`开始移动到 ${entityType} "${entityName}" 附近，跟随距离: ${followDistance}`);

      // 使用 MovementUtils 移动到实体
      const moveResult = await context.movementUtils.moveToEntity(
        context.bot,
        entityName,
        followDistance,
        maxDistance,
      );

      if (moveResult.success) {
        const message = continuous
          ? `开始跟随 "${entityName}"，保持距离 ${followDistance} 格`
          : `成功移动到 "${entityName}" 附近，距离 ${moveResult.distance.toFixed(2)} 格`;

        context.logger.info(message);

        const resultData = {
          entityName,
          entityType,
          distance: moveResult.distance,
          position: moveResult.finalPosition,
          targetPosition: moveResult.targetPosition,
          status: moveResult.status,
          isFollowing: continuous,
        };

        // 如果需要持续跟随，设置跟踪任务
        if (continuous) {
          // 这里可以启动一个后台任务来维持跟随状态
          // 暂时只记录状态
          resultData.isFollowing = true;
        }

        return this.success(message, resultData);
      } else {
        context.logger.warn(`移动到 "${entityName}" 失败: ${moveResult.message}`);
        return this.failure(moveResult.message);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error(`移动到实体 "${entityName}" 时发生错误:`, err);
      return this.failure(`移动到实体失败: ${err.message}`, err);
    }
  }

  getParamsSchema(): any {
    return {
      entityName: {
        type: 'string',
        description: '实体的名称或类型（如 "player", "cow", "zombie"）',
      },
      entityType: {
        type: 'string',
        enum: ['player', 'mob', 'animal', 'hostile', 'passive', 'any'],
        description: '实体类型',
      },
      followDistance: {
        type: 'number',
        description: '跟随或接近的距离，默认 3',
        optional: true,
      },
      maxDistance: {
        type: 'number',
        description: '最大搜索距离，默认 100',
        optional: true,
      },
      continuous: {
        type: 'boolean',
        description: '是否持续跟随，默认 false',
        optional: true,
      },
    };
  }
}