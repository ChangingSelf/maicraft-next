/**
 * QueryContainerAction - 查询容器内容
 *
 * 查询指定位置容器的物品内容，不执行任何操作
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, QueryContainerParams } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { MovementUtils, GoalType } from '@/utils/MovementUtils';
import { Vec3 } from 'vec3';

export class QueryContainerAction extends BaseAction<any> {
  readonly id = ActionIds.QUERY_CONTAINER;
  readonly name = 'QueryContainerAction';
  readonly description = '查询指定位置容器的物品内容';

  async execute(context: RuntimeContext, params: QueryContainerParams): Promise<ActionResult> {
    try {
      const { position } = params;

      // 验证参数
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
        return this.failure('请提供有效的容器位置坐标');
      }

      // 查找容器方块
      const containerBlock = await this.findContainer(context, position.x, position.y, position.z);
      if (!containerBlock) {
        return this.failure('未找到容器');
      }

      // 检查当前距离
      const currentDistance = context.bot.entity.position.distanceTo(containerBlock.position);
      context.logger.info(`[QueryContainer] 当前到容器的距离: ${currentDistance.toFixed(2)} 格`);

      // 只有在距离较远时才移动（避免频繁移动）
      if (currentDistance > 4) {
        context.logger.info(`[QueryContainer] 距离较远，开始移动到容器附近...`);
        const moveResult = await context.movementUtils.moveTo(context.bot, {
          type: 'coordinate',
          x: containerBlock.position.x,
          y: containerBlock.position.y,
          z: containerBlock.position.z,
          distance: 4, // 4格以内
          maxDistance: 32,
          useRelativeCoords: false,
          goalType: GoalType.GoalGetToBlock,
        });

        if (!moveResult.success) {
          return this.failure(`无法移动到容器位置: ${moveResult.error}`);
        }
        context.logger.info(`[QueryContainer] 移动完成，当前距离: ${context.bot.entity.position.distanceTo(containerBlock.position).toFixed(2)} 格`);
      }

      // 检查是否能看见容器
      const canSee = context.bot.canSeeBlock(containerBlock);
      context.logger.info(`[QueryContainer] 是否能看见容器: ${canSee}`);

      if (!canSee) {
        // 尝试看向箱子
        context.logger.info(`[QueryContainer] 无法看见容器，尝试调整视角...`);
        await context.bot.lookAt(containerBlock.position.offset(0.5, 0.5, 0.5));
        await new Promise(resolve => setTimeout(resolve, 200)); // 等待视角调整

        const canSeeAfter = context.bot.canSeeBlock(containerBlock);
        context.logger.info(`[QueryContainer] 调整视角后是否能看见: ${canSeeAfter}`);

        if (!canSeeAfter) {
          return this.failure(`无法看见容器，可能被遮挡`);
        }
      }

      // 查询容器内容
      const containerContents = await this.queryContainerContents(context, containerBlock);

      return this.success('容器查询成功', {
        inventory: containerContents,
        position: {
          x: containerBlock.position.x,
          y: containerBlock.position.y,
          z: containerBlock.position.z,
        },
      });
    } catch (error) {
      const err = error as Error;
      context.logger.error('容器查询失败:', err);
      return this.failure(`容器查询失败: ${err.message}`, err);
    }
  }

  /**
   * 查找容器
   */
  private async findContainer(context: RuntimeContext, x: number, y: number, z: number): Promise<any> {
    const mcData = context.bot.registry;
    const chestId = mcData.blocksByName.chest?.id;
    const furnaceId = mcData.blocksByName.furnace?.id;

    if (!chestId && !furnaceId) {
      throw new Error('无法找到容器方块类型');
    }

    // 查找指定坐标的容器
    const pos = new Vec3(x, y, z);
    const block = context.bot.blockAt(pos);

    if (!block) {
      throw new Error(`指定坐标 (${x}, ${y}, ${z}) 处没有方块`);
    }

    const isChest = chestId && block.type === chestId;
    const isFurnace = furnaceId && block.type === furnaceId;

    if (!isChest && !isFurnace) {
      const blockName = mcData.blocks[block.type]?.name || `未知方块(${block.type})`;
      throw new Error(`指定坐标 (${x}, ${y}, ${z}) 处是 ${blockName}，不是容器`);
    }

    return block;
  }

  /**
   * 查询容器内容
   */
  private async queryContainerContents(context: RuntimeContext, containerBlock: any): Promise<any> {
    try {
      context.logger.info(
        `[QueryContainer] 开始打开容器: (${containerBlock.position.x}, ${containerBlock.position.y}, ${containerBlock.position.z})`,
      );

      // 检查是否已经有打开的窗口，如果有则先关闭
      if (context.bot.currentWindow) {
        context.logger.warn(`[QueryContainer] 检测到已打开的窗口，先关闭: ${context.bot.currentWindow.type}`);
        try {
          context.bot.closeWindow(context.bot.currentWindow);
          // 等待窗口关闭事件，最多等待2秒
          await Promise.race([
            new Promise(resolve => {
              const onWindowClose = () => {
                context.bot.removeListener('windowClose', onWindowClose);
                resolve(true);
              };
              context.bot.once('windowClose', onWindowClose);
            }),
            new Promise(resolve => setTimeout(() => resolve(false), 2000)),
          ]);
          context.logger.info(`[QueryContainer] 窗口已关闭`);
        } catch (error) {
          context.logger.warn(`[QueryContainer] 关闭窗口时出错，继续执行: ${error}`);
        }
        // 额外等待，确保服务器端状态同步
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // 确保能看见箱子（再次确认）
      if (!context.bot.canSeeBlock(containerBlock)) {
        context.logger.warn(`[QueryContainer] 无法看见容器，尝试调整视角`);
        await context.bot.lookAt(containerBlock.position.offset(0.5, 0.5, 0.5));
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      context.logger.info(
        `[QueryContainer] 准备打开容器，当前距离: ${context.bot.entity.position.distanceTo(containerBlock.position).toFixed(2)} 格`,
      );

      // 添加 windowOpen 事件监听器用于调试
      const windowOpenListener = () => {
        context.logger.info(`[QueryContainer] ✅ windowOpen 事件已触发`);
      };
      context.bot.once('windowOpen', windowOpenListener);

      // 记录 bot 当前状态
      context.logger.info(
        `[QueryContainer] Bot状态: 健康=${context.bot.health}, 饱食=${context.bot.food}, 位置=(${context.bot.entity.position.x.toFixed(1)}, ${context.bot.entity.position.y.toFixed(1)}, ${context.bot.entity.position.z.toFixed(1)})`,
      );

      // 🔧 强制等待事件循环清空，确保没有阻塞
      await new Promise(resolve => setImmediate(resolve));

      // 🔧 重新获取方块对象，确保它是最新的（避免区块卸载/重载导致的失效）
      const pos = containerBlock.position;
      const freshBlock = context.bot.blockAt(pos);

      if (!freshBlock) {
        throw new Error(`无法重新获取方块 (${pos.x}, ${pos.y}, ${pos.z})，区块可能未加载`);
      }

      context.logger.info(`[QueryContainer] 方块信息: 名称=${freshBlock.name}, 类型=${freshBlock.type}, 位置=(${pos.x}, ${pos.y}, ${pos.z})`);

      // 🔧 判断容器类型，使用对应的打开方法
      const isFurnace = freshBlock.name === 'furnace' || freshBlock.name === 'blast_furnace' || freshBlock.name === 'smoker';

      // 打开容器以获取内容
      context.logger.info(`[QueryContainer] 🔄 调用 bot.${isFurnace ? 'openFurnace' : 'openContainer'}()...`);
      const startTime = Date.now();

      // 设置一个更短的自定义超时，便于调试
      const openPromise = isFurnace ? context.bot.openFurnace(freshBlock) : context.bot.openContainer(freshBlock);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          context.logger.error(`[QueryContainer] ⏰ 自定义超时（5秒），windowOpen监听器=${context.bot.listenerCount('windowOpen')} 个`);
          reject(new Error('自定义超时：5秒内未收到 windowOpen 事件'));
        }, 5000);
      });

      const container = (await Promise.race([openPromise, timeoutPromise])) as any;
      const elapsed = Date.now() - startTime;
      context.logger.info(`[QueryContainer] 容器已打开，类型: ${containerBlock.name}，耗时: ${elapsed}ms`);

      try {
        const containerItems = container.containerItems();
        const contents: { [itemName: string]: number } = {};

        // 将物品列表转换为字典格式
        for (const item of containerItems) {
          const itemName = item.name || `未知物品(${item.type})`;
          contents[itemName] = (contents[itemName] || 0) + item.count;
        }

        context.logger.info(`[QueryContainer] 容器查询成功，包含 ${Object.keys(contents).length} 种物品`);
        return contents;
      } finally {
        // 关闭容器
        container.close();
        context.logger.info(`[QueryContainer] 容器已关闭`);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error(`[QueryContainer] 查询容器内容失败: ${err.message}`);
      throw err;
    }
  }
}
