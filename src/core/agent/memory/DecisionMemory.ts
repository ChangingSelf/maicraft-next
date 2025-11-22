/**
 * 决策记忆存储
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryStore, DecisionEntry, QueryOptions, CleanupStrategy, MemoryStats } from './types';
import { getLogger, type Logger } from '@/utils/Logger';

export class DecisionMemory implements MemoryStore<DecisionEntry> {
  private entries: DecisionEntry[] = [];
  private maxEntries = 200;
  private dataFile = 'data/memory/decisions.json';
  private logger: Logger = getLogger('DecisionMemory');

  async initialize(): Promise<void> {
    await this.load();
  }

  add(entry: DecisionEntry): void {
    this.entries.push(entry);
    this.logger.debug(`📝 DecisionMemory添加条目: ${entry.intention}, 结果: ${entry.result}, 当前条目数: ${this.entries.length}`);
    this.cleanup({ maxEntries: this.maxEntries });
  }

  query(options: QueryOptions): DecisionEntry[] {
    let results = [...this.entries];

    // 时间范围过滤
    if (options.timeRange) {
      const [start, end] = options.timeRange;
      results = results.filter(e => e.timestamp >= start && e.timestamp <= end);
    }

    // 自定义过滤
    if (options.filter) {
      results = results.filter(options.filter);
    }

    // 限制数量
    if (options.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  getRecent(count: number): DecisionEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * 获取成功的决策（用于学习）
   */
  getSuccessfulDecisions(limit: number = 20): DecisionEntry[] {
    return this.entries.filter(e => e.result === 'success').slice(-limit);
  }

  /**
   * 获取失败的决策（用于避免重复错误）
   */
  getFailedDecisions(limit: number = 20): DecisionEntry[] {
    return this.entries.filter(e => e.result === 'failed').slice(-limit);
  }

  /**
   * 分析决策成功率
   */
  analyzeSuccessRate(timeRange?: [number, number]): {
    total: number;
    successful: number;
    failed: number;
    interrupted: number;
    successRate: number;
  } {
    let decisions = this.entries;

    if (timeRange) {
      const [start, end] = timeRange;
      decisions = decisions.filter(d => d.timestamp >= start && d.timestamp <= end);
    }

    const total = decisions.length;
    const successful = decisions.filter(d => d.result === 'success').length;
    const failed = decisions.filter(d => d.result === 'failed').length;
    const interrupted = decisions.filter(d => d.result === 'interrupted').length;

    return {
      total,
      successful,
      failed,
      interrupted,
      successRate: total > 0 ? successful / total : 0,
    };
  }

  update(id: string, updates: Partial<DecisionEntry>): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries[index] = { ...this.entries[index], ...updates };
    this.logger.debug(`更新决策记忆: ${id}`);
    return true;
  }

  delete(id: string): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries.splice(index, 1);
    this.logger.debug(`删除决策记忆: ${id}`);
    return true;
  }

  findById(id: string): DecisionEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  cleanup(strategy: CleanupStrategy): void {
    // 按最大条目数清理
    if (strategy.maxEntries && this.entries.length > strategy.maxEntries) {
      this.entries = this.entries.slice(-strategy.maxEntries);
    }

    // 按时间清理
    if (strategy.maxAge) {
      const cutoffTime = Date.now() - strategy.maxAge;
      this.entries = this.entries.filter(e => e.timestamp > cutoffTime);
    }
  }

  async save(): Promise<void> {
    try {
      this.logger.info(`💾 DecisionMemory保存 ${this.entries.length} 条决策记录到 ${this.dataFile}`);
      // 确保目录存在
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify(this.entries, null, 2));
      this.logger.info(`✅ DecisionMemory保存完成`);
    } catch (error) {
      this.logger.error('保存决策记忆失败:', undefined, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 将旧格式的action转换为新格式
   */
  private convertOldActionFormat(oldAction: any): any {
    if (!oldAction) return null;

    // 如果已经是新格式（有actionType字段），直接返回
    if (oldAction.actionType) {
      return oldAction;
    }

    // 旧格式转换：提取actionType和清理params
    let actionType = '';
    let params = {};

    if (oldAction.action) {
      // 格式1: { action: "craft", intention: "...", params: {...} }
      actionType = oldAction.action;
      params = this.cleanOldParams(oldAction.params || {});
    } else if (oldAction.action_type) {
      // 格式2: { action_type: "craft", ...其他参数 }
      actionType = oldAction.action_type;
      params = this.cleanOldParams(oldAction);
    }

    return {
      actionType,
      params,
    };
  }

  /**
   * 清理旧格式的参数，移除元数据字段
   */
  private cleanOldParams(params: any): any {
    const cleaned = { ...params };
    delete cleaned.intention;
    delete cleaned.action_type;
    delete cleaned.action;
    return cleaned;
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      const rawEntries = JSON.parse(content);

      // 向后兼容：将旧格式转换为新的action对象
      this.entries = rawEntries.map((entry: any) => {
        if (entry.actions && Array.isArray(entry.actions) && entry.actions.length > 0) {
          // 旧格式：actions数组转换为action对象
          const firstAction = entry.actions[0];
          return {
            ...entry,
            action: this.convertOldActionFormat(firstAction),
            // 保留actions字段以防需要回滚
            actions: entry.actions,
          };
        } else if (entry.action) {
          // 检查是否是旧的action格式
          if ((entry.action as any).action || (entry.action as any).intention || (entry.action as any).action_type) {
            return {
              ...entry,
              action: this.convertOldActionFormat(entry.action),
            };
          } else {
            // 新格式：直接使用
            return entry;
          }
        } else {
          // 无动作数据的情况
          return {
            ...entry,
            action: null,
          };
        }
      });
    } catch (error) {
      // 文件不存在或读取失败，使用空数组
      this.entries = [];
    }
  }

  getStats(): MemoryStats {
    return {
      totalEntries: this.entries.length,
      oldestTimestamp: this.entries[0]?.timestamp || 0,
      newestTimestamp: this.entries[this.entries.length - 1]?.timestamp || 0,
      sizeInBytes: JSON.stringify(this.entries).length,
    };
  }
}
