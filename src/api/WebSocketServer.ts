/**
 * WebSocket服务器
 * 提供Maicraft-Next的实时API接口
 */

import { WebSocketServer as WSServer, WebSocket as WS } from 'ws';
import { IncomingMessage } from 'http';
import { getLogger } from '@/utils/Logger';
import { getConfig } from '@/utils/Config';
import { SubscriptionManager } from './SubscriptionManager';
import { MessageHandler } from './MessageHandler';
import { LogDataProvider } from './LogDataProvider';

export interface WebSocketConfig {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  maxConnections: number;
  heartbeatInterval: number;
  connectionTimeout: number;
}

export interface WebSocketConnection {
  id: string;
  websocket: WS;
  lastHeartbeat: number;
  subscribedDataTypes: Set<string>;
  filters: Record<string, any>;
}

/**
 * WebSocket服务器类
 */
export class WebSocketServer {
  private logger = getLogger('WebSocketServer');
  private wss?: WSServer;
  private config: WebSocketConfig;
  private connections = new Map<string, WebSocketConnection>();
  private heartbeatTimer?: NodeJS.Timeout;
  private subscriptionManager: SubscriptionManager;
  private messageHandler: MessageHandler;
  private logDataProvider: LogDataProvider;

  constructor() {
    this.config = this.loadConfig();
    this.subscriptionManager = new SubscriptionManager(this);
    this.messageHandler = new MessageHandler(this.subscriptionManager, this);
    this.logDataProvider = new LogDataProvider(this);
  }

  /**
   * 加载配置
   */
  private loadConfig(): WebSocketConfig {
    const apiConfig = getConfig('api', {});
    const wsConfig = apiConfig.websocket || {};

    return {
      enabled: apiConfig.enabled !== false,
      host: wsConfig.host || '0.0.0.0',
      port: wsConfig.port || 25114,
      path: wsConfig.path || '/ws',
      maxConnections: wsConfig.maxConnections || 10,
      heartbeatInterval: wsConfig.heartbeatInterval || 30000,
      connectionTimeout: wsConfig.connectionTimeout || 60000,
    };
  }

  /**
   * 启动WebSocket服务器
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('WebSocket服务器已禁用');
      return;
    }

    try {
      this.wss = new WSServer({
        host: this.config.host,
        port: this.config.port,
        path: this.config.path,
        maxPayload: 1024 * 1024, // 1MB
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));

      // 启动心跳检查
      this.startHeartbeatCheck();

      // 初始化日志数据提供器
      this.logDataProvider.initialize();

      this.logger.info(`WebSocket服务器启动成功: ws://${this.config.host}:${this.config.port}${this.config.path}`);
    } catch (error) {
      this.logger.error('WebSocket服务器启动失败', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * 停止WebSocket服务器
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.wss) {
      // 关闭所有连接
      for (const connection of this.connections.values()) {
        try {
          connection.websocket.close(1000, 'Server shutting down');
        } catch (error) {
          this.logger.warn('关闭连接时出错', { connectionId: connection.id, error: String(error) });
        }
      }
      this.connections.clear();

      // 停止日志数据提供器
      this.logDataProvider.stop();

      // 关闭服务器
      this.wss.close();
      this.logger.info('WebSocket服务器已停止');
    }
  }

  /**
   * 处理新连接
   */
  private handleConnection(websocket: WS, request: IncomingMessage): void {
    const connectionId = this.generateConnectionId();

    // 检查连接数限制
    if (this.connections.size >= this.config.maxConnections) {
      this.logger.warn(`连接数达到上限 (${this.config.maxConnections})，拒绝新连接`);
      websocket.close(1013, 'Server is full');
      return;
    }

    const connection: WebSocketConnection = {
      id: connectionId,
      websocket,
      lastHeartbeat: Date.now(),
      subscribedDataTypes: new Set(),
      filters: {},
    };

    this.connections.set(connectionId, connection);
    this.logger.info(`新连接建立`, { connectionId, remoteAddress: request.socket?.remoteAddress });

    // 设置连接事件处理器
    websocket.on('message', data => this.handleMessage(connectionId, data));
    websocket.on('close', () => this.handleDisconnection(connectionId));
    websocket.on('error', error => this.handleConnectionError(connectionId, error));
    websocket.on('pong', () => this.handlePong(connectionId));
  }

