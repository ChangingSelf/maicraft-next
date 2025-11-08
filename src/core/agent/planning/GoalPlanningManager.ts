/**
 * Goal-Planning 管理器
 * 统一管理目标、计划和任务
 */

import * as fs from 'fs/promises';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { GameContext } from '../types';
import { Goal } from './Goal';
import { Plan } from './Plan';
import { Task } from './Task';
import { TaskHistory } from './TaskHistory';

export class GoalPlanningManager {
  private goals: Map<string, Goal> = new Map();
  private plans: Map<string, Plan> = new Map();
  private currentGoalId: string | null = null;
  private currentPlanId: string | null = null;
  private currentTaskId: string | null = null;

  private context: GameContext;
  private logger: Logger;
  private dataFile = 'data/goal-planning.json';

  private taskHistory: TaskHistory;
  private activeTaskHistories: Map<string, string> = new Map(); // taskId -> historyId

  private autoCheckInterval: NodeJS.Timeout | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(context: GameContext) {
    this.context = context;
    this.logger = getLogger('GoalPlanningManager');
    this.taskHistory = new TaskHistory();
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    this.logger.info('🎯 初始化 Goal-Planning 系统...');

    await this.load();
    await this.taskHistory.initialize();

    // 启动自动检查循环
    this.startAutoCheckLoop();

    // 启动自动保存循环（类似记忆系统，每30秒保存一次）
    this.startAutoSaveLoop();

    this.logger.info('✅ Goal-Planning 系统初始化完成');
  }

