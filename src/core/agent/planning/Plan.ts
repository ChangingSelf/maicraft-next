/**
 * 计划
 * 为实现目标而制定的任务序列
 */

import type { PlanStatus } from './types';
import type { GameContext } from '@/core/agent/types';
import { Task } from './Task';

export class Plan {
  readonly id: string;
  title: string;
  description: string;

  // 任务列表（有序）
  tasks: Task[];

  // 状态
  status: PlanStatus;

  // 时间
  readonly createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // 关联的目标
  goalId: string;

  constructor(params: { title: string; description: string; goalId: string; tasks?: Task[] }) {
    this.id = this.generateId();
    this.title = params.title;
    this.description = params.description;
    this.goalId = params.goalId;
    this.tasks = params.tasks || [];
    this.status = 'active';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 添加任务
   */
  addTask(task: Task): void {
    this.tasks.push(task);
    this.updatedAt = Date.now();
  }

  /**
   * 获取下一个可执行的任务
   */
  getNextTask(context: GameContext): Task | null {
    const completedTaskIds = new Set(this.tasks.filter(t => t.status === 'completed').map(t => t.id));

    // 找到第一个可以开始的任务
    return this.tasks.find(t => t.canStart(completedTaskIds)) || null;
  }

  /**
   * 检查计划是否完成
   */
  isCompleted(context: GameContext): boolean {
    return this.tasks.every(t => t.checkCompletion(context));
  }

  /**
   * 获取完成进度
   */
  getProgress(context: GameContext): {
    completed: number;
    total: number;
    percentage: number;
  } {
    const completed = this.tasks.filter(t => t.checkCompletion(context)).length;

    return {
      completed,
      total: this.tasks.length,
      percentage: this.tasks.length > 0 ? (completed / this.tasks.length) * 100 : 0,
    };
  }

  /**
   * 完成计划
   */
  complete(): void {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 放弃计划
   */
  abandon(): void {
    this.status = 'abandoned';
    this.updatedAt = Date.now();
  }

  /**
   * 转换为字符串
   */
  toString(context?: GameContext): string {
    const progress = context ? this.getProgress(context) : null;
    const progressStr = progress ? ` (${progress.completed}/${progress.total})` : '';

    const taskList = this.tasks.map((t, i) => `  ${i + 1}. ${t.toString(context)}`).join('\n');

    return `📋 ${this.title}${progressStr}\n${taskList}`;
  }

  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      goalId: this.goalId,
      tasks: this.tasks.map(t => t.toJSON()),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Plan {
    const tasks = json.tasks.map((t: any) => Task.fromJSON(t));

    const plan = new Plan({
      title: json.title,
      description: json.description,
      goalId: json.goalId,
      tasks,
    });

    // 手动赋值其他属性
    (plan as any).id = json.id;
    plan.status = json.status;
    (plan as any).createdAt = json.createdAt;
    plan.updatedAt = json.updatedAt;
    plan.completedAt = json.completedAt;

    return plan;
  }
}
