/**
 * SetLocationAction - 地标管理
 *
 * 设置、删除、更新地标
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, SetLocationParams } from '@/core/actions/types';
import { ActionIds, LocationActionType } from '@/core/actions/ActionIds';
import { Vec3 } from 'vec3';

export class SetLocationAction extends BaseAction<SetLocationParams> {
  readonly id = ActionIds.SET_LOCATION;
  readonly name = 'SetLocationAction';
  readonly description = '地标管理：设置、删除、更新地标';

  async execute(context: RuntimeContext, params: SetLocationParams): Promise<ActionResult> {
    try {
      const { type, name, info = '', position } = params;

      if (!name) {
        return this.failure('请指定地标名称');
      }

      const locationManager = context.locationManager;

      switch (type) {
        case LocationActionType.SET: {
          // 设置地标
          const pos = position || context.bot.entity.position.clone();
          const location = locationManager.setLocation(name, pos, info);

          return this.success(`已设置地标 "${name}"`, {
            name: location.name,
            position: {
              x: location.position.x,
              y: location.position.y,
              z: location.position.z,
            },
            info: location.info,
          });
        }

        case LocationActionType.DELETE: {
          // 删除地标
          const deleted = locationManager.deleteLocation(name);
          if (!deleted) {
            return this.failure(`地标 "${name}" 不存在`);
          }

          return this.success(`已删除地标 "${name}"`);
        }

        case LocationActionType.UPDATE: {
          // 更新地标
          const updated = locationManager.updateLocation(name, info);
          if (!updated) {
            return this.failure(`地标 "${name}" 不存在`);
          }

          const location = locationManager.getLocation(name);
          return this.success(`已更新地标 "${name}"`, {
            name: location!.name,
            position: {
              x: location!.position.x,
              y: location!.position.y,
              z: location!.position.z,
            },
            info: location!.info,
          });
        }

        default:
          return this.failure(`未知的地标操作类型: ${type}`);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('地标操作失败:', err);
      return this.failure(`地标操作失败: ${err.message}`, err);
    }
  }

  /**
   * 获取参数 Schema
   */
  getParamsSchema(): any {
    return {
      type: {
        type: 'string',
        description: '操作类型：set（设置）、delete（删除）、update（更新）',
      },
      name: {
        type: 'string',
        description: '地标名称',
      },
      info: {
        type: 'string',
        description: '地标信息（可选）',
        optional: true,
      },
      position: {
        type: 'object',
        description: '地标位置（可选，默认为当前位置）',
        optional: true,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
        },
      },
    };
  }
}

