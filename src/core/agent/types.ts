/**
 * Agent 相关的类型定义
 */

import type { RuntimeContext } from '@/core/context/RuntimeContext';
import type { ModeManager } from './mode/ModeManager';
import type { GoalPlanningManager } from './planning/GoalPlanningManager';
import type { MemoryManager } from './memory/MemoryManager';
import type { InterruptController } from './InterruptController';
import type { AppConfig as Config } from '@/utils/Config';

/**
 * Agent 共享状态
 * 所有子系统都可以访问，但不能直接修改 Agent 内部实现
 */
export interface AgentState {
  // 基础信息
  readonly goal: string;
  isRunning: boolean;

  // 运行时上下文
  readonly context: RuntimeContext;

  // 子系统
  readonly modeManager: ModeManager;
  readonly planningManager: GoalPlanningManager;
  readonly memory: MemoryManager;

  // 中断控制
  readonly interrupt: InterruptController;

  // 配置
  readonly config: Config;
}

/**
 * Agent 状态摘要
 */
export interface AgentStatus {
  isRunning: boolean;
  currentMode: string;
  goal: string;
  currentTask: any; // Task 类型
  interrupted: boolean;
  interruptReason: string;
}

/**
 * 动作调用
 */
export interface ActionCall {
  actionType: string;
  params: Record<string, any>;
}

/**
 * 游戏上下文（用于追踪器和任务系统）
 */
export interface GameContext {
  gameState: any; // GameState 类型
  blockCache: any; // BlockCache 类型
  containerCache: any; // ContainerCache 类型
  locationManager: any; // LocationManager 类型
  logger: any; // Logger 类型
}
