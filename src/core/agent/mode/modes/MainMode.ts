/**
 * 主模式
 * 正常探索和任务执行
 */

import { Mode } from '../Mode';
import { ModeType } from '../types';
import type { RuntimeContext } from '../../../RuntimeContext';

export class MainMode extends Mode {
  readonly type = ModeType.MAIN;
  readonly name = '主模式';
  readonly description = '正常探索和任务执行';
  readonly priority = 0;
  readonly requiresLLMDecision = true;

  constructor(context: RuntimeContext) {
    super(context);
  }

  async activate(reason: string): Promise<void> {
    await super.activate(reason);
    // 主模式特定的激活逻辑
  }

  async deactivate(reason: string): Promise<void> {
    await super.deactivate(reason);
    // 主模式特定的停用逻辑
  }
}
