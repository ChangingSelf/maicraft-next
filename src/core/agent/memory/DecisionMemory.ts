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
      // 确保目录存在
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify(this.entries, null, 2));
    } catch (error) {
      this.logger.error('保存决策记忆失败:', undefined, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      this.entries = JSON.parse(content);
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
