/**
 * PlaceBlockAction - 放置方块
 *
 * 在指定位置放置方块
 */

import { BaseAction } from '../Action';
import { RuntimeContext } from '../../context/RuntimeContext';
import { ActionResult, PlaceBlockParams } from '../types';
import { ActionIds } from '../ActionIds';
import { Vec3 } from 'vec3';

export class PlaceBlockAction extends BaseAction<PlaceBlockParams> {
  readonly id = ActionIds.PLACE_BLOCK;
  readonly name = 'PlaceBlockAction';
  readonly description = '在指定位置放置方块';

  async execute(context: RuntimeContext, params: PlaceBlockParams): Promise<ActionResult> {
    const { block, x, y, z } = params;

    try {
      // 验证参数
      if (!block) {
        return this.failure('方块名称不能为空');
      }

      if (x === undefined || y === undefined || z === undefined) {
        return this.failure('坐标参数不完整');
      }

      const targetPos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
      context.logger.info(`放置方块: ${block} at (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`);

      // 检查目标位置是否已有方块
      const existingBlock = context.bot.blockAt(targetPos);
      if (existingBlock && existingBlock.name !== 'air') {
        return this.failure(`目标位置已有方块: ${existingBlock.name}`);
      }

      // 查找物品栏中的方块
      const mcData = require('minecraft-data')(context.bot.version);
      const blockType = mcData.blocksByName[block];

      if (!blockType) {
        return this.failure(`未知的方块类型: ${block}`);
      }

      const item = context.bot.inventory.items().find((i: any) => i.name === block);

      if (!item) {
        return this.failure(`物品栏中没有 ${block}`);
      }

      context.logger.info(`找到物品: ${item.name} x${item.count}`);

      // 装备方块
      await context.bot.equip(item, 'hand');

      // 找到参考方块（目标位置下方的方块）
      const referencePos = targetPos.offset(0, -1, 0);
      const referenceBlock = context.bot.blockAt(referencePos);

      if (!referenceBlock || referenceBlock.name === 'air') {
        return this.failure('目标位置下方没有参考方块，无法放置');
      }

      context.logger.info(`参考方块: ${referenceBlock.name} at (${referencePos.x}, ${referencePos.y}, ${referencePos.z})`);

      // 检查距离
      const distance = context.bot.entity.position.distanceTo(targetPos);
      if (distance > 5) {
        context.logger.warn(`距离过远 (${distance.toFixed(2)} > 5)，尝试移动靠近`);

        // 尝试移动到目标位置附近
        if ((context.bot as any).pathfinder) {
          const pathfinder = (context.bot as any).pathfinder;
          const { goals } = require('mineflayer-pathfinder');
          const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 3);
          pathfinder.setGoal(goal);

          // 等待移动完成
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              pathfinder.setGoal(null);
              reject(new Error('移动超时'));
            }, 30000);

            pathfinder.once('goal_reached', () => {
              clearTimeout(timeout);
              resolve(null);
            });
          });
        }
      }

      // 放置方块
      const faceVector = new Vec3(0, 1, 0); // 从下方放置
      await context.bot.placeBlock(referenceBlock, faceVector);

      // 更新方块缓存
      context.blockCache.addBlock(block, true, targetPos);

      context.logger.info(`成功放置 ${block}`);

      return this.success(`成功放置 ${block}`, {
        blockType: block,
        position: {
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
        },
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('放置方块失败:', err);
      return this.failure(`放置方块失败: ${err.message}`, err);
    }
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      block: {
        type: 'string',
        description: '方块名称（如 cobblestone, dirt, planks）',
      },
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
