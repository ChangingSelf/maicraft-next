/**
 * Logger 工厂
 * 统一管理 logger 的创建
 */

import type { Logger, LoggerConfig } from './Logger';
import { createLogger, createModuleLogger, createConfiguredLogger } from './Logger';

export class LoggerFactory {
  /**
   * 创建基础 logger
   */
  createLogger(config?: Partial<LoggerConfig>): Logger {
    return createLogger(config);
  }

  /**
   * 创建模块 logger
   */
  createModuleLogger(moduleName: string, config?: Partial<LoggerConfig>): Logger {
    return createModuleLogger(moduleName, config);
  }

  /**
   * 创建配置化的 logger
   */
  createConfiguredLogger(moduleName: string, config?: Partial<LoggerConfig>): Logger {
    return createConfiguredLogger(moduleName, config);
  }

  /**
   * 创建带前缀的 logger
   */
  createPrefixedLogger(baseLogger: Logger, prefix: string): Logger {
    // 这里可以实现更复杂的逻辑
    return createModuleLogger(prefix);
  }
}

/**
 * 默认的 LoggerFactory 实例
 * @deprecated 使用DI容器：container.resolve(ServiceKeys.LoggerFactory)
 */
export const loggerFactory = new LoggerFactory();
