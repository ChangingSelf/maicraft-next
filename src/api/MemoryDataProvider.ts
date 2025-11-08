/**
 * 记忆数据提供器
 * 处理记忆数据的推送和客户端操作
 */

import { getLogger } from '@/utils/Logger';
import { WebSocketServer } from './WebSocketServer';
import { MemoryManager } from '@/core/agent/memory/MemoryManager';
import type { ThoughtEntry, ConversationEntry, DecisionEntry, ExperienceEntry } from '@/core/agent/memory/types';

export class MemoryDataProvider {
  private logger = getLogger('MemoryDataProvider');
  private server: WebSocketServer;
  private memoryManager!: MemoryManager;

  constructor(server: WebSocketServer) {
    this.server = server;
  }

  /**
   * 初始化数据提供器
   */
  initialize(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
    this.logger.info('🧠 记忆数据提供器已初始化');
  }

  /**
   * 推送记忆数据
   */
  pushMemory(memoryType: 'thought' | 'conversation' | 'decision' | 'experience', entry: any): void {
    const message = {
      type: 'memory_push',
      timestamp: Date.now(),
      data: {
        memoryType,
        entry,
      },
    };

    this.logger.info(`📤 推送记忆: ${memoryType} - ${entry.id}`);
    this.server.broadcastToSubscribed('memory', message);
  }

  /**
   * 处理记忆查询
   */
  async handleMemoryQuery(clientId: string, data: any): Promise<void> {
    try {
      const { memoryTypes, timeRange, limit, sortBy, filters } = data;

      this.logger.info('🧠 处理记忆查询请求', { clientId, memoryTypes, limit, memoryManagerExists: !!this.memoryManager });

      const results: Record<string, any[]> = {};
      let totalEntries = 0;

      // 如果指定了记忆类型，只查询指定的类型
      const typesToQuery = memoryTypes || ['thought', 'conversation', 'decision', 'experience'];

      for (const memoryType of typesToQuery) {
        this.logger.debug(`查询记忆类型: ${memoryType}`);
        const entries = await this.queryMemoryType(memoryType, { timeRange, limit, sortBy, filters });
        this.logger.debug(`记忆类型 ${memoryType} 返回 ${entries.length} 条记录`);
        results[memoryType] = entries;
        totalEntries += entries.length;
      }

      // 发送响应
      this.server.sendToConnection(clientId, {
        type: 'memory_query_response',
        timestamp: Date.now(),
        success: true,
        message: '查询成功',
        data: {
          total: totalEntries,
          entries: results,
        },
      });
    } catch (error) {
      this.logger.error('记忆查询失败', { clientId, error: error instanceof Error ? error.message : String(error) });

      this.server.sendToConnection(clientId, {
        type: 'memory_query_response',
        timestamp: Date.now(),
        success: false,
        message: '查询失败',
        errorCode: 'MEMORY_QUERY_FAILED',
      });
    }
  }

  /**
   * 处理记忆添加
   */
  async handleMemoryAdd(clientId: string, data: any): Promise<void> {
    try {
      const { memoryType, entry } = data;

      this.logger.debug('处理记忆添加请求', { clientId, memoryType });

      // 验证记忆类型
      if (!this.isValidMemoryType(memoryType)) {
        this.sendError(clientId, '无效的记忆类型', 'INVALID_MEMORY_TYPE');
        return;
      }

      // 生成ID和时间戳
      const newEntry = {
        ...entry,
        id: this.generateId(),
        timestamp: Date.now(),
      };

      // 添加到记忆系统
      let success = false;
      switch (memoryType) {
        case 'thought':
          this.memoryManager.thought.add(newEntry);
          success = true;
          break;
        case 'conversation':
          this.memoryManager.conversation.add(newEntry);
          success = true;
          break;
        case 'decision':
          this.memoryManager.decision.add(newEntry);
          success = true;
          break;
        case 'experience':
          this.memoryManager.experience.add(newEntry);
          success = true;
          break;
      }

      if (success) {
        // 推送新记忆
        this.pushMemory(memoryType, newEntry);

        // 发送响应
        this.server.sendToConnection(clientId, {
          type: 'memory_add_response',
          timestamp: Date.now(),
          success: true,
          message: '记忆添加成功',
          data: {
            memoryType,
            entry: newEntry,
          },
        });
      } else {
        this.sendError(clientId, '记忆添加失败', 'MEMORY_OPERATION_FAILED');
      }
    } catch (error) {
      this.logger.error('记忆添加失败', { clientId, error: error instanceof Error ? error.message : String(error) });
      this.sendError(clientId, '记忆添加失败', 'MEMORY_OPERATION_FAILED');
    }
  }