  /**
   * 停止
   */
  stop(): void {
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval);
      this.autoCheckInterval = null;
    }

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // 停止时保存所有数据
    this.save().catch(error => {
      this.logger.error('停止时保存规划数据失败:', {}, error as Error);
    });

    this.taskHistory.save().catch(error => {
      this.logger.error('停止时保存任务历史失败:', {}, error as Error);
    });
  }

  /**
   * 设置当前目标
   */
  setCurrentGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    this.currentGoalId = goalId;
    this.save();
    return true;
  }

  /**
   * 获取当前目标
   */
  getCurrentGoal(): Goal | null {
    return this.currentGoalId ? this.goals.get(this.currentGoalId) || null : null;
  }

  /**
   * 创建目标
   */
  createGoal(description: string): Goal {
    const goal = new Goal(description);
    this.goals.set(goal.id, goal);

    if (!this.currentGoalId) {
      this.currentGoalId = goal.id;
    }

    this.logger.info(`📝 创建目标: ${description}`);
    this.save();
    return goal;
  }

  /**
   * 创建计划
   */
  createPlan(params: { title: string; description: string; goalId: string; tasks: Task[] }): Plan {
    const plan = new Plan(params);
    this.plans.set(plan.id, plan);

    // 添加到目标
    const goal = this.goals.get(params.goalId);
    if (goal) {
      goal.addPlan(plan.id);
    }

    this.logger.info(`📋 创建计划: ${params.title} (${params.tasks.length} 个任务)`);
    this.save();
    return plan;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): Plan | null {
    return this.currentPlanId ? this.plans.get(this.currentPlanId) || null : null;
  }

  /**
   * 设置当前计划
   */
  setCurrentPlan(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    this.currentPlanId = planId;
    this.logger.info(`🎯 切换到计划: ${plan.title}`);
    this.save();
    return true;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): Task | null {
    const plan = this.getCurrentPlan();
    if (!plan) return null;

    if (this.currentTaskId) {
      const task = plan.tasks.find(t => t.id === this.currentTaskId);
      if (task && task.status !== 'completed') {
        return task;
      }
    }

    // 查找下一个可执行的任务
    const nextTask = plan.getNextTask(this.context);
    if (nextTask) {
      this.currentTaskId = nextTask.id;
      nextTask.activate();

      // 开始记录任务历史
      this.startTaskHistory(nextTask);

      this.logger.info(`🔄 开始新任务: ${nextTask.title}`);
      this.save();
    }

    return nextTask;
  }

  /**
   * 自动检查任务完成
   * 在后台循环中运行
   */
  private async autoCheckCompletion(): Promise<void> {
    const plan = this.getCurrentPlan();
    if (!plan) return;

    // 检查所有任务的完成状态
    for (const task of plan.tasks) {
      if (task.status !== 'completed') {
        task.checkCompletion(this.context);
      }
    }

    // 检查当前任务是否完成
    const currentTask = plan.tasks.find(t => t.id === this.currentTaskId);
    if (currentTask && currentTask.status === 'completed') {
      this.logger.info(`✅ 任务完成: ${currentTask.title}`);

      // 结束任务历史记录
      this.endTaskHistory(currentTask.id, 'completed');

      // 查找下一个任务
      const nextTask = plan.getNextTask(this.context);
      if (nextTask) {
        this.currentTaskId = nextTask.id;
        nextTask.activate();

        // 开始记录任务历史
        this.startTaskHistory(nextTask);

        this.logger.info(`🔄 开始新任务: ${nextTask.title}`);
      } else if (plan.isCompleted(this.context)) {
        // 没有更多任务，检查计划是否完成
        plan.complete();
        this.logger.info(`✅ 计划完成: ${plan.title}`);

        // 检查目标是否完成
        this.checkGoalCompletion();
      }

      this.save();
    }
  }

  /**
   * 检查目标是否完成
   */
  private checkGoalCompletion(): void {
    const goal = this.getCurrentGoal();
    if (!goal) return;

    // 检查所有计划是否都完成
    const allPlansCompleted = goal.planIds.every(planId => {
      const plan = this.plans.get(planId);
      return plan && plan.status === 'completed';
    });

    if (allPlansCompleted && goal.planIds.length > 0) {
      goal.complete();
      this.logger.info(`🎯 目标完成: ${goal.description}`);

      // 清空当前目标和计划
      this.currentGoalId = null;
      this.currentPlanId = null;
      this.currentTaskId = null;

      this.save();
    }
  }

  /**
   * 启动自动检查循环
   */
  private startAutoCheckLoop(): void {
    this.autoCheckInterval = setInterval(() => {
      this.autoCheckCompletion().catch(error => {
        this.logger.error('自动检查任务完成失败:', {}, error as Error);
      });

      // 每秒记录一次任务进度
      this.recordTaskProgress();
    }, 1000); // 每秒检查一次
  }

  /**
   * 启动自动保存循环（类似记忆系统）
   */
  private startAutoSaveLoop(): void {
    this.autoSaveInterval = setInterval(() => {
      Promise.all([this.save(), this.taskHistory.save()]).catch(error => {
        this.logger.error('自动保存规划数据失败:', {}, error as Error);
      });
    }, 30 * 1000); // 每30秒保存一次，类似记忆系统
  }

  /**
   * 生成状态摘要（用于 LLM prompt）
   */
  generateStatusSummary(): string {
    const lines: string[] = [];

    const goal = this.getCurrentGoal();
    if (goal) {
      lines.push(`🎯 当前目标: ${goal.description}`);
      lines.push('');
    }

    const plan = this.getCurrentPlan();
    if (plan) {
      lines.push(plan.toString(this.context));
      lines.push('');
    }

    const currentTask = this.getCurrentTask();
    if (currentTask) {
      const progress = currentTask.getProgress(this.context);
      lines.push(`🔄 当前任务: ${currentTask.title}`);
      lines.push(`   进度: ${progress.description}`);
      lines.push(`   完成条件: ${currentTask.tracker.getDescription()}`);

      // 添加任务历史统计信息
      const taskStats = this.taskHistory.getTaskStats(currentTask.title);
      if (taskStats.totalExecuted > 0) {
        lines.push(`   📊 执行统计: ${taskStats.totalCompleted}/${taskStats.totalExecuted} 成功 (${(taskStats.successRate * 100).toFixed(0)}%)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 开始记录任务历史
   */
  private startTaskHistory(task: Task): void {
    const plan = this.getCurrentPlan();
    const goal = this.getCurrentGoal();

    if (!plan || !goal) return;

    const historyId = this.taskHistory.recordTaskStart(task.id, task.title, plan.id, goal.id, {
      trackerType: task.tracker.type,
      planTitle: plan.title,
      goalDescription: goal.description,
    });

    this.activeTaskHistories.set(task.id, historyId);
  }

  /**
   * 结束任务历史记录
   */
  private endTaskHistory(taskId: string, status: 'completed' | 'failed' | 'abandoned'): void {
    const historyId = this.activeTaskHistories.get(taskId);
    if (historyId) {
      this.taskHistory.recordTaskEnd(historyId, status);
      this.activeTaskHistories.delete(taskId);
    }
  }

  /**
   * 记录任务进度快照
   */
  private recordTaskProgress(): void {
    const currentTask = this.getCurrentTask();
    if (!currentTask) return;

    const historyId = this.activeTaskHistories.get(currentTask.id);
    if (historyId) {
      const progress = currentTask.getProgress(this.context);
      this.taskHistory.recordTaskProgress(historyId, progress);
    }
  }

  /**
   * 获取任务历史统计
   */
  getTaskHistoryStats(taskTitle?: string) {
    return this.taskHistory.getTaskStats(taskTitle);
  }

  /**
   * 获取任务执行历史
   */
  getTaskExecutionHistory(taskTitle?: string, limit: number = 10) {
    return this.taskHistory.getTaskHistory(taskTitle, limit);
  }

  /**
   * 获取最近的任务历史
   */
  getRecentTaskHistory(limit: number = 20) {
    return this.taskHistory.getRecentHistory(limit);
  }

  /**
   * 保存
   */
  private async save(): Promise<void> {
    try {
      const data = {
        currentGoalId: this.currentGoalId,
        currentPlanId: this.currentPlanId,
        currentTaskId: this.currentTaskId,
        goals: Array.from(this.goals.values()).map(g => g.toJSON()),
        plans: Array.from(this.plans.values()).map(p => p.toJSON()),
      };

      await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error('保存 Goal-Planning 数据失败:', {}, error as Error);
    }
  }

  /**
   * 加载
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      const data = JSON.parse(content);

      this.currentGoalId = data.currentGoalId;
      this.currentPlanId = data.currentPlanId;
      this.currentTaskId = data.currentTaskId;

      this.goals.clear();
      for (const goalData of data.goals || []) {
        const goal = Goal.fromJSON(goalData);
        this.goals.set(goal.id, goal);
      }

      this.plans.clear();
      for (const planData of data.plans || []) {
        const plan = Plan.fromJSON(planData);
        this.plans.set(plan.id, plan);
      }

      this.logger.info(`📖 加载 ${this.goals.size} 个目标, ${this.plans.size} 个计划`);
    } catch (error) {
      // 文件不存在或读取失败，使用空数据
      this.goals.clear();
      this.plans.clear();
      this.logger.info('📝 初始化新的 Goal-Planning 数据');
    }
  }
}
