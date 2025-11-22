/**
 * OpenFurnaceGUIAction - 打开熔炉GUI模式
 *
 * 这是一个轻量级动作，仅用于触发熔炉GUI模式切换
 * 实际的熔炉操作由熔炉模式内的 ManageContainerAction 处理
 */

import { BaseAction } from '@/core/actions/Action';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult } from '@/core/actions/types';
import { ActionIds } from '@/core/actions/ActionIds';

export class OpenFurnaceGUIAction extends BaseAction<any> {
  readonly id = ActionIds.OPEN_FURNACE_GUI;
  readonly name = 'OpenFurnaceGUIAction';
  readonly description = '打开熔炉GUI模式，进入熔炉交互界面。需要提供熔炉位置坐标，之后由LLM决策具体的放入/取出操作';

  async execute(context: RuntimeContext, params: any): Promise<ActionResult> {
    // 这个动作不执行任何实际操作
    // 它的作用是被 MainMode 检测到，然后切换到熔炉GUI模式
    // 实际的熔炉操作由熔炉模式内的其他动作完成
    
    return this.success('准备进入熔炉GUI模式', {
      position: params.position,
    });
  }

  /**
   * 获取参数 Schema
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
        required: ['x', 'y', 'z'],
      },
    };
  }
}


