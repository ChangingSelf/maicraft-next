/**
 * UseFurnaceAction - 熔炉交互
 *
 * 与熔炉交互，支持放入、取出、查看操作
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, UseFurnaceParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { MovementUtils, GoalType } from '@/utils/MovementUtils';
import { Vec3 } from 'vec3';

/**
 * 熔炉物品接口
 */
interface FurnaceItem {
  name?: string;
  count?: number;
  position?: 'input' | 'fuel' | 'output';
}

export class UseFurnaceAction extends BaseAction<any> {
  readonly id = ActionIds.USE_FURNACE;
  readonly name = 'UseFurnaceAction';
  readonly description = '使用指定位置的熔炉。此动作会切换到熔炉GUI模式，由LLM决策具体的放入、取出操作';

  // 常见的燃料物品列表
  private readonly fuelItems = ['coal', 'charcoal', 'coal_block', 'lava_bucket', 'blaze_rod', 'dried_kelp_block', 'bamboo', 'stick'];

  async execute(context: RuntimeContext, params: any): Promise<ActionResult> {
    try {
      const { action = 'view', items = [], x, y, z, container_type = 'furnace' } = params;

      // 查找熔炉
      const furnaceBlock = await this.findFurnace(context, container_type, x, y, z);
      if (!furnaceBlock) {
        return this.failure('未找到熔炉');
      }

      // 移动到熔炉附近
      const moveResult = await context.movementUtils.moveTo(context.bot, {
        type: 'coordinate',
        x: furnaceBlock.position.x,
        y: furnaceBlock.position.y,
        z: furnaceBlock.position.z,
        distance: 3,
        maxDistance: 32,
        useRelativeCoords: false,
        goalType: GoalType.GoalGetToBlock,
      });

      if (!moveResult.success) {
        return this.failure(`无法移动到熔炉位置: ${moveResult.error}`);
      }

      // 打开熔炉
      const furnace = await context.bot.openContainer(furnaceBlock);

      try {
        const results: string[] = [];
        let successCount = 0;
        let totalErrors = 0;

        // 执行操作
        if (action === 'put') {
          if (!items || items.length === 0) {
            results.push('放入操作需要指定物品');
            totalErrors++;
          } else {
            for (const item of items) {
              const success = await this.performPutOperation(context, furnace, item, results);
              if (success) {
                successCount++;
              } else {
                totalErrors++;
              }
            }
          }
        } else if (action === 'take') {
          if (!items || items.length === 0) {
            results.push('取出操作需要指定槽位');
            totalErrors++;
          } else {
            for (const item of items) {
              const success = await this.performTakeOperation(furnace, item, results);
              if (success) {
                successCount++;
              } else {
                totalErrors++;
              }
            }
          }
        } else if (action === 'view') {
          const success = await this.performViewOperation(furnace, results);
          if (success) {
            successCount++;
          } else {
            totalErrors++;
          }
        } else {
          results.push(`不支持操作 ${action}`);
          totalErrors++;
        }

        // 获取熔炉内容
        const furnaceContents = this.getFurnaceContents(furnace);

        // 关闭熔炉
        furnace.close();

        // 返回结果
        const resultMessage = results.join('; ');

        if (successCount > 0 && totalErrors === 0) {
          return this.success(resultMessage, {
            operationResults: results,
            containerContents: furnaceContents,
            containerLocation: {
              x: furnaceBlock.position.x,
              y: furnaceBlock.position.y,
              z: furnaceBlock.position.z,
            },
            containerType: container_type,
          });
        } else if (successCount > 0) {
          return this.success(`部分成功: ${resultMessage}`, {
            operationResults: results,
            containerContents: furnaceContents,
            containerLocation: {
              x: furnaceBlock.position.x,
              y: furnaceBlock.position.y,
              z: furnaceBlock.position.z,
            },
            containerType: container_type,
          });
        } else {
          return this.failure(`所有操作失败: ${resultMessage}`);
        }
      } finally {
        furnace.close();
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('熔炉交互失败:', err);
      return this.failure(`熔炉交互失败: ${err.message}`, err);
    }
  }

  /**
   * 查找熔炉
   */
  private async findFurnace(context: RuntimeContext, containerType: string, x?: number, y?: number, z?: number): Promise<any> {
    const mcData = context.bot.registry;
    const furnaceId = mcData.blocksByName[containerType]?.id;

    if (!furnaceId) {
      throw new Error(`无法找到 ${containerType} 方块类型`);
    }

    if (x !== undefined && y !== undefined && z !== undefined) {
      // 查找指定坐标的熔炉
      const pos = new Vec3(x, y, z);
      const furnaceBlock = context.bot.blockAt(pos);
      if (!furnaceBlock) {
        throw new Error(`指定坐标 (${x}, ${y}, ${z}) 处没有方块`);
      }
      if (furnaceBlock.type !== furnaceId) {
        const blockName = mcData.blocks[furnaceBlock.type]?.name || `未知方块(${furnaceBlock.type})`;
        throw new Error(`指定坐标 (${x}, ${y}, ${z}) 处是 ${blockName}，不是 ${containerType}`);
      }
      return furnaceBlock;
    } else {
      // 找到最近熔炉
      const furnaceBlock = context.bot.findBlock({ matching: furnaceId, maxDistance: 32 });
      if (!furnaceBlock) {
        throw new Error(`附近没有 ${containerType}`);
      }
      return furnaceBlock;
    }
  }

  /**
   * 判断物品是否为燃料
   */
  private isFuelItem(itemName: string): boolean {
    return this.fuelItems.includes(itemName.toLowerCase());
  }

  /**
   * 根据物品类型和用户指定的位置确定最终位置
   */
  private determineItemPosition(
    itemName: string | undefined,
    specifiedPosition: 'input' | 'fuel' | 'output' | undefined,
  ): 'input' | 'fuel' | 'output' {
    // 如果用户明确指定了位置，直接使用
    if (specifiedPosition) {
      return specifiedPosition;
    }

    // 如果没有指定位置，根据物品类型自动判断
    if (!itemName) {
      return 'input'; // 默认放到输入槽
    }

    return this.isFuelItem(itemName) ? 'fuel' : 'input';
  }

  /**
   * 执行放入操作
   */
  private async performPutOperation(context: RuntimeContext, furnace: any, item: FurnaceItem, results: string[]): Promise<boolean> {
    try {
      if (!item.name) {
        results.push('放入操作必须指定物品名称');
        return false;
      }

      const mcData = context.bot.registry;
      const itemMeta = mcData.itemsByName[item.name];
      if (!itemMeta) {
        results.push(`未知物品: ${item.name}`);
        return false;
      }

      const invItem = context.bot.inventory.findInventoryItem(itemMeta.id, null, false);
      if (!invItem) {
        results.push(`背包没有 ${item.name}`);
        return false;
      }

      const count = Math.min(item.count || 1, invItem.count);
      const position = this.determineItemPosition(item.name, item.position);

      // 验证燃料物品不能放入输入槽
      if (position === 'input' && this.isFuelItem(item.name)) {
        results.push(`燃料物品 ${item.name} 不能放入输入槽，请使用fuel位置`);
        return false;
      }

      // 放入物品
      switch (position) {
        case 'input':
          await furnace.putInput(itemMeta.id, null, count);
          results.push(`已存入 ${item.name} ${count} 个到输入槽`);
          break;
        case 'fuel':
          await furnace.putFuel(itemMeta.id, null, count);
          results.push(`已存入 ${item.name} ${count} 个到燃料槽`);
          break;
        case 'output':
          results.push(`不能向输出槽添加物品`);
          return false;
        default:
          results.push(`无效的位置: ${position}`);
          return false;
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push(`存储 ${item.name} 失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 执行取出操作
   */
  private async performTakeOperation(furnace: any, item: FurnaceItem, results: string[]): Promise<boolean> {
    try {
      if (!item.position) {
        results.push('取出操作必须指定槽位位置');
        return false;
      }

      let targetItem;
      let positionName: string;

      // 根据位置获取物品
      switch (item.position) {
        case 'input':
          targetItem = furnace.inputItem();
          positionName = '输入槽';
          break;
        case 'fuel':
          targetItem = furnace.fuelItem();
          positionName = '燃料槽';
          break;
        case 'output':
          targetItem = furnace.outputItem();
          positionName = '输出槽';
          break;
        default:
          results.push(`无效的位置: ${item.position}`);
          return false;
      }

      if (!targetItem) {
        results.push(`${positionName}没有物品可以取出`);
        return false;
      }

      // 取出物品
      switch (item.position) {
        case 'input':
          await furnace.takeInput();
          break;
        case 'fuel':
          await furnace.takeFuel();
          break;
        case 'output':
          await furnace.takeOutput();
          break;
      }

      results.push(`已取出 ${targetItem.name} ${targetItem.count} 个（${positionName}）`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push(`取出物品失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 执行查看操作
   */
  private async performViewOperation(furnace: any, results: string[]): Promise<boolean> {
    try {
      const inputItem = furnace.inputItem();
      const fuelItem = furnace.fuelItem();
      const outputItem = furnace.outputItem();

      results.push('🔍 熔炉状态：');

      // 输入槽
      if (inputItem) {
        results.push(`  📥 输入槽: ${inputItem.name} × ${inputItem.count}`);
      } else {
        results.push('  📥 输入槽: 空');
      }

      // 燃料槽
      if (fuelItem) {
        results.push(`  🔥 燃料槽: ${fuelItem.name} × ${fuelItem.count}`);
      } else {
        results.push('  🔥 燃料槽: 空');
      }

      // 输出槽
      if (outputItem) {
        results.push(`  📤 输出槽: ${outputItem.name} × ${outputItem.count}`);
      } else {
        results.push('  📤 输出槽: 空');
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push(`查看熔炉状态失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 获取熔炉内容
   */
  private getFurnaceContents(furnace: any): any {
    return {
      input: furnace.inputItem() ? { name: furnace.inputItem().name, count: furnace.inputItem().count } : null,
      fuel: furnace.fuelItem() ? { name: furnace.fuelItem().name, count: furnace.fuelItem().count } : null,
      output: furnace.outputItem() ? { name: furnace.outputItem().name, count: furnace.outputItem().count } : null,
    };
  }

  /**
   * 获取参数 Schema（简化版，仅用于主模式触发GUI模式）
   */
  getParamsSchema(): any {
    return {
      position: {
        type: 'object',
        description: '熔炉位置坐标',
        properties: {
          x: { type: 'number', description: 'X坐标' },
          y: { type: 'number', description: 'Y坐标' },
          z: { type: 'number', description: 'Z坐标' },
        },
      },
    };
  }
}
