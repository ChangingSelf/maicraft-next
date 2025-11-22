/**
 * TossItemAction - 丢弃物品
 *
 * 丢弃指定物品
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, TossItemParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class TossItemAction extends BaseAction<TossItemParams> {
  readonly id = ActionIds.TOSS_ITEM;
  readonly name = 'TossItemAction';
  readonly description = '丢弃指定物品';

  async execute(context: RuntimeContext, params: TossItemParams): Promise<ActionResult> {
    try {
      const { item, count = 1 } = params;

      if (!item) {
        return this.failure('请指定要丢弃的物品');
      }

      // 查找物品
      const mcData = context.bot.registry;
      const itemMeta = mcData.itemsByName[item];

      if (!itemMeta) {
        return this.failure(`未知物品: ${item}`);
      }

      const itemToToss = context.bot.inventory.findInventoryItem(itemMeta.id, null, false);
      if (!itemToToss) {
        return this.failure(`背包中没有 ${item}`);
      }

      // 检查物品数量是否足够
      if (itemToToss.count < count) {
        return this.failure(`物品数量不足，需要 ${count} 个，实际有 ${itemToToss.count} 个`);
      }

      // 丢弃物品
      await context.bot.toss(itemMeta.id, null, count);

      return this.success(`已成功丢弃 ${count} 个 ${item}`, {
        item,
        count,
        remaining: itemToToss.count - count,
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('丢弃物品失败:', err);
      return this.failure(`丢弃物品失败: ${err.message}`, err);
    }
  }

  /**
   * 判断是否应该激活此动作
   * 激活条件：背包使用率 > 85%
   */
  shouldActivate(context: RuntimeContext): boolean {
    // 安全检查：确保bot和inventory存在
    if (!context.bot?.inventory) {
      return false;
    }

    const inventory = context.bot.inventory;
    const totalSlots = inventory.slots.length;
    const usedSlots = inventory.items().length;
    const usageRate = usedSlots / totalSlots;

    return usageRate > 0.85;
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      item: {
        type: 'string',
        description: '物品名称',
      },
      count: {
        type: 'number',
        description: '丢弃数量，默认 1',
        optional: true,
      },
    };
  }
}
