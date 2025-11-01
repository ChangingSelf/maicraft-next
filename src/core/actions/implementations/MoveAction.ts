/**
 * MoveAction - 移动到指定坐标
 *
 * 使用 mineflayer-pathfinder 插件进行路径寻找和移动
 * 支持自动导航、避障、跳跃等
 */

import { BaseAction } from '../Action';
import { RuntimeContext } from '../../context/RuntimeContext';
import { ActionResult, MoveParams } from '../types';
import { ActionIds } from '../ActionIds';
import { Vec3 } from 'vec3';

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

      const targetPos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
      const currentPos = context.bot.entity.position;

      context.logger.info(
        `开始移动: 从 (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}) 到 (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`,
      );

      // 检查是否已经在目标位置附近
      const distance = currentPos.distanceTo(targetPos);
      if (distance < 2) {
        context.logger.info('已经在目标位置附近');
        return this.success('已在目标位置', {
          distance,
          position: {
            x: currentPos.x,
            y: currentPos.y,
            z: currentPos.z,
          },
        });
      }

      // 检查 pathfinder 插件是否可用
      if (!(context.bot as any).pathfinder) {
        return this.failure('pathfinder 插件未加载，无法使用自动寻路功能');
      }

      // 使用 pathfinder 插件进行移动
      const pathfinder = (context.bot as any).pathfinder;
      const { goals } = require('mineflayer-pathfinder');

      // 创建目标（移动到目标位置附近 1 格范围内）
      const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1);

      // 设置移动目标
      pathfinder.setGoal(goal);

      // 等待移动完成或超时
      const result = await this.waitForMovement(context, targetPos, timeout);

      if (result.success) {
        context.logger.info(`移动成功: 最终距离 ${result.data.distance.toFixed(2)} 格`);
      } else {
        context.logger.warn(`移动失败: ${result.message}`);
      }

      return result;
    } catch (error) {
      const err = error as Error;
      context.logger.error('移动过程中发生错误:', err);
      return this.failure(`移动失败: ${err.message}`, err);
    }
  }

  /**
   * 等待移动完成
   */
  private async waitForMovement(context: RuntimeContext, targetPos: Vec3, timeout: number): Promise<ActionResult> {
    const startTime = Date.now();
    const checkInterval = 500; // 每 500ms 检查一次

    return new Promise(resolve => {
      const intervalId = setInterval(() => {
        // 检查是否超时
        if (Date.now() - startTime > timeout) {
          clearInterval(intervalId);
          const currentPos = context.bot.entity.position;
          const distance = currentPos.distanceTo(targetPos);
          resolve(this.failure(`移动超时 (${timeout}ms)，当前距离目标 ${distance.toFixed(2)} 格`, undefined));
          return;
        }

        // 检查是否被中断
        if (context.interruptSignal.isInterrupted()) {
          clearInterval(intervalId);
          const pathfinder = (context.bot as any).pathfinder;
          pathfinder.setGoal(null); // 停止移动
          resolve(this.failure(`移动被中断: ${context.interruptSignal.getReason()}`, undefined));
          return;
        }

        // 检查是否到达目标
        const currentPos = context.bot.entity.position;
        const distance = currentPos.distanceTo(targetPos);

        if (distance < 2) {
          clearInterval(intervalId);
          resolve(
            this.success(`成功到达目标位置`, {
              distance,
              position: {
                x: currentPos.x,
                y: currentPos.y,
                z: currentPos.z,
              },
              duration: Date.now() - startTime,
            }),
          );
          return;
        }
      }, checkInterval);

      // 监听 pathfinder 的 goal_reached 事件
      const pathfinder = (context.bot as any).pathfinder;
      const onGoalReached = () => {
        clearInterval(intervalId);
        const currentPos = context.bot.entity.position;
        const distance = currentPos.distanceTo(targetPos);
        resolve(
          this.success(`到达目标位置`, {
            distance,
            position: {
              x: currentPos.x,
              y: currentPos.y,
              z: currentPos.z,
            },
            duration: Date.now() - startTime,
          }),
        );
      };

      pathfinder.once('goal_reached', onGoalReached);

      // 清理监听器
      setTimeout(() => {
        pathfinder.removeListener('goal_reached', onGoalReached);
      }, timeout + 1000);
    });
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
