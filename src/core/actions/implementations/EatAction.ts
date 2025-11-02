/**
 * EatAction - 食用物品
 *
 * 食用指定的食物
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, EatParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class EatAction extends BaseAction<EatParams> {
  readonly id = ActionIds.EAT;
  readonly name = 'EatAction';
  readonly description = '食用指定的食物';

  async execute(context: RuntimeContext, params: EatParams): Promise<ActionResult> {
    try {
      const { item } = params;

      if (!item) {
        return this.failure('请指定要食用的物品');
      }

      // 查找物品
      const mcData = context.bot.registry;
      const itemMeta = mcData.itemsByName[item];

      if (!itemMeta) {
        return this.failure(`未知物品: ${item}`);
      }

      // 检查是否是食物
      if (!this.isFoodItem(item, mcData)) {
        return this.failure(`物品 ${item} 不是可食用的物品`);
      }

      const itemInInventory = context.bot.inventory.items().find(i => i.type === itemMeta.id);
      if (!itemInInventory) {
        return this.failure(`背包中没有 ${item}`);
      }

      // 如果当前手持的不是目标物品，切换到该物品
      if (!context.bot.heldItem || context.bot.heldItem.type !== itemMeta.id) {
        await context.bot.equip(itemMeta.id, 'hand');
      }

      // 获取使用前的总数量
      const totalCountBefore = this.getTotalItemCount(context, item);

      // 食用物品
      await context.bot.consume();

      // 等待物品更新
      await new Promise(resolve => setTimeout(resolve, 500));

      // 获取使用后的总数量
      const totalCountAfter = this.getTotalItemCount(context, item);

      return this.success(`成功食用物品: ${item}`, {
        itemName: item,
        itemCountBefore: totalCountBefore,
        itemCountAfter: totalCountAfter,
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('食用物品失败:', err);
      return this.failure(`食用物品失败: ${err.message}`, err);
    }
  }

  /**
   * 判断物品是否为食物
   */
  private isFoodItem(itemName: string, mcData: any): boolean {
    // 方法1：通过 foodsByName 检查
    if (mcData.foodsByName && mcData.foodsByName[itemName]) {
      return true;
    }

    // 方法2：通过物品ID在foods中查找
    if (mcData.itemsByName && mcData.foods) {
      const itemMeta = mcData.itemsByName[itemName];
      if (itemMeta && mcData.foods[itemMeta.id]) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取背包中指定物品的总数量
   */
  private getTotalItemCount(context: RuntimeContext, itemName: string): number {
    let totalCount = 0;

    for (const slot of context.bot.inventory.items()) {
      if (slot.name === itemName) {
        totalCount += slot.count;
      }
    }

    return totalCount;
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      item: {
        type: 'string',
        description: '食物名称',
      },
    };
  }
}
