/**
 * Mode 系统的类型定义
 */

import type { AgentState } from '../types';

/**
 * 模式类型（使用枚举，避免字符串错误）
 */
export enum ModeType {
  MAIN = 'main',
  COMBAT = 'combat',
  CHEST_GUI = 'chest_gui',
  FURNACE_GUI = 'furnace_gui',
  CRAFTING = 'crafting',
}

/**
 * 模式转换规则
 */
export interface ModeTransitionRule {
  from: ModeType;
  to: ModeType;
  condition: (state: AgentState) => boolean | Promise<boolean>;
  priority: number;
  description: string;
}
