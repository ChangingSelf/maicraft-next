/**
 * PlaceBlockAction - 放置方块
 *
 * 使用 PlaceBlockUtils 统一的放置功能
 */

import { BaseAction } from '../Action';
import { RuntimeContext } from '../../context/RuntimeContext';
import { ActionResult, PlaceBlockParams } from '../types';
import { ActionIds } from '../ActionIds';
import { PlaceBlockUtils } from '../../../utils/PlaceBlockUtils';

export class PlaceBlockAction extends BaseAction<PlaceBlockParams> {
  readonly id = ActionIds.PLACE_BLOCK;
  readonly name = 'PlaceBlockAction';
  readonly description = '在指定位置放置方块';

  async execute(context: RuntimeContext, params: PlaceBlockParams): Promise<ActionResult> {
    const { block, x, y, z } = params;

    try {
      // 验证参数
      if (!block) {
        return this.failure('方块名称不能为空');
      }

      if (x === undefined || y === undefined || z === undefined) {
        return this.failure('坐标参数不完整');
      }

      context.logger.info(`放置方块: ${block} at (${x}, ${y}, ${z})`);

      // 使用 PlaceBlockUtils 放置方块
      const result = await PlaceBlockUtils.placeBlock(context.bot, {
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z),
        block,
        useRelativeCoords: false
      });

      if (result.success) {
        context.logger.info(result.message);
        return this.success(result.message, {
          blockType: result.block,
          position: result.position,
          referenceBlock: result.referenceBlock,
          face: result.face
        });
      } else {
        context.logger.warn(result.message);
        return this.failure(result.message, undefined);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('放置方块失败:', err);
      return this.failure(`放置方块失败: ${err.message}`, err);
    }
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      block: {
        type: 'string',
        description: '方块名称（如 cobblestone, dirt, planks）',
      },
      x: {
        type: 'number',
        description: 'X 坐标',
      },
      y: {
        type: 'number',
        description: 'Y 坐标（高度）',
      },
      z: {
        type: 'number',
        description: 'Z 坐标',
      },
    };
  }
}
