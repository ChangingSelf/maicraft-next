/**
 * 统一的记忆管理器
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import { ThoughtMemory } from './ThoughtMemory';
import { ConversationMemory } from './ConversationMemory';
import { DecisionMemory } from './DecisionMemory';
import { ExperienceMemory } from './ExperienceMemory';
import type { MemoryStore, ThoughtEntry, ConversationEntry, DecisionEntry, ExperienceEntry, MemoryStats } from './types';

export class MemoryManager {
  private thoughts: ThoughtMemory;
  private conversations: ConversationMemory;
  private decisions: DecisionMemory;
  private experiences: ExperienceMemory;

  // 可扩展：添加新的记忆类型
  private customMemories: Map<string, MemoryStore<any>> = new Map();

  private logger: Logger;
  private webSocketServer?: any; // WebSocket服务器引用

  constructor() {
    this.logger = getLogger('MemoryManager');
    this.thoughts = new ThoughtMemory();
    this.conversations = new ConversationMemory();
    this.decisions = new DecisionMemory();
    this.experiences = new ExperienceMemory();
  }

  /**
   * 初始化所有记忆存储
   */
  async initialize(): Promise<void> {
    this.logger.info('🧠 初始化记忆系统...');

    await Promise.all([this.thoughts.initialize(), this.conversations.initialize(), this.decisions.initialize(), this.experiences.initialize()]);

    this.logger.info('✅ 记忆系统初始化完成');
  }

  /**
   * 设置WebSocket服务器引用，用于推送记忆更新
   */
  setWebSocketServer(server: any): void {
    this.webSocketServer = server;
    this.logger.info('📡 WebSocket服务器已连接到记忆管理器');
  }

  /**
   * 注册自定义记忆类型
   */
  registerMemoryStore<T>(name: string, store: MemoryStore<T>): void {
    this.customMemories.set(name, store);
    this.logger.info(`📝 注册自定义记忆类型: ${name}`);
  }

  /**
   * 获取记忆存储
   */
  getMemoryStore<T>(name: string): MemoryStore<T> | undefined {
    return this.customMemories.get(name);
  }

  /**
   * 记录思考
   */
  recordThought(content: string, context?: Record<string, any>): void {
    const entry = {
      id: this.generateId(),
      content,
      context,
      timestamp: Date.now(),
    };
    this.thoughts.add(entry);

    // 推送记忆更新
    if (this.webSocketServer) {
      this.webSocketServer.memoryDataProvider?.pushMemory('thought', entry);
    }
  }

  /**
   * 记录对话
   */
  recordConversation(speaker: 'ai' | 'player', message: string, context?: Record<string, any>): void {
    const entry = {
      id: this.generateId(),
      speaker,
      message,
      context,
      timestamp: Date.now(),
    };
    this.conversations.add(entry);
    this.logger.debug(`💬 记录对话: ${speaker} - ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

    // 推送记忆更新
    if (this.webSocketServer) {
      this.webSocketServer.memoryDataProvider?.pushMemory('conversation', entry);
    }
  }

  /**
   * 记录决策
   */
  recordDecision(intention: string, actions: any[], result: 'success' | 'failed' | 'interrupted', feedback?: string): void {
    const entry = {
      id: this.generateId(),
      intention,
      actions,
      result,
      feedback,
      timestamp: Date.now(),
    };
    this.decisions.add(entry);
    this.logger.debug(`🎯 记录决策: ${result} - ${intention}`);

    // 推送记忆更新
    if (this.webSocketServer) {
      this.webSocketServer.memoryDataProvider?.pushMemory('decision', entry);
    }
  }

  /**
   * 记录经验
   */
  recordExperience(lesson: string, context: string, confidence: number = 0.5): void {
    const entry = {
      id: this.generateId(),
      lesson,
      context,
      confidence,
      occurrences: 1,
      timestamp: Date.now(),
      lastOccurrence: Date.now(),
    };
    this.experiences.add(entry);
    this.logger.debug(`📚 记录经验: ${lesson.substring(0, 50)}${lesson.length > 50 ? '...' : ''} (置信度: ${(confidence * 100).toFixed(0)}%)`);

    // 推送记忆更新
    if (this.webSocketServer) {
      this.webSocketServer.memoryDataProvider?.pushMemory('experience', entry);
    }
  }

  /**
   * 构建上下文摘要（整合所有记忆）
   */
  buildContextSummary(options: {
    includeThoughts?: number;
    includeConversations?: number;
    includeDecisions?: number;
    includeExperiences?: number;
    includeCustom?: Record<string, number>;
  }): string {
    const parts: string[] = [];

    // 思考记忆
    if (options.includeThoughts) {
      const thoughts = this.thoughts.getRecent(options.includeThoughts);
      if (thoughts.length > 0) {
        parts.push('【最近思考】');
        parts.push(thoughts.map(t => this.formatThought(t)).join('\n'));
      }
    }

    // 对话记忆
    if (options.includeConversations) {
      const conversations = this.conversations.getRecent(options.includeConversations);
      if (conversations.length > 0) {
        parts.push('\n【最近对话】');
        parts.push(conversations.map(c => this.formatConversation(c)).join('\n'));
      }
    }

    // 决策记忆
    if (options.includeDecisions) {
      const decisions = this.decisions.getRecent(options.includeDecisions);
      if (decisions.length > 0) {
        parts.push('\n【最近决策】');
        parts.push(decisions.map(d => this.formatDecision(d)).join('\n'));
      }
    }

    // 经验记忆
    if (options.includeExperiences) {
      const experiences = this.experiences.getRecent(options.includeExperiences);
      if (experiences.length > 0) {
        parts.push('\n【相关经验】');
        parts.push(experiences.map(e => this.formatExperience(e)).join('\n'));
      }
    }

    // 自定义记忆
    if (options.includeCustom) {
      for (const [name, count] of Object.entries(options.includeCustom)) {
        const store = this.customMemories.get(name);
        if (store) {
          const entries = store.getRecent(count);
          if (entries.length > 0) {
            parts.push(`\n【${name}】`);
            parts.push(entries.map(e => JSON.stringify(e)).join('\n'));
          }
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 保存所有记忆
   */
  async saveAll(): Promise<void> {
    this.logger.info('💾 保存记忆...');

    await Promise.all([
      this.thoughts.save(),
      this.conversations.save(),
      this.decisions.save(),
      this.experiences.save(),
      ...Array.from(this.customMemories.values()).map(store => store.save()),
    ]);

    this.logger.info('✅ 记忆保存完成');
  }

  /**
   * 加载所有记忆
   */
  async loadAll(): Promise<void> {
    this.logger.info('📖 加载记忆...');

    await Promise.all([
      this.thoughts.load(),
      this.conversations.load(),
      this.decisions.load(),
      this.experiences.load(),
      ...Array.from(this.customMemories.values()).map(store => store.load()),
    ]);

    this.logger.info('✅ 记忆加载完成');
  }

  /**
   * 获取所有记忆统计
   */
  getAllStats(): Record<string, MemoryStats> {
    return {
      thoughts: this.thoughts.getStats(),
      conversations: this.conversations.getStats(),
      decisions: this.decisions.getStats(),
      experiences: this.experiences.getStats(),
      ...Object.fromEntries(Array.from(this.customMemories.entries()).map(([name, store]) => [name, store.getStats()])),
    };
  }

  // 快捷访问方法
  get thought(): ThoughtMemory {
    return this.thoughts;
  }
  get conversation(): ConversationMemory {
    return this.conversations;
  }
  get decision(): DecisionMemory {
    return this.decisions;
  }
  get experience(): ExperienceMemory {
    return this.experiences;
  }

  /**
   * 更新记忆
   */
  updateMemory(memoryType: 'thought' | 'conversation' | 'decision' | 'experience', id: string, updates: any): boolean {
    switch (memoryType) {
      case 'thought':
        return this.thoughts.update(id, updates);
      case 'conversation':
        return this.conversations.update(id, updates);
      case 'decision':
        return this.decisions.update(id, updates);
      case 'experience':
        return this.experiences.update(id, updates);
      default:
        this.logger.warn(`未知的记忆类型: ${memoryType}`);
        return false;
    }
  }

  /**
   * 删除记忆
   */
  deleteMemory(memoryType: 'thought' | 'conversation' | 'decision' | 'experience', id: string): boolean {
    switch (memoryType) {
      case 'thought':
        return this.thoughts.delete(id);
      case 'conversation':
        return this.conversations.delete(id);
      case 'decision':
        return this.decisions.delete(id);
      case 'experience':
        return this.experiences.delete(id);
      default:
        this.logger.warn(`未知的记忆类型: ${memoryType}`);
        return false;
    }
  }

  /**
   * 根据ID查找记忆
   */
  findMemory(memoryType: 'thought' | 'conversation' | 'decision' | 'experience', id: string): any {
    switch (memoryType) {
      case 'thought':
        return this.thoughts.findById(id);
      case 'conversation':
        return this.conversations.findById(id);
      case 'decision':
        return this.decisions.findById(id);
      case 'experience':
        return this.experiences.findById(id);
      default:
        this.logger.warn(`未知的记忆类型: ${memoryType}`);
        return undefined;
    }
  }

  // 格式化方法
  private formatThought(t: ThoughtEntry): string {
    return `${this.formatTime(t.timestamp)}: ${t.content}`;
  }

  private formatConversation(c: ConversationEntry): string {
    const speaker = c.speaker === 'ai' ? '[我]' : '[玩家]';
    return `${this.formatTime(c.timestamp)} ${speaker}: ${c.message}`;
  }

  private formatDecision(d: DecisionEntry): string {
    const icon = d.result === 'success' ? '✅' : d.result === 'failed' ? '❌' : '⚠️';
    return `${this.formatTime(d.timestamp)} ${icon} ${d.intention}`;
  }

  private formatExperience(e: ExperienceEntry): string {
    return `${e.lesson} (置信度: ${(e.confidence * 100).toFixed(0)}%, 发生次数: ${e.occurrences})`;
  }

  private formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
