/**
 * CraftItemAction - 智能合成物品
 *
 * 自动查找配方并合成物品
 * 支持工作台和背包合成
 */

import { BaseAction } from '../Action';
import { RuntimeContext } from '../../context/RuntimeContext';
import { ActionResult, CraftParams } from '../types';
import { ActionIds } from '../ActionIds';
import { MovementUtils } from '../../../utils/MovementUtils';

export class CraftItemAction extends BaseAction<CraftParams> {
  readonly id = ActionIds.CRAFT;
  readonly name = 'CraftItemAction';
  readonly description = '自动查找配方并合成物品';

  async execute(context: RuntimeContext, params: CraftParams): Promise<ActionResult> {
    const { item, count = 1 } = params;

    try {
      // 验证参数
      if (!item) {
        return this.failure('物品名称不能为空');
      }

      context.logger.info(`开始合成: ${item} x${count}`);

      // 获取配方
      const mcData = require('minecraft-data')(context.bot.version);
      const itemType = mcData.itemsByName[item];

      if (!itemType) {
        return this.failure(`未知的物品类型: ${item}`);
      }

      const recipes = context.bot.recipesFor(itemType.id, null, 1, null);

      if (recipes.length === 0) {
        return this.failure(`找不到 ${item} 的合成配方`);
      }

      context.logger.info(`找到 ${recipes.length} 个配方`);

      // 选择第一个配方
      const recipe = recipes[0];

      // 检查是否需要工作台
      const needsCraftingTable = recipe.requiresTable;

      if (needsCraftingTable) {
        context.logger.info('需要工作台进行合成');

        // 查找附近的工作台
        const craftingTableBlock = context.bot.findBlock({
          matching: mcData.blocksByName.crafting_table.id,
          maxDistance: 32,
        });

        if (!craftingTableBlock) {
          return this.failure('找不到工作台，无法合成 3x3 配方');
        }

        context.logger.info(`找到工作台: (${craftingTableBlock.position.x}, ${craftingTableBlock.position.y}, ${craftingTableBlock.position.z})`);

        // 使用 MovementUtils 移动到工作台附近
        const moveResult = await MovementUtils.moveToCoordinate(
          context.bot,
          craftingTableBlock.position.x,
          craftingTableBlock.position.y,
          craftingTableBlock.position.z,
          2, // 到达距离
          64, // 最大移动距离
          false, // 不使用相对坐标
        );

        if (!moveResult.success) {
          return this.failure(`移动到工作台失败: ${moveResult.message}`);
        }

        context.logger.info('成功移动到工作台附近');

        // 合成物品
        context.logger.info('开始合成...');
        await context.bot.craft(recipe, count, craftingTableBlock);
      } else {
        // 使用背包合成（2x2）
        context.logger.info('使用背包进行合成');
        await context.bot.craft(recipe, count, undefined);
      }

      context.logger.info(`成功合成 ${item} x${count}`);

      return this.success(`成功合成 ${item} x${count}`, {
        item,
        count,
        usedCraftingTable: needsCraftingTable,
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('合成失败:', err);
      return this.failure(`合成失败: ${err.message}`, err);
    }
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      item: {
        type: 'string',
        description: '物品名称（如 stick, wooden_pickaxe, iron_sword）',
      },
      count: {
        type: 'number',
        description: '合成数量，默认 1',
        optional: true,
      },
    };
  }
}
