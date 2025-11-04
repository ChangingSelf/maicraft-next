/**
 * WebSocket管理器
 * 提供全局WebSocket服务器访问
 */

import { WebSocketServer } from './WebSocketServer';

/**
 * WebSocket管理器类
 * 提供全局WebSocket服务器实例访问
 */
export class WebSocketManager {
  private static instance: WebSocketManager;
  private websocketServer?: WebSocketServer;

  private constructor() {}

  /**
   * 获取全局WebSocket管理器实例
   */
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * 设置WebSocket服务器实例
   */
  setWebSocketServer(server: WebSocketServer): void {
    this.websocketServer = server;
  }

  /**
   * 获取WebSocket服务器实例
   */
  getWebSocketServer(): WebSocketServer | undefined {
    return this.websocketServer;
  }

  /**
   * 广播日志数据
   */
  broadcastLog(logData: any): void {
    if (this.websocketServer) {
      this.websocketServer.broadcastLog(logData);
    }
  }

  /**
   * 检查WebSocket服务器是否可用
   */
  isAvailable(): boolean {
    return this.websocketServer !== undefined;
  }
}

/**
 * 默认WebSocket管理器实例
 */
export const websocketManager = WebSocketManager.getInstance();

/**
 * 获取WebSocket服务器的便捷函数
 */
export function getWebSocketServer(): WebSocketServer | undefined {
  return websocketManager.getWebSocketServer();
}

/**
 * 广播日志数据的便捷函数
 */
export function broadcastLog(logData: any): void {
  websocketManager.broadcastLog(logData);
}
