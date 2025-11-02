/**
 * FindBlockAction - 寻找可见方块
 *
 * 在指定半径内搜索可见的方块
 */

import { BaseAction } from '../Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, FindBlockParams } from '../types';
import { ActionIds } from '../ActionIds';
import { Vec3 } from 'vec3';

export class FindBlockAction extends BaseAction<FindBlockParams> {
  readonly id = ActionIds.FIND_BLOCK;
  readonly name = 'FindBlockAction';
  readonly description = '在视野内寻找可以直接看见的指定方块';

  async execute(context: RuntimeContext, params: FindBlockParams): Promise<ActionResult> {
    const { block, radius = 8, count = 1 } = params;

    try {
      // 验证参数
      if (!block) {
        return this.failure('方块名称不能为空');
      }

      context.logger.info(`寻找方块: ${block}, 半径: ${radius}, 数量: ${count}`);

      // 获取方块类型 ID
      const mcData = require('minecraft-data')(context.bot.version);
      const blockType = mcData.blocksByName[block];

      if (!blockType) {
        return this.failure(`未知的方块类型: ${block}`);
      }

      // 使用 bot.findBlocks 查找方块
      const blocks = context.bot.findBlocks({
        matching: blockType.id,
        maxDistance: radius,
        count,
      });

      if (blocks.length === 0) {
        context.logger.warn(`在 ${radius} 格半径内未找到 ${block}`);
        return this.failure(`未找到 ${block}`, undefined);
      }

      context.logger.info(`找到 ${blocks.length} 个 ${block}`);

      // 转换为易读的格式
      const foundBlocks = blocks.map((pos: Vec3) => {
        const distance = pos.distanceTo(context.bot.entity.position);
        return {
          position: {
            x: pos.x,
            y: pos.y,
            z: pos.z,
          },
          distance: parseFloat(distance.toFixed(2)),
        };
      });

      // 保存到方块缓存
      for (const pos of blocks) {
        context.blockCache.setBlock(pos.x, pos.y, pos.z, {
          name: block,
          type: blockType.id,
          position: pos,
          timestamp: Date.now(),
        });
      }

      return this.success(`找到 ${blocks.length} 个 ${block}`, {
        blockType: block,
        count: blocks.length,
        blocks: foundBlocks,
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('查找方块失败:', err);
      return this.failure(`查找方块失败: ${err.message}`, err);
    }
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      block: {
        type: 'string',
        description: '方块名称（如 iron_ore, diamond_ore, stone）',
      },
      radius: {
        type: 'number',
        description: '搜索半径（格），默认 8',
        optional: true,
      },
      count: {
        type: 'number',
        description: '最多找到的数量，默认 1',
        optional: true,
      },
    };
  }
}
