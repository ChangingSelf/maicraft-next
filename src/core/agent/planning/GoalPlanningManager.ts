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
import { TrackerFactory } from './trackers/TrackerFactory';
import type { LLMManager } from '@/llm/LLMManager';
import { StructuredOutputManager } from '../structured/StructuredOutputManager';
import { promptManager } from '../prompt';

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

  private llmManager: LLMManager | null = null;
  private structuredOutputManager: StructuredOutputManager | null = null;

  constructor(context: GameContext) {
    this.context = context;
    this.logger = getLogger('GoalPlanningManager');
    this.taskHistory = new TaskHistory();
  }

  /**
   * 设置 LLM Manager（用于生成计划）
   */
  setLLMManager(llmManager: LLMManager): void {
    this.llmManager = llmManager;
    this.structuredOutputManager = new StructuredOutputManager(llmManager, {
      useStructuredOutput: false, // 暂时使用手动解析
    });
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
   * 为当前目标生成计划（使用 LLM）
   */
  async generatePlanForCurrentGoal(): Promise<Plan | null> {
    const goal = this.getCurrentGoal();
    if (!goal) {
      this.logger.warn('没有当前目标，无法生成计划');
      return null;
    }

    if (!this.llmManager || !this.structuredOutputManager) {
      this.logger.warn('LLM Manager 未设置，无法生成计划');
      return null;
    }

    try {
      this.logger.info(`🎯 开始为目标生成计划: ${goal.description}`);

      // 收集环境信息
      const { gameState } = this.context;
      const position = gameState.blockPosition;
      const health = gameState.health;
      const food = gameState.food;
      const inventory = gameState.getInventoryDescription?.() || '空';

      // 获取周边环境信息
      const nearbyBlocks =
        gameState.nearbyBlocks
          ?.slice(0, 10)
          .map((b: any) => `${b.name} (${b.distance}m)`)
          .join(', ') || '无数据';
      const nearbyEntities =
        gameState.nearbyEntities
          ?.slice(0, 5)
          .map((e: any) => `${e.name} (${e.distance}m)`)
          .join(', ') || '无实体';

      // 获取相关经验
      const experiences = this.context.gameState.context?.memory?.experience?.query(goal.description, 5) || [];
      const experiencesText =
        experiences.length > 0
          ? experiences.map((e: any) => `- ${e.content} (置信度: ${(e.confidence * 100).toFixed(0)}%)`).join('\n')
          : '暂无相关经验';

      // 生成提示词
      const prompt = promptManager.generatePrompt('plan_generation', {
        goal: goal.description,
        position: `(${position.x}, ${position.y}, ${position.z})`,
        health: health.toString(),
        food: food.toString(),
        inventory,
        environment: `附近方块: ${nearbyBlocks}\n附近实体: ${nearbyEntities}`,
        experiences: experiencesText,
      });

      // 请求 LLM 生成计划
      const planResponse = await this.structuredOutputManager.requestPlanGeneration(prompt);

      if (!planResponse) {
        this.logger.error('LLM 未能生成有效的计划');
        return null;
      }

      this.logger.info(`📋 LLM 生成计划: ${planResponse.title} (${planResponse.tasks.length} 个任务)`);

      // 创建任务列表
      const tasks: Task[] = [];
      for (const taskDef of planResponse.tasks) {
        try {
          // 从 JSON 创建追踪器
          const tracker = TrackerFactory.fromJSON(taskDef.tracker);

          // 创建任务
          const task = new Task({
            title: taskDef.title,
            description: taskDef.description,
            tracker,
            dependencies: taskDef.dependencies || [],
          });

          tasks.push(task);
          this.logger.debug(`✅ 创建任务: ${task.title}`);
        } catch (error) {
          this.logger.error(`❌ 创建任务失败: ${taskDef.title}`, {}, error as Error);
        }
      }

      if (tasks.length === 0) {
        this.logger.error('没有成功创建任何任务');
        return null;
      }

      // 创建计划
      const plan = this.createPlan({
        title: planResponse.title,
        description: planResponse.description,
        goalId: goal.id,
        tasks,
      });

      // 自动设置为当前计划
      this.setCurrentPlan(plan.id);

      this.logger.info(`✅ 成功生成并激活计划: ${plan.title}`);
      return plan;
    } catch (error) {
      this.logger.error('生成计划失败:', {}, error as Error);
      return null;
    }
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
