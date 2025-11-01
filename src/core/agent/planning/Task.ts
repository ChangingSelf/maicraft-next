/**
 * 任务
 * 具体、可执行、可追踪的单元
 */

import type { TaskTracker, TaskProgress, TaskStatus } from './types';
import type { GameContext } from '../types';
import { TrackerFactory } from './trackers/TrackerFactory';

export class Task {
  readonly id: string;
  title: string;
  description: string;

  // 追踪器（核心！）
  tracker: TaskTracker;

  // 状态
  status: TaskStatus;

  // 时间
  readonly createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // 依赖关系
  dependencies: string[]; // 依赖的任务 ID

  // 元数据
  metadata: Record<string, any>;

  constructor(params: { title: string; description: string; tracker: TaskTracker; dependencies?: string[] }) {
    this.id = this.generateId();
    this.title = params.title;
    this.description = params.description;
    this.tracker = params.tracker;
    this.status = 'pending';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.dependencies = params.dependencies || [];
    this.metadata = {};
  }

  /**
   * 检查任务是否完成（自动）
   */
  checkCompletion(context: GameContext): boolean {
    if (this.status === 'completed') {
      return true;
    }

    const completed = this.tracker.checkCompletion(context);

    if (completed && this.status !== 'completed') {
      this.complete();
    }

    return completed;
  }

  /**
   * 获取任务进度（自动）
   */
  getProgress(context: GameContext): TaskProgress {
    return this.tracker.getProgress(context);
  }

  /**
   * 激活任务
   */
  activate(): void {
    this.status = 'active';
    this.updatedAt = Date.now();
  }

  /**
   * 完成任务
   */
  complete(): void {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 失败任务
   */
  fail(): void {
    this.status = 'failed';
    this.updatedAt = Date.now();
  }

  /**
   * 检查是否可以开始
   */
  canStart(completedTaskIds: Set<string>): boolean {
    if (this.status !== 'pending') {
      return false;
    }

    // 检查依赖是否都完成
    return this.dependencies.every(depId => completedTaskIds.has(depId));
  }

  /**
   * 转换为字符串
   */
  toString(context?: GameContext): string {
    const statusIcon = this.getStatusIcon();
    const progress = context ? this.getProgress(context) : null;
    const progressStr = progress ? ` (${progress.percentage.toFixed(0)}%)` : '';

    return `${statusIcon} ${this.title}${progressStr}`;
  }

  private getStatusIcon(): string {
    switch (this.status) {
      case 'pending':
        return '⏳';
      case 'active':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
    }
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      tracker: this.tracker.toJSON(),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      dependencies: this.dependencies,
      metadata: this.metadata,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Task {
    const tracker = TrackerFactory.fromJSON(json.tracker);

    const task = new Task({
      title: json.title,
      description: json.description,
      tracker,
      dependencies: json.dependencies,
    });

    // 手动赋值其他属性（绕过 readonly）
    (task as any).id = json.id;
    task.status = json.status;
    (task as any).createdAt = json.createdAt;
    task.updatedAt = json.updatedAt;
    task.completedAt = json.completedAt;
    task.metadata = json.metadata;

    return task;
  }
}