  /**
   * 处理消息
   */
  private async handleMessage(connectionId: string, data: Buffer): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      const message = JSON.parse(data.toString());
      await this.messageHandler.handleMessage(connection, message);
    } catch (error) {
      this.logger.warn('解析消息失败', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
        rawData: data.toString(),
      });

      this.sendToConnection(connectionId, {
        type: 'error',
        errorCode: 'INVALID_JSON',
        message: '无效的JSON格式',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.logger.info(`连接断开`, { connectionId });
      this.connections.delete(connectionId);
    }
  }

  /**
   * 处理连接错误
   */
  private handleConnectionError(connectionId: string, error: Error): void {
    this.logger.error(`连接错误`, { connectionId, error: error.message });
  }

  /**
   * 处理pong响应
   */
  private handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastHeartbeat = Date.now();
    }
  }

  /**
   * 处理服务器错误
   */
  private handleServerError(error: Error): void {
    this.logger.error('WebSocket服务器错误', { error: error.message });
  }

  /**
   * 启动心跳检查
   */
  private startHeartbeatCheck(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeoutConnections: string[] = [];

      // 检查超时连接
      for (const [connectionId, connection] of this.connections) {
        if (now - connection.lastHeartbeat > this.config.connectionTimeout) {
          timeoutConnections.push(connectionId);
        } else {
          // 发送ping
          try {
            connection.websocket.ping();
          } catch (error) {
            this.logger.warn('发送ping失败', { connectionId, error: String(error) });
            timeoutConnections.push(connectionId);
          }
        }
      }

      // 清理超时连接
      for (const connectionId of timeoutConnections) {
        this.logger.info(`连接超时，断开连接`, { connectionId });
        const connection = this.connections.get(connectionId);
        if (connection) {
          try {
            connection.websocket.close(1000, 'Connection timeout');
          } catch (error) {
            // 忽略关闭时的错误
          }
          this.connections.delete(connectionId);
        }
      }

      this.logger.debug(`心跳检查完成`, {
        activeConnections: this.connections.size,
        timeoutConnections: timeoutConnections.length,
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * 发送消息到指定连接
   */
  sendToConnection(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.websocket.readyState !== WS.OPEN) {
      return;
    }

    try {
      const data = JSON.stringify(message);
      connection.websocket.send(data);
    } catch (error) {
      this.logger.error('发送消息失败', { connectionId, error: String(error) });
    }
  }

  /**
   * 发送错误消息到指定连接
   */
  sendErrorToConnection(connectionId: string, message: string, errorCode: string = 'UNKNOWN_ERROR'): void {
    this.sendToConnection(connectionId, {
      type: 'error',
      errorCode,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * 广播消息到所有连接
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    for (const connection of this.connections.values()) {
      if (connection.websocket.readyState === WS.OPEN) {
        try {
          connection.websocket.send(data);
        } catch (error) {
          this.logger.warn('广播消息失败', { connectionId: connection.id, error: String(error) });
        }
      }
    }
  }

  /**
   * 广播消息到订阅了特定数据类型的连接
   */
  broadcastToSubscribed(dataType: string, message: any): void {
    const data = JSON.stringify(message);
    for (const connection of this.connections.values()) {
      if (connection.subscribedDataTypes.has(dataType) && connection.websocket.readyState === WS.OPEN) {
        try {
          connection.websocket.send(data);
        } catch (error) {
          this.logger.warn('广播消息失败', { connectionId: connection.id, error: String(error) });
        }
      }
    }
  }

  /**
   * 生成连接ID
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取连接统计信息
   */
  getStats(): { activeConnections: number; maxConnections: number } {
    return {
      activeConnections: this.connections.size,
      maxConnections: this.config.maxConnections,
    };
  }

  /**
   * 获取订阅管理器
   */
  getSubscriptionManager(): SubscriptionManager {
    return this.subscriptionManager;
  }

  /**
   * 获取所有连接
   */
  getConnections(): Map<string, WebSocketConnection> {
    return this.connections;
  }

  /**
   * 广播日志数据
   */
  broadcastLog(logData: any): void {
    this.logDataProvider.broadcastLog(logData);
  }
}