  /**
   * 处理记忆修改
   */
  async handleMemoryUpdate(clientId: string, data: any): Promise<void> {
    try {
      const { memoryType, id, updates } = data;

      this.logger.debug('处理记忆修改请求', { clientId, memoryType, id });

      // 验证记忆类型
      if (!this.isValidMemoryType(memoryType)) {
        this.sendError(clientId, '无效的记忆类型', 'INVALID_MEMORY_TYPE');
        return;
      }

      // 更新记忆
      const success = this.memoryManager.updateMemory(memoryType, id, updates);

      if (success) {
        // 获取更新后的记忆
        const updatedEntry = this.memoryManager.findMemory(memoryType, id);

        // 发送响应
        this.server.sendToConnection(clientId, {
          type: 'memory_update_response',
          timestamp: Date.now(),
          success: true,
          message: '记忆修改成功',
          data: {
            memoryType,
            entry: updatedEntry,
          },
        });
      } else {
        this.sendError(clientId, '记忆条目不存在', 'MEMORY_NOT_FOUND');
      }
    } catch (error) {
      this.logger.error('记忆修改失败', { clientId, error: error instanceof Error ? error.message : String(error) });
      this.sendError(clientId, '记忆修改失败', 'MEMORY_OPERATION_FAILED');
    }
  }

  /**
   * 处理记忆删除
   */
  async handleMemoryDelete(clientId: string, data: any): Promise<void> {
    try {
      const { memoryType, id } = data;

      this.logger.debug('处理记忆删除请求', { clientId, memoryType, id });

      // 验证记忆类型
      if (!this.isValidMemoryType(memoryType)) {
        this.sendError(clientId, '无效的记忆类型', 'INVALID_MEMORY_TYPE');
        return;
      }

      // 删除记忆
      const success = this.memoryManager.deleteMemory(memoryType, id);

      if (success) {
        // 发送响应
        this.server.sendToConnection(clientId, {
          type: 'memory_delete_response',
          timestamp: Date.now(),
          success: true,
          message: '记忆删除成功',
          data: {
            memoryType,
            id,
          },
        });
      } else {
        this.sendError(clientId, '记忆条目不存在', 'MEMORY_NOT_FOUND');
      }
    } catch (error) {
      this.logger.error('记忆删除失败', { clientId, error: error instanceof Error ? error.message : String(error) });
      this.sendError(clientId, '记忆删除失败', 'MEMORY_OPERATION_FAILED');
    }
  }

  /**
   * 查询指定类型的记忆
   */
  private async queryMemoryType(
    memoryType: string,
    options: {
      timeRange?: [number, number];
      limit?: number;
      sortBy?: string;
      filters?: Record<string, any>;
    },
  ): Promise<any[]> {
    const queryOptions: any = {};

    // 时间范围
    if (options.timeRange) {
      queryOptions.timeRange = options.timeRange;
    }

    // 限制数量
    if (options.limit) {
      queryOptions.limit = options.limit;
    }

    // 过滤器
    if (options.filters) {
      queryOptions.filter = (entry: any) => {
        // 对话记忆过滤器
        if (memoryType === 'conversation' && options.filters?.speaker) {
          return entry.speaker === options.filters.speaker;
        }

        // 决策记忆过滤器
        if (memoryType === 'decision' && options.filters?.result) {
          return entry.result === options.filters.result;
        }

        // 通过context字段过滤
        if (entry.context) {
          if (options.filters?.importance && entry.context.importance !== options.filters.importance) {
            return false;
          }
          if (options.filters?.category && entry.context.category !== options.filters.category) {
            return false;
          }
        }

        return true;
      };
    }

    // 执行查询
    switch (memoryType) {
      case 'thought':
        return this.memoryManager.thought.query(queryOptions);
      case 'conversation':
        return this.memoryManager.conversation.query(queryOptions);
      case 'decision':
        return this.memoryManager.decision.query(queryOptions);
      case 'experience':
        return this.memoryManager.experience.query(queryOptions);
      default:
        return [];
    }
  }

  /**
   * 验证记忆类型
   */
  private isValidMemoryType(type: string): type is 'thought' | 'conversation' | 'decision' | 'experience' {
    return ['thought', 'conversation', 'decision', 'experience'].includes(type);
  }

  /**
   * 发送错误消息
   */
  private sendError(clientId: string, message: string, errorCode: string): void {
    this.server.sendToConnection(clientId, {
      type: 'memory_operation_response',
      timestamp: Date.now(),
      success: false,
      message,
      errorCode,
    });
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
