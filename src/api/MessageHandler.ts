/**
 * 消息处理器
 * 处理WebSocket客户端发送的消息
 */

import { getLogger } from '@/utils/Logger';
import { WebSocketConnection } from './WebSocketServer';
import { SubscriptionManager } from './SubscriptionManager';
import { MemoryDataProvider } from './MemoryDataProvider';

export interface WSMessage {
  type: string;
  timestamp?: number;
  data?: any;
  [key: string]: any;
}

/**
 * 消息处理器类
 */
export class MessageHandler {
  private logger = getLogger('MessageHandler');
  private subscriptionManager: SubscriptionManager;
  private server: any; // 避免循环依赖
  private memoryDataProvider: MemoryDataProvider;

  constructor(subscriptionManager: SubscriptionManager, server?: any) {
    this.subscriptionManager = subscriptionManager;
    this.server = server;
    this.memoryDataProvider = new MemoryDataProvider(server);
  }

  /**
   * 设置记忆管理器
   */
  setMemoryManager(memoryManager: any): void {
    this.memoryDataProvider.initialize(memoryManager);
  }

  /**
   * 处理客户端消息
   */
  async handleMessage(connection: WebSocketConnection, message: WSMessage): Promise<void> {
    const { type } = message;

    try {
      switch (type) {
        case 'subscribe':
          await this.handleSubscribe(connection, message);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(connection, message);
          break;

        case 'ping':
          await this.handlePing(connection, message);
          break;

        case 'memory_query':
          await this.memoryDataProvider.handleMemoryQuery(connection.id, message.data);
          break;

        case 'memory_add':
          await this.memoryDataProvider.handleMemoryAdd(connection.id, message.data);
          break;

        case 'memory_update':
          await this.memoryDataProvider.handleMemoryUpdate(connection.id, message.data);
          break;

        case 'memory_delete':
          await this.memoryDataProvider.handleMemoryDelete(connection.id, message.data);
          break;

        default:
          this.sendError(connection, `未知消息类型: ${type}`, 'UNKNOWN_MESSAGE_TYPE');
          break;
      }
    } catch (error) {
      this.logger.error('处理消息时出错', {
        connectionId: connection.id,
        messageType: type,
        error: error instanceof Error ? error.message : String(error),
      });

      this.sendError(connection, '消息处理失败', 'MESSAGE_PROCESSING_ERROR');
    }
  }

  /**
   * 处理订阅请求
   */
  private async handleSubscribe(connection: WebSocketConnection, message: WSMessage): Promise<void> {
    const { dataTypes, updateInterval, filters } = message;

    // 验证参数
    if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
      this.sendError(connection, 'dataTypes必须是非空数组', 'INVALID_PARAMETER');
      return;
    }

    // 验证updateInterval
    if (updateInterval !== undefined && (typeof updateInterval !== 'number' || updateInterval < 0)) {
      this.sendError(connection, 'updateInterval必须是非负数', 'INVALID_PARAMETER');
      return;
    }

    // 验证过滤器
    if (filters !== undefined && typeof filters !== 'object') {
      this.sendError(connection, 'filters必须是对象', 'INVALID_PARAMETER');
      return;
    }

    await this.subscriptionManager.handleSubscribe(connection, dataTypes, updateInterval, filters);
  }

  /**
   * 处理取消订阅请求
   */
  private async handleUnsubscribe(connection: WebSocketConnection, message: WSMessage): Promise<void> {
    const { dataTypes } = message;

    // 如果指定了dataTypes，只取消指定的订阅
    // 如果没有指定，取消所有订阅
    await this.subscriptionManager.handleUnsubscribe(connection, dataTypes);
  }

  /**
   * 处理心跳请求
   */
  private async handlePing(connection: WebSocketConnection, message: WSMessage): Promise<void> {
    const { timestamp } = message;

    // 更新最后心跳时间
    connection.lastHeartbeat = Date.now();

    // 发送pong响应
    // 这里通过WebSocketServer发送，因为我们没有直接访问websocket的引用
    // 实际实现时需要让WebSocketServer提供发送方法
    this.logger.debug('收到ping消息', { connectionId: connection.id, clientTimestamp: timestamp });
  }

  /**
   * 发送错误消息
   */
  private sendError(connection: WebSocketConnection, message: string, errorCode: string = 'UNKNOWN_ERROR'): void {
    if (this.server) {
      this.server.sendErrorToConnection(connection.id, message, errorCode);
    } else {
      this.logger.warn('无法发送错误消息：服务器引用为空', {
        connectionId: connection.id,
        errorCode,
        message,
      });
    }
  }

  /**
   * 验证数据类型
   */
  private validateDataTypes(dataTypes: any[]): boolean {
    const validTypes = ['logs', 'player', 'world', 'tasks', 'memory', 'usage'];

    return dataTypes.every(type => typeof type === 'string' && validTypes.includes(type));
  }
}
