/**
 * MineByTypeAction - 按类型挖掘方块
 *
 * 支持附近搜索和方向性挖掘，简化参数设计
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { Vec3 } from 'vec3';
import { goals } from 'mineflayer-pathfinder-mai';

// 定义本地参数类型以避免循环依赖
interface MineByTypeParams {
  blockType: string;
  count?: number;
  radius?: number;
  direction?: string;
  force?: boolean;
  collect?: boolean;
}

export class MineByTypeAction extends BaseAction<MineByTypeParams> {
  readonly id = ActionIds.MINE_BY_TYPE;
  readonly name = 'MineByTypeAction';
  readonly description = '按方块类型搜索并挖掘方块，支持附近搜索和方向性挖掘';

  // 中文方块名称映射
  private readonly BLOCK_NAME_MAPPING: Record<string, string> = {
    // 矿物
    煤矿: 'coal_ore',
    铁矿: 'iron_ore',
    金矿: 'gold_ore',
    钻石矿: 'diamond_ore',
    青金石矿: 'lapis_ore',
    红石矿: 'redstone_ore',
    绿宝石矿: 'emerald_ore',
    铜矿: 'copper_ore',
    深层铁矿: 'deepslate_iron_ore',
    深层钻石矿: 'deepslate_diamond_ore',

    // 原材料
    圆石: 'cobblestone',
    石头: 'stone',
    泥土: 'dirt',
    草地: 'grass_block',
    沙子: 'sand',
    砂砾: 'gravel',
    橡木: 'oak_log',
    云杉木: 'spruce_log',
    白桦木: 'birch_log',
    木板: 'oak_planks',
    黑曜石: 'obsidian',

    // 工具方块
    工作台: 'crafting_table',
    熔炉: 'furnace',
    箱子: 'chest',
    发射器: 'dispenser',
    投掷器: 'dropper',

    // 建筑方块
    玻璃: 'glass',
    砖块: 'bricks',
    羊毛: 'white_wool',
    书架: 'bookshelf',
    楼梯: 'oak_stairs',
    门: 'oak_door',
    栅栏: 'oak_fence',

    // 危险方块
    基岩: 'bedrock',
    岩浆: 'lava',
    水: 'water',
    火: 'fire',
    仙人掌: 'cactus',

    // 流体
    流水: 'flowing_water',
    熔岩流: 'flowing_lava',
  };

  async execute(context: RuntimeContext, params: MineByTypeParams): Promise<ActionResult> {
    const { blockType, count = 1, radius = 32, direction, force = false, collect = true } = params;

    try {
      // 1. 参数验证
      if (!blockType || typeof blockType !== 'string') {
        return this.failure('方块类型名称不能为空');
      }

      // 强制模式警告
      if (force) {
        context.logger.warn('⚠️  使用强制挖掘模式，已绕过安全检查');
      }

      // 2. 方块名称标准化
      const normalizedBlockType = this.normalizeBlockName(blockType);
      context.logger.info(
        `开始挖掘方块类型: ${blockType} -> ${normalizedBlockType}, 数量: ${count}, 半径: ${radius}${direction ? `, 方向: ${direction}` : ''}`,
      );

      // 3. 获取方块类型
      const mcData = context.bot.registry;
      const blockData = mcData.blocksByName[normalizedBlockType];

      if (!blockData) {
        return this.failure(`未知的方块类型: ${normalizedBlockType}`);
      }

      // 4. 执行挖掘
      let minedCount = 0;
      const results: ActionResult[] = [];
      let consecutiveFailures = 0;
      const maxFailures = 5; // 连续失败5次就停止

      for (let i = 0; i < count; i++) {
        // 检查中断
        context.interruptSignal.throwIfInterrupted();

        // 根据是否有方向参数选择挖掘策略
        const result = direction
          ? await this.digWithDirection(context, blockData.id, direction, radius, force, collect)
          : await this.digNearby(context, blockData.id, radius, force, collect);

        results.push(result);

        if (result.success) {
          minedCount++;
          consecutiveFailures = 0;
          context.logger.info(`成功挖掘第 ${i + 1} 个方块`);
        } else {
          consecutiveFailures++;
          context.logger.warn(`第 ${i + 1} 个方块挖掘失败: ${result.message}`);

          // 如果连续失败多次，停止挖掘
          if (consecutiveFailures >= maxFailures) {
            context.logger.warn(`连续失败 ${maxFailures} 次，停止挖掘`);
            break;
          }
        }

        // 短暂延迟
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // 5. 返回结果
      const message = `挖掘完成：成功 ${minedCount}/${count} 个 ${blockType}`;

      if (minedCount > 0) {
        context.logger.info(`挖掘成功: ${message}`);
        return this.success(message, {
          minedCount,
          totalCount: count,
          blockType: normalizedBlockType,
          results: results.map(r => ({ success: r.success, message: r.message })),
        });
      } else {
        context.logger.warn(`挖掘失败: ${results[0]?.message || '未找到指定方块'}`);
        return this.failure(results[0]?.message || `未找到 ${blockType} 方块`);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('挖掘过程中发生错误:', err);
      return this.failure(`挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 挖掘附近方块
   */
  private async digNearby(context: RuntimeContext, blockId: number, radius: number, force: boolean, collect: boolean): Promise<ActionResult> {
    try {
      // 查找最近的方块
      const blocks = context.bot.findBlocks({
        matching: blockId,
        maxDistance: radius,
        count: 1,
      });

      if (blocks.length === 0) {
        return this.failure(`在半径 ${radius} 内未找到目标方块`);
      }

      const targetBlock = context.bot.blockAt(blocks[0]);
      if (!targetBlock) {
        return this.failure('目标方块不存在');
      }

      return await this.digSingleBlock(context, targetBlock, force, collect);
    } catch (error) {
      const err = error as Error;
      return this.failure(`查找方块失败: ${err.message}`, err);
    }
  }

  /**
   * 按方向挖掘
   */
  private async digWithDirection(
    context: RuntimeContext,
    blockId: number,
    direction: string,
    radius: number,
    force: boolean,
    collect: boolean,
  ): Promise<ActionResult> {
    try {
      // 计算方向向量
      const directionVector = this.getDirectionVector(direction);
      if (!directionVector) {
        return this.failure(`无效的方向: ${direction}`);
      }

      const playerPos = context.bot.entity.position;
      const searchPositions: Vec3[] = [];

      // 在指定方向上搜索方块
      for (let distance = 1; distance <= radius; distance++) {
        const searchPos = playerPos.plus(directionVector.scaled(distance));
        searchPositions.push(searchPos);
      }

      // 查找方向上的第一个目标方块
      for (const pos of searchPositions) {
        const block = context.bot.blockAt(pos);
        if (block && block.type === blockId) {
          return await this.digSingleBlock(context, block, force, collect);
        }
      }

      return this.failure(`在 ${direction} 方向的半径 ${radius} 内未找到目标方块`);
    } catch (error) {
      const err = error as Error;
      return this.failure(`方向挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 挖掘单个方块
   */
  private async digSingleBlock(context: RuntimeContext, block: any, force: boolean, collect: boolean): Promise<ActionResult> {
    try {
      // 安全检查
      if (!force) {
        const safetyCheck = await this.performSafetyCheck(context, block, block.position);
        if (!safetyCheck.safe) {
          const message = `${safetyCheck.reason}。${safetyCheck.suggestion || ''}`;
          return this.failure(message);
        }
      }

      // 工具检查和装备
      if (!force) {
        const tool = context.bot.pathfinder.bestHarvestTool(block);
        if (tool) {
          await context.bot.equip(tool, 'hand');
        } else if (block.hardness > 0) {
          return this.failure(`需要合适工具挖掘: ${block.name}`);
        }
      }

      // 执行挖掘
      await context.bot.dig(block);

      // 收集掉落物
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
   * 收集附近的掉落物
   */
  private async collectDrops(context: RuntimeContext): Promise<void> {
    try {
      const droppedItems = Object.values(context.bot.entities).filter(
        entity => entity.name === 'item' && entity.position.distanceTo(context.bot.entity.position) <= 5,
      );

      if (droppedItems.length > 0) {
        for (const item of droppedItems) {
          try {
            const pos = item.position;
            await context.bot.pathfinder.goto(new goals.GoalBlock(pos.x, pos.y, pos.z));
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            // 忽略收集失败
            continue;
          }
        }
      }
    } catch (error) {
      context.logger.debug('收集掉落物时出错:', error);
    }
  }

  /**
   * 获取方向向量
   */
  private getDirectionVector(direction: string): Vec3 | null {
    const vectors: Record<string, Vec3> = {
      '+x': new Vec3(1, 0, 0),
      '-x': new Vec3(-1, 0, 0),
      '+y': new Vec3(0, 1, 0),
      '-y': new Vec3(0, -1, 0),
      '+z': new Vec3(0, 0, 1),
      '-z': new Vec3(0, 0, -1),
    };
    return vectors[direction] || null;
  }

  /**
   * 方块名称标准化
   */
  private normalizeBlockName(name: string): string {
    const normalizedName = name.toLowerCase().trim();
    return this.BLOCK_NAME_MAPPING[normalizedName] || normalizedName;
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
      blockType: {
        type: 'string',
        description: '方块类型名称（支持中文和英文，如：钻石矿、diamond_ore）',
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
      radius: {
        type: 'number',
        description: '搜索半径，默认为32',
        optional: true,
        minimum: 1,
        maximum: 128,
        default: 32,
      },
      direction: {
        type: 'string',
        description: '挖掘方向（可选，支持：+x, -x, +y, -y, +z, -z）',
        optional: true,
        enum: ['+x', '-x', '+y', '-y', '+z', '-z'],
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
