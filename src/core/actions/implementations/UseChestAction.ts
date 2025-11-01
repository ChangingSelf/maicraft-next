/**
 * UseChestAction - 箱子交互
 *
 * 与箱子交互，支持存储和取出物品，支持多箱子自动查找
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, UseChestParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { MovementUtils, GoalType } from '@/utils/MovementUtils';
import { Vec3 } from 'vec3';

/**
 * 物品数量接口
 */
interface ItemWithCount {
  name: string;
  count: number;
}

/**
 * 箱子信息接口
 */
interface ChestInfo {
  location: {
    x: number;
    y: number;
    z: number;
  };
  contents: Array<{
    name: string;
    count: number;
  }>;
  operations: string[];
  successCount: number;
  errorCount: number;
}

export class UseChestAction extends BaseAction<any> {
  readonly id = ActionIds.USE_CHEST;
  readonly name = 'UseChestAction';
  readonly description = '与箱子交互，默认存储操作，支持为每种物品指定不同数量。取出操作时，如果未指定特定箱子，会自动从附近多个箱子中取够所需物品';

  async execute(context: RuntimeContext, params: any): Promise<ActionResult> {
    try {
      const { action = 'store', items = [], x, y, z } = params;

      // 验证参数
      if (!items || items.length === 0) {
        return this.failure('请指定要操作的物品');
      }

      // 验证物品是否存在
      const mcData = context.bot.registry;
      const itemMetas: any[] = [];
      const validItems: ItemWithCount[] = [];

      for (const item of items) {
        const itemMeta = mcData.itemsByName[item.name];
        if (!itemMeta) {
          return this.failure(`未知物品: ${item.name}`);
        }
        itemMetas.push(itemMeta);
        validItems.push({
          name: item.name,
          count: item.count || 1,
        });
      }

      // 如果是取出操作且没有指定特定箱子，则执行多箱子操作
      if (action === 'withdraw' && x === undefined && y === undefined && z === undefined) {
        return await this.performMultiChestWithdraw(context, validItems, itemMetas);
      }

      // 单箱子操作
      const chestBlock = await this.findChest(context, x, y, z);
      if (!chestBlock) {
        return this.failure('未找到箱子');
      }

      // 移动到箱子附近
      const moveResult = await MovementUtils.moveTo(context.bot, {
        type: 'coordinate',
        x: chestBlock.position.x,
        y: chestBlock.position.y,
        z: chestBlock.position.z,
        distance: 3,
        maxDistance: 32,
        useRelativeCoords: false,
        goalType: GoalType.GoalGetToBlock,
      });

      if (!moveResult.success) {
        return this.failure(`无法移动到箱子位置: ${moveResult.error}`);
      }

      // 打开箱子
      const chest = await context.bot.openContainer(chestBlock);

      try {
        const results: string[] = [];
        let successCount = 0;
        let totalErrors = 0;

        // 执行操作
        if (action === 'store') {
          for (let i = 0; i < validItems.length; i++) {
            const success = await this.performStoreOperation(chest, validItems[i].name, itemMetas[i], validItems[i].count, context, results);
            if (success) {
              successCount++;
            } else {
              totalErrors++;
            }
          }
        } else if (action === 'withdraw') {
          for (let i = 0; i < validItems.length; i++) {
            const { success } = await this.performWithdrawOperation(chest, validItems[i].name, itemMetas[i], validItems[i].count, results);
            if (success) {
              successCount++;
            } else {
              totalErrors++;
            }
          }
        } else {
          return this.failure(`未知操作类型: ${action}`);
        }

        // 获取箱子内容
        const chestContents = this.getChestContents(chest);

        // 关闭箱子
        chest.close();

        // 返回结果
        const resultMessage = results.join('; ');

        if (successCount > 0 && totalErrors === 0) {
          return this.success(resultMessage, {
            operationResults: results,
            chestContents,
            chestLocation: {
              x: chestBlock.position.x,
              y: chestBlock.position.y,
              z: chestBlock.position.z,
            },
          });
        } else if (successCount > 0) {
          return this.success(`部分成功: ${resultMessage}`, {
            operationResults: results,
            chestContents,
            chestLocation: {
              x: chestBlock.position.x,
              y: chestBlock.position.y,
              z: chestBlock.position.z,
            },
          });
        } else {
          return this.failure(`所有操作失败: ${resultMessage}`);
        }
      } finally {
        chest.close();
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('箱子交互失败:', err);
      return this.failure(`箱子交互失败: ${err.message}`, err);
    }
  }

  /**
   * 查找箱子
   */
  private async findChest(context: RuntimeContext, x?: number, y?: number, z?: number): Promise<any> {
    const mcData = context.bot.registry;
    const chestId = mcData.blocksByName.chest?.id;

    if (!chestId) {
      throw new Error('无法找到箱子方块类型');
    }

    if (x !== undefined && y !== undefined && z !== undefined) {
      // 查找指定坐标的箱子
      const pos = new Vec3(x, y, z);
      const chestBlock = context.bot.blockAt(pos);
      if (!chestBlock) {
        throw new Error(`指定坐标 (${x}, ${y}, ${z}) 处没有方块`);
      }
      if (chestBlock.type !== chestId) {
        const blockName = mcData.blocks[chestBlock.type]?.name || `未知方块(${chestBlock.type})`;
        throw new Error(`指定坐标 (${x}, ${y}, ${z}) 处是 ${blockName}，不是箱子`);
      }
      return chestBlock;
    } else {
      // 找到最近箱子
      const chestBlock = context.bot.findBlock({ matching: chestId, maxDistance: 32 });
      if (!chestBlock) {
        throw new Error('附近没有箱子');
      }
      return chestBlock;
    }
  }

  /**
   * 查找多个箱子
   */
  private findMultipleChests(context: RuntimeContext, maxDistance: number = 32): any[] {
    const mcData = context.bot.registry;
    const chestId = mcData.blocksByName.chest?.id;

    if (!chestId) {
      return [];
    }

    const chestBlocks: any[] = [];
    const visitedPositions = new Set<string>();

    const allChestPositions = context.bot.findBlocks({
      matching: chestId,
      maxDistance,
      count: 20,
    });

    // 按距离排序
    allChestPositions.sort((a, b) => {
      const distA = context.bot.entity.position.distanceTo(a);
      const distB = context.bot.entity.position.distanceTo(b);
      return distA - distB;
    });

    // 去重并转换为方块对象
    for (const pos of allChestPositions) {
      if (chestBlocks.length >= 10) break;

      const posKey = `${pos.x},${pos.y},${pos.z}`;
      if (!visitedPositions.has(posKey)) {
        visitedPositions.add(posKey);
        const block = context.bot.blockAt(pos);
        if (block) {
          chestBlocks.push(block);
        }
      }
    }

    return chestBlocks;
  }

  /**
   * 执行存储操作
   */
  private async performStoreOperation(
    chest: any,
    itemName: string,
    itemMeta: any,
    count: number,
    context: RuntimeContext,
    results: string[],
  ): Promise<boolean> {
    let depositCount = 0;
    try {
      const invItem = context.bot.inventory.findInventoryItem(itemMeta.id, null, false);
      if (!invItem) {
        results.push(`背包没有 ${itemName}`);
        return false;
      }

      depositCount = Math.min(count, invItem.count);
      await chest.deposit(itemMeta.id, null, depositCount);
      results.push(`已存入 ${itemName} ${depositCount} 个`);
      return true;
    } catch (itemErr) {
      const errorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr);
      results.push(`存储 ${itemName} 失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 执行取出操作
   */
  private async performWithdrawOperation(
    chest: any,
    itemName: string,
    itemMeta: any,
    count: number,
    results: string[],
  ): Promise<{ success: boolean; shortage: number; withdrawn: number }> {
    let withdrawCount = 0;
    let shortage = 0;

    try {
      const chestItem = chest.containerItems().find((it: any) => it.type === itemMeta.id);
      if (!chestItem) {
        results.push(`箱子中没有 ${itemName}`);
        return { success: false, shortage: count, withdrawn: 0 };
      }

      withdrawCount = Math.min(count, chestItem.count);
      shortage = Math.max(0, count - chestItem.count);

      await chest.withdraw(itemMeta.id, null, withdrawCount);
      results.push(`已取出 ${itemName} ${withdrawCount} 个`);
      return { success: true, shortage, withdrawn: withdrawCount };
    } catch (itemErr) {
      const errorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr);
      results.push(`取出 ${itemName} 失败: ${errorMessage}`);
      return { success: false, shortage, withdrawn: 0 };
    }
  }

  /**
   * 获取箱子内容
   */
  private getChestContents(chest: any): any[] {
    const containerItems = chest.containerItems();
    return containerItems.map((item: any) => ({
      name: item.name || `未知物品(${item.type})`,
      count: item.count,
    }));
  }

  /**
   * 执行多箱子取出操作
   */
  private async performMultiChestWithdraw(context: RuntimeContext, items: ItemWithCount[], itemMetas: any[]): Promise<ActionResult> {
    const chests: ChestInfo[] = [];
    let totalSuccessCount = 0;
    let totalErrorCount = 0;

    // 复制物品列表，用于跟踪剩余需求
    const remainingItems = items.map(item => ({ ...item }));

    // 查找多个箱子
    const chestBlocks = this.findMultipleChests(context);

    if (chestBlocks.length === 0) {
      return this.failure('附近没有找到任何箱子');
    }

    // 遍历每个箱子
    for (const chestBlock of chestBlocks) {
      const chestInfo: ChestInfo = {
        location: {
          x: chestBlock.position.x,
          y: chestBlock.position.y,
          z: chestBlock.position.z,
        },
        contents: [],
        operations: [],
        successCount: 0,
        errorCount: 0,
      };

      try {
        // 移动到箱子附近
        const moveResult = await MovementUtils.moveTo(context.bot, {
          type: 'coordinate',
          x: chestBlock.position.x,
          y: chestBlock.position.y,
          z: chestBlock.position.z,
          distance: 3,
          maxDistance: 32,
          useRelativeCoords: false,
          goalType: GoalType.GoalGetToBlock,
        });

        if (!moveResult.success) {
          chestInfo.operations.push(`❌ 无法移动到箱子: ${moveResult.error}`);
          chestInfo.errorCount++;
          totalErrorCount++;
          chests.push(chestInfo);
          continue;
        }

        // 打开箱子
        const chest = await context.bot.openContainer(chestBlock);

        try {
          // 获取箱子内容
          chestInfo.contents = this.getChestContents(chest);

          // 尝试从这个箱子取出剩余需要的物品
          for (let i = 0; i < remainingItems.length; i++) {
            const item = remainingItems[i];
            if (item.count <= 0) continue; // 已经取够了

            const { success, withdrawn } = await this.performWithdrawOperation(chest, item.name, itemMetas[i], item.count, chestInfo.operations);

            if (success && withdrawn > 0) {
              chestInfo.successCount++;
              totalSuccessCount++;

              // 更新剩余需求
              item.count -= withdrawn;

              if (item.count <= 0) {
                chestInfo.operations.push(`✅ 已完全取出 ${item.name}`);
              }
            } else {
              chestInfo.errorCount++;
              totalErrorCount++;
            }
          }
        } finally {
          chest.close();
        }

        chests.push(chestInfo);

        // 检查是否所有物品都已取够
        const allItemsComplete = remainingItems.every(item => item.count <= 0);
        if (allItemsComplete) {
          break; // 提前结束，不需要继续查找其他箱子
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        chestInfo.operations.push(`❌ 访问箱子失败: ${errorMessage}`);
        chestInfo.errorCount++;
        totalErrorCount++;
        chests.push(chestInfo);
      }
    }

    // 过滤掉已完全取出的物品
    const finalRemainingItems = remainingItems.filter(item => item.count > 0);

    // 生成摘要
    const summary = this.generateMultiChestSummary(chests.length, totalSuccessCount, totalErrorCount, finalRemainingItems);

    if (totalSuccessCount > 0 && finalRemainingItems.length === 0) {
      return this.success(summary, {
        totalChests: chests.length,
        totalSuccessCount,
        totalErrorCount,
        chests,
        remainingItems: finalRemainingItems,
      });
    } else if (totalSuccessCount > 0) {
      return this.success(`部分成功: ${summary}`, {
        totalChests: chests.length,
        totalSuccessCount,
        totalErrorCount,
        chests,
        remainingItems: finalRemainingItems,
      });
    } else {
      return this.failure(`所有操作失败: ${summary}`);
    }
  }

  /**
   * 生成多箱子操作摘要
   */
  private generateMultiChestSummary(
    totalChests: number,
    totalSuccessCount: number,
    totalErrorCount: number,
    remainingItems: ItemWithCount[],
  ): string {
    const parts: string[] = [];

    parts.push(`访问了 ${totalChests} 个箱子`);
    parts.push(`成功操作: ${totalSuccessCount} 次`);

    if (totalErrorCount > 0) {
      parts.push(`失败操作: ${totalErrorCount} 次`);
    }

    if (remainingItems.length > 0) {
      const remainingList = remainingItems.map(item => `${item.name}(${item.count})`).join(', ');
      parts.push(`未能完全取出: ${remainingList}`);
    } else {
      parts.push('所有物品已完全取出');
    }

    return parts.join('; ');
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      action: {
        type: 'string',
        description: '操作类型 (store | withdraw)，默认是 store',
        optional: true,
      },
      items: {
        type: 'array',
        description: '物品及其数量的对象数组，格式：[{"name": "物品名", "count": 数量}, ...]',
        items: {
          name: {
            type: 'string',
            description: '物品名称',
          },
          count: {
            type: 'number',
            description: '物品数量',
            optional: true,
          },
        },
      },
      x: {
        type: 'number',
        description: '箱子X坐标（可选）',
        optional: true,
      },
      y: {
        type: 'number',
        description: '箱子Y坐标（可选）',
        optional: true,
      },
      z: {
        type: 'number',
        description: '箱子Z坐标（可选）',
        optional: true,
      },
    };
  }
}
