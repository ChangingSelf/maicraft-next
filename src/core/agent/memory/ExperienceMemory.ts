/**
 * 经验记忆存储
 * 用于记录"经验教训"，如：
 * - "挖掘钻石需要铁镐"
 * - "夜晚出门容易遇到怪物"
 * - "熔炉需要燃料才能工作"
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryStore, ExperienceEntry, QueryOptions, CleanupStrategy, MemoryStats } from './types';
import { getLogger, type Logger } from '@/utils/Logger';

export class ExperienceMemory implements MemoryStore<ExperienceEntry> {
  private entries: ExperienceEntry[] = [];
  private maxEntries = 100;
  private logger: Logger = getLogger('ExperienceMemory');
  private dataFile = 'data/memory/experiences.json';

  async initialize(): Promise<void> {
    await this.load();
  }

  add(entry: ExperienceEntry): void {
    // 检查是否已存在相似经验
    const existing = this.entries.find(e => this.calculateSimilarity(e.lesson, entry.lesson) > 0.8);

    if (existing) {
      // 增强现有经验
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
      existing.occurrences++;
      existing.lastOccurrence = entry.timestamp;
    } else {
      this.entries.push(entry);
    }

    this.cleanup({ maxEntries: this.maxEntries });
  }

  query(options: QueryOptions): ExperienceEntry[] {
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

  getRecent(count: number): ExperienceEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * 查询相关经验
   */
  queryRelevant(context: string, limit: number = 5): ExperienceEntry[] {
    return this.entries
      .map(e => ({
        entry: e,
        relevance: this.calculateSimilarity(e.lesson, context),
      }))
      .filter(r => r.relevance > 0.3)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(r => r.entry);
  }

  /**
   * 计算相似度（简单实现）
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }

  update(id: string, updates: Partial<ExperienceEntry>): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries[index] = { ...this.entries[index], ...updates };
    this.logger.debug(`更新经验记忆: ${id}`);
    return true;
  }

  delete(id: string): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries.splice(index, 1);
    this.logger.debug(`删除经验记忆: ${id}`);
    return true;
  }

  findById(id: string): ExperienceEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  cleanup(strategy: CleanupStrategy): void {
    // 按最大条目数清理
    if (strategy.maxEntries && this.entries.length > strategy.maxEntries) {
      // 按置信度排序，保留置信度高的
      this.entries.sort((a, b) => b.confidence - a.confidence);
      this.entries = this.entries.slice(0, strategy.maxEntries);
    }

    // 按时间清理
    if (strategy.maxAge) {
      const cutoffTime = Date.now() - strategy.maxAge;
      this.entries = this.entries.filter(e => e.lastOccurrence > cutoffTime);
    }
  }

  async save(): Promise<void> {
    try {
      // 确保目录存在
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify(this.entries, null, 2));
    } catch (error) {
      this.logger.error('保存经验记忆失败:', undefined, error instanceof Error ? error : new Error(String(error)));
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
