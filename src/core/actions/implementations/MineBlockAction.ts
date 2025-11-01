/**
 * MineBlockAction - 挖掘附近方块
 *
 * 使用正确的 collectBlock 插件 API
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, MineBlockParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class MineBlockAction extends BaseAction<MineBlockParams> {
  readonly id = ActionIds.MINE_BLOCK;
  readonly name = 'MineBlockAction';
  readonly description = '在附近搜索并挖掘指定类型的方块';

  async execute(context: RuntimeContext, params: MineBlockParams): Promise<ActionResult> {
    const { name, count = 1 } = params;

    try {
      // 验证参数
      if (!name) {
        return this.failure('方块名称不能为空');
      }

      context.logger.info(`开始挖掘: ${name}, 数量: ${count}`);

      // 获取方块类型
      const mcData = context.bot.registry;
      const blockType = mcData.blocksByName[name];

      if (!blockType) {
        return this.failure(`未知的方块类型: ${name}`);
      }

      let minedCount = 0;
      const minedBlocks: string[] = [];

      // 循环挖掘指定数量的方块
      for (let i = 0; i < count; i++) {
        // 检查中断
        context.interruptSignal.throwIfInterrupted();

        // 查找最近的方块
        const blocks = context.bot.findBlocks({
          matching: blockType.id,
          maxDistance: 32,
          count: 1,
        });

        if (blocks.length === 0) {
          context.logger.warn(`未找到更多的 ${name}`);
          break;
        }

        const targetBlock = context.bot.blockAt(blocks[0]);
        if (!targetBlock) {
          context.logger.warn('方块不存在');
          continue;
        }

        context.logger.info(
          `挖掘方块 ${i + 1}/${count}: ${name} at (${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z})`,
        );

        try {
          // 使用 collectBlock 插件挖掘，提供正确的选项参数
          await (context.bot as any).collectBlock.collect(targetBlock, {
            ignoreNoPath: false,
            count: 1,
          });

          minedCount++;
          minedBlocks.push(name);

          // 短暂延迟
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          const err = error as Error;
          context.logger.warn(`挖掘失败: ${err.message}`);
          // 继续尝试下一个方块
          continue;
        }
      }

      if (minedCount === 0) {
        return this.failure(`未能挖掘任何 ${name}`);
      }

      context.logger.info(`成功挖掘 ${minedCount} 个 ${name}`);

      return this.success(`成功挖掘 ${minedCount} 个 ${name}`, {
        minedCount,
        minedBlocks,
        blockType: name,
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('挖掘失败:', err);
      return this.failure(`挖掘失败: ${err.message}`, err);
    }
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      name: {
        type: 'string',
        description: '方块名称（如 stone, dirt, iron_ore）',
      },
      count: {
        type: 'number',
        description: '挖掘数量，默认 1',
        optional: true,
      },
    };
  }
}
