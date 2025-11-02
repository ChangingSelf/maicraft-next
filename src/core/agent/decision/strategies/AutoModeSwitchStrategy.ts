/**
 * 自动模式切换策略
 *
 * 检查并执行模式的自动转换
 */

import type { AgentState } from '../../types';
import type { DecisionStrategy } from '../types';
import { StrategyGroup } from '../types';
import { getLogger, type Logger } from '@/utils/Logger';

export class AutoModeSwitchStrategy implements DecisionStrategy {
  readonly name = '自动模式切换';
  private logger: Logger;

  constructor() {
    this.logger = getLogger('AutoModeSwitchStrategy');
  }

  canExecute(state: AgentState): boolean {
    // 总是检查模式切换
    return true;
  }

  async execute(state: AgentState): Promise<void> {
    const autoSwitched = await state.modeManager.checkAutoTransitions();

    if (autoSwitched) {
      this.logger.info('✅ 模式已自动切换');
    }
  }

  getPriority(): number {
    return 100; // 最高优先级，优先检查模式切换
  }

  getGroup(): StrategyGroup {
    return StrategyGroup.MODE_MANAGEMENT;
  }
}
