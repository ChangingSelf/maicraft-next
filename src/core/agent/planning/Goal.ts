/**
 * 目标
 * 长期、高层次的愿望
 */

import type { GoalStatus } from './types';

export class Goal {
  readonly id: string;
  description: string;

  // 状态
  status: GoalStatus;

  // 时间
  readonly createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // 关联的计划
  planIds: string[];

  // 元数据
  metadata: Record<string, any>;

  constructor(description: string) {
    this.id = this.generateId();
    this.description = description;
    this.status = 'active';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.planIds = [];
    this.metadata = {};
  }

  /**
   * 添加计划
   */
  addPlan(planId: string): void {
    if (!this.planIds.includes(planId)) {
      this.planIds.push(planId);
      this.updatedAt = Date.now();
    }
  }

  /**
   * 完成目标
   */
  complete(): void {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 放弃目标
   */
  abandon(): void {
    this.status = 'abandoned';
    this.updatedAt = Date.now();
  }

  private generateId(): string {
    return `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      planIds: this.planIds,
      metadata: this.metadata,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Goal {
    const goal = new Goal(json.description);

    // 手动赋值其他属性
    (goal as any).id = json.id;
    goal.status = json.status;
    (goal as any).createdAt = json.createdAt;
    goal.updatedAt = json.updatedAt;
    goal.completedAt = json.completedAt;
    goal.planIds = json.planIds;
    goal.metadata = json.metadata;

    return goal;
  }
}
