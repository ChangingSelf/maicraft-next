/**
 * Memory 系统的类型定义
 */

import type { ActionCall } from '../types';

/**
 * 查询选项
 */
export interface QueryOptions {
  timeRange?: [number, number];
  limit?: number;
  filter?: (entry: any) => boolean;
  sortBy?: 'timestamp' | 'relevance';
}

/**
 * 清理策略
 */
export interface CleanupStrategy {
  maxEntries?: number; // 最大条目数
  maxAge?: number; // 最大保存时间（毫秒）
  keepImportant?: boolean; // 保留重要记忆
}

/**
 * 记忆统计
 */
export interface MemoryStats {
  totalEntries: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  sizeInBytes: number;
}

/**
 * 记忆存储接口
 * 所有记忆模块都实现此接口
 */
export interface MemoryStore<T> {
  /**
   * 添加记忆
   */
  add(entry: T): void;

  /**
   * 查询记忆
   */
  query(options: QueryOptions): T[];

  /**
   * 获取最近的记忆
   */
  getRecent(count: number): T[];

  /**
   * 搜索记忆（可选，用于语义搜索）
   */
  search?(query: string, limit: number): T[];

  /**
   * 清除旧记忆
   */
  cleanup(strategy: CleanupStrategy): void;

  /**
   * 保存到磁盘
   */
  save(): Promise<void>;

  /**
   * 从磁盘加载
   */
  load(): Promise<void>;

  /**
   * 获取统计信息
   */
  getStats(): MemoryStats;
}

/**
 * 思考条目
 */
export interface ThoughtEntry {
  id: string;
  content: string;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * 对话条目
 */
export interface ConversationEntry {
  id: string;
  speaker: 'ai' | 'player';
  message: string;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * 决策条目
 */
export interface DecisionEntry {
  id: string;
  intention: string; // 决策意图
  actions: ActionCall[]; // 执行的动作
  result: 'success' | 'failed' | 'interrupted';
  feedback?: string; // 执行反馈
  timestamp: number;
}

/**
 * 经验条目
 */
export interface ExperienceEntry {
  id: string;
  lesson: string; // 经验教训描述
  context: string; // 发生的上下文
  confidence: number; // 置信度（0-1）
  occurrences: number; // 发生次数
  timestamp: number; // 首次学到的时间
  lastOccurrence: number; // 最后一次发生的时间
}
