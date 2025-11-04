/**
 * 日志数据提供器
 * 将日志数据转换为WebSocket消息格式
 */

import { getLogger } from '@/utils/Logger';
import { WebSocketServer } from './WebSocketServer';

export interface LogData {
  timestamp: number;
  level: string;
  message: string;
  module?: string;
}

/**
 * 日志数据提供器类
 */
export class LogDataProvider {
  private logger = getLogger('LogDataProvider');
  private websocketServer: WebSocketServer;
  private isInitialized = false;

  constructor(websocketServer: WebSocketServer) {
    this.websocketServer = websocketServer;
  }

  /**
   * 初始化日志数据提供器
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // 监听全局日志器的事件（如果有的话）
    // 目前我们通过定期检查来模拟事件驱动
    this.startLogBroadcasting();

    this.isInitialized = true;
    this.logger.info('日志数据提供器已初始化');
  }

  /**
   * 广播日志数据
   */
  broadcastLog(logData: LogData): void {
    const message = {
      type: 'logsUpdate',
      timestamp: Date.now(),
      data: logData,
    };

    this.websocketServer.broadcastToSubscribed('logs', message);
  }

  /**
   * 启动日志广播
   * 这里暂时使用简单的实现，实际应该监听日志器的事件
   */
  private startLogBroadcasting(): void {
    // 这里可以集成到日志系统中
    // 目前只是一个占位符
    this.logger.debug('日志广播已启动');
  }

  /**
   * 停止日志数据提供器
   */
  stop(): void {
    this.isInitialized = false;
    this.logger.info('日志数据提供器已停止');
  }
}
