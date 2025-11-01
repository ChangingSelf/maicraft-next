/**
 * 对话记忆存储
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryStore, ConversationEntry, QueryOptions, CleanupStrategy, MemoryStats } from './types';
import { getLogger, type Logger } from '@/utils/Logger';

export class ConversationMemory implements MemoryStore<ConversationEntry> {
  private entries: ConversationEntry[] = [];
  private maxEntries = 100;
  private dataFile = 'data/memory/conversations.json';
  private logger: Logger = getLogger('ConversationMemory');

  async initialize(): Promise<void> {
    await this.load();
  }

  add(entry: ConversationEntry): void {
    this.entries.push(entry);
    this.cleanup({ maxEntries: this.maxEntries });
  }

  query(options: QueryOptions): ConversationEntry[] {
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

  getRecent(count: number): ConversationEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * 获取与特定玩家的对话
   */
  getConversationWith(playerName: string, limit: number = 10): ConversationEntry[] {
    return this.entries
      .filter(e => (e.speaker === 'player' && e.context?.username === playerName) || (e.speaker === 'ai' && e.context?.replyTo === playerName))
      .slice(-limit);
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
      this.logger.error('保存对话记忆失败:', undefined, error instanceof Error ? error : new Error(String(error)));
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
