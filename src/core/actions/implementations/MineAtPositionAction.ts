/**
 * MineAtPositionAction - 在指定位置精准挖掘
 *
 * 基于简化的挖掘设计，支持安全检查和强制模式
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { Vec3 } from 'vec3';
import { goals } from 'mineflayer-pathfinder-mai';

// 定义本地参数类型以避免循环依赖
interface MineAtPositionParams {
  x: number;
  y: number;
  z: number;
  count?: number;
  force?: boolean;
  collect?: boolean;
}

export class MineAtPositionAction extends BaseAction<MineAtPositionParams> {
  readonly id = ActionIds.MINE_AT_POSITION;
  readonly name = 'MineAtPositionAction';
  readonly description = '在指定位置精准挖掘方块';

  async execute(context: RuntimeContext, params: MineAtPositionParams): Promise<ActionResult> {
    const { x, y, z, count = 1, force = false, collect = true } = params;

    try {
      // 1. 参数验证
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        return this.failure('坐标参数必须是数字');
      }

      const position = new Vec3(x, y, z);

      // 强制模式警告
      if (force) {
        context.logger.warn('⚠️  使用强制挖掘模式，已绕过安全检查');
      }

      context.logger.info(`开始挖掘坐标 (${x}, ${y}, ${z}) 的方块，数量: ${count}`);

      // 2. 执行挖掘（支持数量）
      const results = [];
      let consecutiveFailures = 0;
      const maxFailures = 3; // 连续失败3次就停止

      for (let i = 0; i < count; i++) {
        // 检查中断
        context.interruptSignal.throwIfInterrupted();

        const result = await this.digSingleBlock(context, position, force, collect);
        results.push(result);

        if (!result.success) {
          consecutiveFailures++;
          context.logger.warn(`第 ${i + 1} 个方块挖掘失败: ${result.message}`);

          // 如果连续失败多次，停止挖掘
          if (consecutiveFailures >= maxFailures) {
            context.logger.warn(`连续失败 ${maxFailures} 次，停止挖掘`);
            break;
          }
        } else {
          consecutiveFailures = 0;
        }

        // 短暂延迟，避免过快操作
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      const successCount = results.filter(r => r.success).length;
      const message = `挖掘完成：成功 ${successCount}/${count} 个方块`;

      if (successCount > 0) {
        context.logger.info(`挖掘成功: ${message}`);
        return this.success(message, {
          successCount,
          totalCount: count,
          results: results.map(r => ({ success: r.success, message: r.message })),
        });
      } else {
        context.logger.warn(`挖掘失败: ${results[0]?.message || '未知错误'}`);
        return this.failure(results[0]?.message || '挖掘失败');
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('挖掘过程中发生错误:', err);
      return this.failure(`挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 挖掘单个方块
   */
  private async digSingleBlock(context: RuntimeContext, position: Vec3, force: boolean, collect: boolean): Promise<ActionResult> {
    try {
      // 1. 获取目标方块
      const block = context.bot.blockAt(position);
      if (!block || block.name === 'air') {
        return this.failure('目标位置没有方块或为空气');
      }

      context.logger.debug(`目标方块: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);

      // 2. 安全检查
      if (!force) {
        const safetyCheck = await this.performSafetyCheck(context, block, position);
        if (!safetyCheck.safe) {
          const message = `${safetyCheck.reason}。${safetyCheck.suggestion || ''}`;
          return this.failure(message);
        }
      } else {
        context.logger.debug('跳过安全检查（强制模式）');
      }

      // 3. 工具检查和装备（仅在非强制模式）
      if (!force) {
        const toolResult = await this.equipBestTool(context, block);
        if (!toolResult.success) {
          return this.failure(toolResult.message);
        }
      }

      // 4. 执行挖掘
      context.logger.debug(`开始挖掘 ${block.name}`);
      await context.bot.dig(block);

      // 5. 收集掉落物（可选）
      if (collect) {
        await this.collectDrops(context);
      }

      return this.success(`成功挖掘 ${block.name}`, {
        blockType: block.name,
        position: { x: block.position.x, y: block.position.y, z: block.position.z },
      });
    } catch (error) {
      const err = error as Error;
      return this.failure(`挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 执行安全检查
   */
  private async performSafetyCheck(
    context: RuntimeContext,
    block: any,
    position: Vec3,
  ): Promise<{ safe: boolean; reason?: string; suggestion?: string }> {
    // 流体检查
    if (this.isFluidBlock(block)) {
      return {
        safe: false,
        reason: `无法挖掘流体方块: ${block.name}`,
        suggestion: '请先处理流体，或使用force参数强制挖掘',
      };
    }

    // 不可破坏方块检查
    if (this.isUnbreakableBlock(block)) {
      return {
        safe: false,
        reason: `无法破坏的方块: ${block.name}`,
        suggestion: '此方块无法被破坏，请选择其他目标',
      };
    }

    // 掉落物检查
    const aboveBlock = context.bot.blockAt(position.offset(0, 1, 0));
    if (aboveBlock && this.isFallingBlock(aboveBlock)) {
      return {
        safe: false,
        reason: `上方有掉落方块: ${aboveBlock.name}`,
        suggestion: '请先清理上方掉落物，或使用force参数强制挖掘',
      };
    }

    // 工具检查
    const tool = context.bot.pathfinder.bestHarvestTool(block);
    if (!tool && block.hardness > 0) {
      return {
        safe: false,
        reason: `需要合适工具挖掘: ${block.name}`,
        suggestion: '请装备合适的工具，或使用force参数强制挖掘',
      };
    }

    // 可见性检查
    if (!context.bot.canSeeBlock(block)) {
      return {
        safe: false,
        reason: '目标方块不可见',
        suggestion: '请移动到可见位置，或使用force参数强制挖掘',
      };
    }

    return { safe: true };
  }

  /**
   * 装备最佳工具
   */
  private async equipBestTool(context: RuntimeContext, block: any): Promise<ActionResult> {
    try {
      const tool = context.bot.pathfinder.bestHarvestTool(block);
      if (tool) {
        await context.bot.equip(tool, 'hand');
        context.logger.debug(`装备工具: ${tool.name}`);
      }
      return this.success('工具装备完成');
    } catch (error) {
      const err = error as Error;
      return this.failure(`工具装备失败: ${err.message}`, err);
    }
  }

  /**
   * 收集附近的掉落物
   */
  private async collectDrops(context: RuntimeContext): Promise<void> {
    try {
      const droppedItems = Object.values(context.bot.entities).filter(
        entity => entity.name === 'item' && entity.position.distanceTo(context.bot.entity.position) <= 5,
      );

      if (droppedItems.length > 0) {
        context.logger.debug(`收集 ${droppedItems.length} 个掉落物`);

        for (const item of droppedItems) {
          try {
            // 简单的移动到掉落物附近来收集
            const pos = item.position;
            await context.bot.pathfinder.goto(new goals.GoalBlock(pos.x, pos.y, pos.z));
            // 等待拾取
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            // 忽略收集失败，继续下一个
            continue;
          }
        }
      }
    } catch (error) {
      context.logger.debug('收集掉落物时出错:', error);
      // 不让收集失败影响主要功能
    }
  }

  /**
   * 检查是否为流体方块
   */
  private isFluidBlock(block: any): boolean {
    const fluidTypes = ['water', 'lava', 'flowing_water', 'flowing_lava'];
    return fluidTypes.includes(block.name);
  }

  /**
   * 检查是否为不可破坏方块
   */
  private isUnbreakableBlock(block: any): boolean {
    const unbreakableTypes = ['bedrock', 'end_portal', 'end_portal_frame', 'command_block', 'barrier'];
    return unbreakableTypes.includes(block.name);
  }

  /**
   * 检查是否为掉落方块
   */
  private isFallingBlock(block: any): boolean {
    const fallingTypes = ['sand', 'gravel', 'anvil', 'white_concrete_powder'];
    return fallingTypes.some(type => block.name.includes(type));
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      x: {
        type: 'number',
        description: '目标X坐标',
        required: true,
      },
      y: {
        type: 'number',
        description: '目标Y坐标',
        required: true,
      },
      z: {
        type: 'number',
        description: '目标Z坐标',
        required: true,
      },
      count: {
        type: 'number',
        description: '挖掘数量，默认为1',
        optional: true,
        minimum: 1,
        maximum: 64,
        default: 1,
      },
      force: {
        type: 'boolean',
        description: '强制挖掘，绕过安全检查（默认false）',
        optional: true,
        default: false,
      },
      collect: {
        type: 'boolean',
        description: '是否收集掉落物（默认true）',
        optional: true,
        default: true,
      },
    };
  }
}
