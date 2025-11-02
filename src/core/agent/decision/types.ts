/**
 * 决策策略系统 - 类型定义
 */

import type { AgentState } from '../types';

/**
 * 策略分组
 * 用于组织和分类策略，提高可读性
 */
export enum StrategyGroup {
  /** 模式管理相关 */
  MODE_MANAGEMENT = 'mode_management',
  /** 生存相关（逃跑、治疗、吃东西） */
  SURVIVAL = 'survival',
  /** 战斗相关 */
  COMBAT = 'combat',
  /** 资源采集相关（挖矿、伐木、种植） */
  RESOURCE = 'resource',
  /** 建筑相关 */
  BUILDING = 'building',
  /** AI决策相关 */
  AI_DECISION = 'ai_decision',
}

/**
 * 决策策略接口
 *
 * 每个策略封装一个特定的决策逻辑
 */
export interface DecisionStrategy {
  /**
   * 策略名称
   */
  readonly name: string;

  /**
   * 检查是否可以执行此策略
   *
   * @param state - Agent状态
   * @returns 是否可以执行
   */
  canExecute(state: AgentState): boolean | Promise<boolean>;

  /**
   * 执行策略
   *
   * @param state - Agent状态
   */
  execute(state: AgentState): Promise<void>;

  /**
   * 获取策略优先级
   *
   * @returns 优先级（数值越大优先级越高）
   */
  getPriority(): number;

  /**
   * 获取策略所属分组（可选）
   *
   * @returns 分组名称
   */
  getGroup?(): StrategyGroup;
}
