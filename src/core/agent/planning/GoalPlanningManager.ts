/**
 * Goal-Planning 管理器
 * 统一管理目标、计划和任务
 */

import * as fs from 'fs/promises';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { GameContext } from '@/core/agent/types';
import type { TaskEvaluationRecord } from '@/core/agent/structured/ActionSchema';
import { Goal } from './Goal';
import { Plan } from './Plan';
import { Task } from './Task';
import { TaskHistory } from './TaskHistory';
import { TrackerFactory } from './trackers/TrackerFactory';
import type { LLMManager } from '@/llm/LLMManager';
import { StructuredOutputManager } from '@/core/agent/structured/StructuredOutputManager';
import { promptManager } from '@/core/agent/prompt';

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

  // 回调函数：在目标完成时调用
  private onGoalCompleted?: (goal: Goal) => void;

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
   * 获取所有目标
   */
  getAllGoals(): Map<string, Goal> {
    return this.goals;
  }

  /**
   * 设置目标完成回调函数
   */
  setOnGoalCompleted(callback: (goal: Goal) => void): void {
    this.onGoalCompleted = callback;
  }

  /**
   * 检查加载的数据状态，处理可能遗漏的完成状态
   */
  private checkLoadedState(): void {
    // 检查当前计划是否已经完成但状态未更新
    const currentPlan = this.getCurrentPlan();
    if (currentPlan && currentPlan.status !== 'completed') {
      // 对于已加载的数据，我们直接检查任务状态而不是重新验证追踪器
      const allTasksCompleted = currentPlan.tasks.every(task => task.status === 'completed');
      if (allTasksCompleted) {
        currentPlan.complete();
        this.logger.info(`✅ 发现已完成的计划: ${currentPlan.title}`);

        // 检查目标是否完成
        this.checkGoalCompletion();
      }
    }

    // 检查当前目标是否已经完成但状态未更新
    const currentGoal = this.getCurrentGoal();
    if (currentGoal && currentGoal.status !== 'completed') {
      this.checkGoalCompletion();
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    this.logger.info('🎯 初始化 Goal-Planning 系统...');

    await this.load();
    await this.taskHistory.initialize();

    // 检查加载的数据状态，处理可能遗漏的完成状态
    this.checkLoadedState();

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

    let hasChanges = false;

    // 1. 实时更新所有任务的完成状态
    for (const task of plan.tasks) {
      if (task.status !== 'completed' && task.checkCompletion(this.context)) {
        this.logger.info(`✅ 任务完成: ${task.title}`);
        hasChanges = true;
      }
    }

    // 2. 检查当前计划是否所有任务都已完成
    if (plan.isCompleted(this.context) && plan.status !== 'completed') {
      plan.complete();
      this.logger.info(`✅ 计划完成: ${plan.title}`);

      // 结束当前任务的历史记录（如果有的话）
      if (this.currentTaskId) {
        this.endTaskHistory(this.currentTaskId, 'completed');
      }

      // 清空当前任务（计划已完成）
      this.currentTaskId = null;

      // 检查目标是否完成
      this.checkGoalCompletion();

      hasChanges = true;
    }

    if (hasChanges) {
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

      // 调用目标完成回调函数（如果设置了）
      if (this.onGoalCompleted) {
        try {
          this.onGoalCompleted(goal);
        } catch (error) {
          this.logger.error('目标完成回调函数执行失败:', {}, error as Error);
        }
      }

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
      if (currentTask.description) {
        lines.push(`   描述: ${currentTask.description}`);
      }
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
   * 处理任务评估结果
   * 根据评估结果采取相应行动
   */
  async handleTaskEvaluation(evaluation: {
    task_status: string;
    progress_assessment: string;
    issues: string[];
    suggestions: string[];
    should_replan: boolean;
    should_skip_task: boolean;
    confidence: number;
  }): Promise<void> {
    const currentTask = this.getCurrentTask();
    if (!currentTask) {
      this.logger.warn('没有当前任务，跳过评估处理');
      return;
    }

    const currentPlan = this.getCurrentPlan();
    if (!currentPlan) {
      this.logger.warn('没有当前计划，跳过评估处理');
      return;
    }

    this.logger.info(`📊 处理任务评估: ${evaluation.task_status}`, {
      progress: evaluation.progress_assessment,
      issues: evaluation.issues.length,
      suggestions: evaluation.suggestions.length,
    });

    // 记录评估结果到任务（供后续分析使用）
    currentTask.addEvaluation({
      status: evaluation.task_status as TaskEvaluationRecord['status'],
      assessment: evaluation.progress_assessment,
      issues: evaluation.issues,
      suggestions: evaluation.suggestions,
      should_replan: evaluation.should_replan,
      should_skip_task: evaluation.should_skip_task,
      confidence: evaluation.confidence,
    });

    // 根据评估结果采取行动
    if (evaluation.should_skip_task) {
      this.logger.warn(`⏭️ 评估建议跳过任务: ${currentTask.title}`);
      await this.skipCurrentTask('评估建议跳过');
      return;
    }

    if (evaluation.should_replan && evaluation.confidence > 0.7) {
      this.logger.warn(`🔄 评估建议重新规划（置信度: ${(evaluation.confidence * 100).toFixed(0)}%）`);
      await this.replanForCurrentGoal(`任务评估发现问题需要重新规划: ${evaluation.issues.join(', ')}`);
      return;
    }

    // 如果任务完全阻塞，标记为失败
    if (evaluation.task_status === 'blocked' && evaluation.confidence > 0.8) {
      this.logger.error(`🚫 任务被评估为完全阻塞: ${currentTask.title}`);
      await this.failCurrentTask('任务阻塞，无法继续');
      return;
    }

    // 如果任务需要调整，记录建议
    if (evaluation.task_status === 'needs_adjustment' && evaluation.suggestions.length > 0) {
      this.logger.info(`💡 任务需要调整，建议: ${evaluation.suggestions.join('; ')}`);
      this.context.gameState.context?.memory?.thinking?.add({
        timestamp: Date.now(),
        content: `任务需要调整，建议: ${evaluation.suggestions.join('; ')}`,
        confidence: evaluation.confidence,
      });
    }

    // 如果任务进展顺利，记录鼓励信息
    if (evaluation.task_status === 'on_track') {
      this.logger.info(`✅ 任务进展顺利: ${evaluation.progress_assessment}`);
      this.context.gameState.context?.memory?.thinking?.add({
        timestamp: Date.now(),
        content: `任务进展顺利，评估: ${evaluation.progress_assessment}`,
        confidence: evaluation.confidence,
      });
    }
  }

  /**
   * 跳过当前任务
   */
  async skipCurrentTask(reason: string): Promise<void> {
    const currentTask = this.getCurrentTask();
    if (!currentTask) return;

    this.logger.info(`⏭️ 跳过任务: ${currentTask.title} (原因: ${reason})`);

    // 结束任务历史记录
    this.endTaskHistory(currentTask.id, 'abandoned');

    // 标记任务为失败（跳过）
    currentTask.fail();

    // 清空当前任务ID，让系统获取下一个任务
    this.currentTaskId = null;

    this.save();
  }

  /**
   * 标记当前任务为失败
   */
  async failCurrentTask(reason: string): Promise<void> {
    const currentTask = this.getCurrentTask();
    if (!currentTask) return;

    this.logger.error(`❌ 任务失败: ${currentTask.title} (原因: ${reason})`);

    // 结束任务历史记录
    this.endTaskHistory(currentTask.id, 'failed');

    // 标记任务为失败
    currentTask.fail();

    // 清空当前任务ID，让系统获取下一个任务
    this.currentTaskId = null;

    this.save();
  }

  /**
   * 为当前目标重新生成计划
   */
  async replanForCurrentGoal(reason: string): Promise<Plan | null> {
    const goal = this.getCurrentGoal();
    if (!goal) {
      this.logger.warn('没有当前目标，无法重新规划');
      return null;
    }

    this.logger.info(`🔄 重新规划: ${reason}`);

    // 记录当前计划失败
    const currentPlan = this.getCurrentPlan();
    if (currentPlan) {
      this.logger.info(`📋 标记旧计划为失败: ${currentPlan.title}`);
      // 不标记为完成，保留失败状态供以后分析
    }

    // 结束当前任务的历史记录
    if (this.currentTaskId) {
      this.endTaskHistory(this.currentTaskId, 'abandoned');
    }

    // 清空当前计划和任务
    this.currentPlanId = null;
    this.currentTaskId = null;

    // 生成新计划
    const newPlan = await this.generatePlanForCurrentGoal();

    if (newPlan) {
      this.logger.info(`✅ 成功生成新计划: ${newPlan.title}`);
      this.setCurrentPlan(newPlan.id);
    } else {
      this.logger.error('❌ 重新规划失败');
    }

    return newPlan;
  }

  /**
   * 收集该目标的历史计划信息（包括失败原因）
   * 用于生成新计划时避免重复错误
   */
  private collectPlanHistory(goal: Goal): string {
    if (goal.planIds.length === 0) {
      return '这是首次为该目标生成计划。';
    }

    const historyLines: string[] = [];
    let attemptCount = 0;

    for (const planId of goal.planIds) {
      const plan = this.plans.get(planId);
      if (!plan) continue;

      attemptCount++;

      // 只关注非当前计划（历史计划）
      if (planId === this.currentPlanId) continue;

      const status = plan.status === 'completed' ? '✅ 成功' : '❌ 失败';
      historyLines.push(`\n计划 ${attemptCount}: ${plan.title} (${status})`);
      historyLines.push(`  描述: ${plan.description}`);

      // 收集任务的失败信息
      const failedTasks: string[] = [];
      const blockedTasks: string[] = [];

      for (const task of plan.tasks) {
        // 检查任务评估中的问题和决策
        const lastEvaluation = task.getLastEvaluation();

        if (lastEvaluation) {
          // 分析评估状态和决策结果
          if (lastEvaluation.status === 'blocked') {
            blockedTasks.push(`    - 任务"${task.title}"被评估为完全阻塞`);
            if (lastEvaluation.issues && lastEvaluation.issues.length > 0) {
              blockedTasks.push(`      问题: ${lastEvaluation.issues.join('; ')}`);
            }
            if (lastEvaluation.should_replan) {
              blockedTasks.push(`      评估决策: 需要重新规划 (置信度: ${(lastEvaluation.confidence * 100).toFixed(0)}%)`);
            }
          } else if (lastEvaluation.status === 'needs_adjustment' || lastEvaluation.status === 'struggling') {
            failedTasks.push(`    - 任务"${task.title}"需要调整`);
            if (lastEvaluation.issues && lastEvaluation.issues.length > 0) {
              failedTasks.push(`      问题: ${lastEvaluation.issues.join('; ')}`);
            }
            if (lastEvaluation.should_replan) {
              failedTasks.push(`      评估决策: 建议重新规划 (置信度: ${(lastEvaluation.confidence * 100).toFixed(0)}%)`);
            }
            if (lastEvaluation.suggestions && lastEvaluation.suggestions.length > 0) {
              failedTasks.push(`      改进建议: ${lastEvaluation.suggestions.join('; ')}`);
            }
          }

          // 记录评估的决策结果，即使状态不是 blocked 或 needs_adjustment
          if (lastEvaluation.should_skip_task) {
            failedTasks.push(`    - 任务"${task.title}"被评估为应该跳过`);
          }
        }

        // 检查任务状态
        if (
          task.status === 'failed' &&
          !blockedTasks.some(line => line.includes(task.title)) &&
          !failedTasks.some(line => line.includes(task.title))
        ) {
          failedTasks.push(`    - 任务"${task.title}"失败`);
        }
      }

      if (blockedTasks.length > 0) {
        historyLines.push(`  阻塞的任务:`);
        historyLines.push(...blockedTasks);
      }

      if (failedTasks.length > 0) {
        historyLines.push(`  失败的任务:`);
        historyLines.push(...failedTasks);
      }

      if (blockedTasks.length === 0 && failedTasks.length === 0 && plan.status !== 'completed') {
        historyLines.push(`  状态: 未完成，原因未知`);
      }
    }

    if (historyLines.length === 0) {
      return '这是首次为该目标生成计划。';
    }

    return `已尝试 ${attemptCount} 次规划，历史如下:\n${historyLines.join('\n')}\n\n⚠️ 请分析以上失败原因，生成不同的计划以避免重复错误！`;
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

      // 获取该目标的历史计划（包括失败原因）
      const planHistory = this.collectPlanHistory(goal);

      // 生成提示词
      const prompt = promptManager.generatePrompt('plan_generation', {
        goal: goal.description,
        position: `(${position.x}, ${position.y}, ${position.z})`,
        health: health.toString(),
        food: food.toString(),
        inventory,
        environment: `附近方块: ${nearbyBlocks}\n附近实体: ${nearbyEntities}`,
        experiences: experiencesText,
        plan_history: planHistory,
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
