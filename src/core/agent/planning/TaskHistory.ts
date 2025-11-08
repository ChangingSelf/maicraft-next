/**
 * 任务历史记录存储
 * 类似记忆系统，持久化任务执行历史和统计信息
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, type Logger } from '@/utils/Logger';

/**
 * 任务历史条目
 */
export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  planId: string;
  goalId: string;
  startTime: number;
  endTime?: number;
  duration?: number; // 毫秒
  status: 'completed' | 'failed' | 'abandoned';
  progressSnapshots: TaskProgressSnapshot[];
  context: Record<string, any>; // 执行时的上下文信息
}

/**
 * 任务进度快照
 */
export interface TaskProgressSnapshot {
  timestamp: number;
  current: number;
  target: number;
  percentage: number;
  description: string;
}

/**
 * 任务统计信息
 */
export interface TaskStats {
  totalExecuted: number;
  totalCompleted: number;
  totalFailed: number;
  totalAbandoned: number;
  averageDuration: number; // 已完成任务的平均执行时间
  successRate: number; // 完成率
  commonFailurePatterns: Record<string, number>; // 常见失败模式
}

export class TaskHistory {
  private entries: TaskHistoryEntry[] = [];
  private maxEntries = 200; // 最多保存200条任务历史
  private dataFile = 'data/task-history.json';
  private logger: Logger = getLogger('TaskHistory');

  async initialize(): Promise<void> {
    await this.load();
    this.logger.info(`📊 任务历史初始化完成，共 ${this.entries.length} 条记录`);
  }

  /**
   * 记录任务开始
   */
  recordTaskStart(taskId: string, taskTitle: string, planId: string, goalId: string, context?: Record<string, any>): string {
    const entry: TaskHistoryEntry = {
      id: this.generateId(),
      taskId,
      taskTitle,
      planId,
      goalId,
      startTime: Date.now(),
      status: 'completed', // 临时状态，会在结束时更新
      progressSnapshots: [],
      context: context || {},
    };

    this.entries.push(entry);
    this.cleanup();

    this.logger.debug(`📝 开始记录任务: ${taskTitle}`);
    return entry.id;
  }

  /**
   * 记录任务进度
   */
  recordTaskProgress(historyId: string, progress: { current: number; target: number; percentage: number; description: string }): void {
    const entry = this.entries.find(e => e.id === historyId);
    if (!entry) return;

    const snapshot: TaskProgressSnapshot = {
      timestamp: Date.now(),
      ...progress,
    };

    entry.progressSnapshots.push(snapshot);
  }

  /**
   * 记录任务结束
   */
  recordTaskEnd(historyId: string, status: 'completed' | 'failed' | 'abandoned'): void {
    const entry = this.entries.find(e => e.id === historyId);
    if (!entry) return;

    entry.status = status;
    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;

    this.logger.debug(`✅ 任务完成记录: ${entry.taskTitle} (${status}) - 耗时: ${entry.duration}ms`);
  }

  /**
   * 获取任务执行统计
   */
  getTaskStats(taskTitle?: string): TaskStats {
    const relevantEntries = taskTitle ? this.entries.filter(e => e.taskTitle === taskTitle) : this.entries;

    const totalExecuted = relevantEntries.length;
    const totalCompleted = relevantEntries.filter(e => e.status === 'completed').length;
    const totalFailed = relevantEntries.filter(e => e.status === 'failed').length;
    const totalAbandoned = relevantEntries.filter(e => e.status === 'abandoned').length;

    const completedEntries = relevantEntries.filter(e => e.status === 'completed' && e.duration);
    const averageDuration =
      completedEntries.length > 0 ? completedEntries.reduce((sum, e) => sum + (e.duration || 0), 0) / completedEntries.length : 0;

    const successRate = totalExecuted > 0 ? totalCompleted / totalExecuted : 0;

    // 分析失败模式（简单实现）
    const commonFailurePatterns: Record<string, number> = {};
    relevantEntries
      .filter(e => e.status === 'failed')
      .forEach(entry => {
        const pattern = entry.context.failureReason || '未知失败原因';
        commonFailurePatterns[pattern] = (commonFailurePatterns[pattern] || 0) + 1;
      });

    return {
      totalExecuted,
      totalCompleted,
      totalFailed,
      totalAbandoned,
      averageDuration,
      successRate,
      commonFailurePatterns,
    };
  }

  /**
   * 获取任务的执行历史
   */
  getTaskHistory(taskTitle?: string, limit: number = 10): TaskHistoryEntry[] {
    let results = [...this.entries];

    if (taskTitle) {
      results = results.filter(e => e.taskTitle === taskTitle);
    }

    // 按开始时间倒序排列
    results.sort((a, b) => b.startTime - a.startTime);

    return results.slice(0, limit);
  }

  /**
   * 获取最近的任务执行记录
   */
  getRecentHistory(limit: number = 20): TaskHistoryEntry[] {
    return [...this.entries].sort((a, b) => b.startTime - a.startTime).slice(0, limit);
  }

  /**
   * 保存到文件
   */
  async save(): Promise<void> {
    try {
      // 确保目录存在
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify(this.entries, null, 2));
    } catch (error) {
      this.logger.error('保存任务历史失败:', undefined, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 从文件加载
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      this.entries = JSON.parse(content);
    } catch (error) {
      // 文件不存在或读取失败，使用空数组
      this.entries = [];
    }
  }

  /**
   * 清理旧记录
   */
  private cleanup(): void {
    if (this.entries.length > this.maxEntries) {
      // 保留最新的记录
      this.entries = this.entries.sort((a, b) => b.startTime - a.startTime).slice(0, this.maxEntries);
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `task_history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取存储统计
   */
  getStats(): { totalEntries: number; maxEntries: number } {
    return {
      totalEntries: this.entries.length,
      maxEntries: this.maxEntries,
    };
  }
}
