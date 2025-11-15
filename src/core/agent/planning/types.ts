/**
 * Goal-Planning 系统的类型定义
 */

import type { GameContext } from '@/core/agent/types';

/**
 * 任务进度
 */
export interface TaskProgress {
  current: number;
  target: number;
  percentage: number;
  description: string;
}

/**
 * 任务追踪器接口
 * 用于自动检测任务是否完成
 */
export interface TaskTracker {
  /**
   * 追踪器类型
   */
  readonly type: string;

  /**
   * 检查任务是否完成
   */
  checkCompletion(context: GameContext): boolean;

  /**
   * 获取当前进度
   */
  getProgress(context: GameContext): TaskProgress;

  /**
   * 生成描述（用于显示）
   */
  getDescription(): string;

  /**
   * 序列化（用于保存）
   */
  toJSON(): any;
}

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed';

/**
 * 计划状态
 */
export type PlanStatus = 'active' | 'completed' | 'abandoned';

/**
 * 目标状态
 */
export type GoalStatus = 'active' | 'completed' | 'abandoned';
