/**
 * 订阅管理器
 * 管理客户端对不同数据类型的订阅
 */

import { getLogger } from '@/utils/Logger';
import { WebSocketConnection } from './WebSocketServer';

export interface SubscriptionInfo {
  dataTypes: string[];
  updateInterval?: number;
  filters?: Record<string, any>;
}

/**
 * 订阅管理器类
 */
export class SubscriptionManager {
  private logger = getLogger('SubscriptionManager');
  private server: any; // 避免循环依赖

  constructor(server: any) {
    this.server = server;
  }

  /**
   * 处理订阅请求
   */
  async handleSubscribe(connection: WebSocketConnection, dataTypes: string[], updateInterval?: number, filters?: Record<string, any>): Promise<void> {
    // 取消之前的订阅
    await this.handleUnsubscribe(connection);

    // 建立新订阅
    connection.subscribedDataTypes = new Set(dataTypes);
    connection.filters = filters || {};

    this.logger.info(`客户端订阅数据`, {
      connectionId: connection.id,
      dataTypes,
      updateInterval,
      filters,
    });

    // 发送确认消息
    this.server.sendToConnection(connection.id, {
      type: 'subscriptionConfirmed',
      timestamp: Date.now(),
      data: {
        subscribedTypes: dataTypes,
        updateInterval: updateInterval || 0,
        filters: connection.filters,
      },
    });
  }

  /**
   * 处理取消订阅请求
   */
  async handleUnsubscribe(connection: WebSocketConnection, dataTypes?: string[]): Promise<void> {
    if (dataTypes) {
      // 取消指定数据类型的订阅
      for (const dataType of dataTypes) {
        connection.subscribedDataTypes.delete(dataType);
      }
    } else {
      // 取消所有订阅
      connection.subscribedDataTypes.clear();
      connection.filters = {};
    }

    this.logger.info(`客户端取消订阅`, {
      connectionId: connection.id,
      dataTypes: dataTypes || 'all',
    });

    // 发送确认消息
    this.server.sendToConnection(connection.id, {
      type: 'unsubscribed',
      timestamp: Date.now(),
      message: '已取消订阅',
    });
  }

  /**
   * 获取订阅了特定数据类型的连接
   */
  getSubscribedConnections(dataType: string): WebSocketConnection[] {
    const connections: WebSocketConnection[] = [];
    const allConnections = this.server.getConnections();

    for (const connection of allConnections.values()) {
      if (this.isSubscribed(connection, dataType)) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * 检查连接是否订阅了特定数据类型
   */
  isSubscribed(connection: WebSocketConnection, dataType: string): boolean {
    return connection.subscribedDataTypes.has(dataType);
  }

  /**
   * 获取连接的过滤器
   */
  getFilters(connection: WebSocketConnection): Record<string, any> {
    return connection.filters;
  }

  /**
   * 清理连接的订阅信息
   */
  cleanupConnection(connection: WebSocketConnection): void {
    connection.subscribedDataTypes.clear();
    connection.filters = {};
  }
}
