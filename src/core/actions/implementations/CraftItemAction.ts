/**
 * CraftItemAction - 智能合成物品
 *
 * 基于设计文档实现的增强合成动作，支持：
 * - 智能配方选择和递归合成
 * - 中文物品名称支持
 * - 材料约束验证
 * - 工作台自动管理
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, CraftParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class CraftItemAction extends BaseAction<CraftParams> {
  readonly id = ActionIds.CRAFT;
  readonly name = 'CraftItemAction';
  readonly description = '智能合成物品，自动处理配方、材料和工作台';

  async execute(context: RuntimeContext, params: CraftParams): Promise<ActionResult> {
    const { item, count = 1, requiredMaterials, maxComplexity } = params;

    try {
      // 1. 参数验证
      if (!item) {
        return this.failure('物品名称不能为空');
      }

      context.logger.info(
        `开始合成: ${item} x${count}` +
        `${requiredMaterials ? ` (指定材料: ${requiredMaterials.join(', ')})` : ''}` +
        `${maxComplexity ? ` (最大复杂度: ${maxComplexity})` : ''}`
      );

      // 2. 使用context中的CraftManager执行合成（遵循DI模式）
      const result = await context.craftManager.craftItem(item, count, {
        requiredMaterials,
        maxComplexity: maxComplexity || 10
      }, context.logger);

      if (result.success) {
        context.logger.info(`合成成功: ${item} x${count}`);
        return this.success(result.message, result.data);
      } else {
        context.logger.warn(`合成失败: ${result.message}`);
        // 添加更详细的错误信息，包含动作标识和参数
        const enhancedError = new Error(result.message);
        (enhancedError as any).actionId = this.id;
        (enhancedError as any).actionName = this.name;
        (enhancedError as any).params = {
          item,
          count,
          requiredMaterials,
          maxComplexity
        };
        (enhancedError as any).originalError = result.error;
        (enhancedError as any).timestamp = Date.now();
        return this.failure(result.message, enhancedError);
      }

    } catch (error) {
      const err = error as Error;
      context.logger.error('合成过程中发生错误:', err);
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
        description: '物品名称，支持中文和英文（如：木镐、wooden_pickaxe）',
      },
      count: {
        type: 'number',
        description: '合成数量，默认为1',
        optional: true,
        minimum: 1,
        maximum: 64,
      },
      requiredMaterials: {
        type: 'array',
        description: '指定必须使用的材料，如["oak_planks", "cobblestone"]',
        optional: true,
        items: {
          type: 'string'
        }
      },
      maxComplexity: {
        type: 'number',
        description: '最大递归合成深度，默认为10',
        optional: true,
        minimum: 1,
        maximum: 20,
      },
    };
  }
}
