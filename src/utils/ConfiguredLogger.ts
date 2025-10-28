import { Logger, LogLevel, LoggerConfig } from './Logger';
import { AppConfig, getSection } from './Config';

/**
 * 配置化的日志器类
 * 从配置文件中读取日志配置并创建相应的日志器实例
 */
export class ConfiguredLogger extends Logger {
  constructor(config?: Partial<LoggerConfig>) {
    // 如果没有传入配置，尝试从全局配置中读取
    const configFromApp = config || ConfiguredLogger.getLoggingConfig();
    super(configFromApp);
  }

  /**
   * 从全局配置中获取日志配置
   */
  private static getLoggingConfig(): Partial<LoggerConfig> {
    try {
      const loggingSection = getSection('logging');

      return {
        level: ConfiguredLogger.parseLogLevel(loggingSection.level),
        console: loggingSection.console,
        file: loggingSection.file,
        maxFileSize: loggingSection.max_file_size,
        maxFiles: loggingSection.max_files,
        logDir: loggingSection.log_dir,
      };
    } catch (error) {
      // 如果无法获取配置，使用默认值
      console.warn('无法从配置文件读取日志配置，使用默认配置:', error);
      return {
        level: LogLevel.INFO,
        console: true,
        file: true,
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
        logDir: './logs',
      };
    }
  }

  /**
   * 解析日志级别字符串
   */
  private static parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        console.warn(`未知的日志级别: ${level}，使用默认级别 INFO`);
        return LogLevel.INFO;
    }
  }

  /**
   * 创建配置化的日志器实例
   */
  static create(moduleName?: string, config?: Partial<LoggerConfig>): ConfiguredLogger {
    const logger = new ConfiguredLogger(config);

    if (moduleName) {
      // 如果指定了模块名，创建子日志器
      return logger.child(moduleName) as ConfiguredLogger;
    }

    return logger;
  }

  /**
   * 根据应用配置更新日志器配置
   */
  updateFromAppConfig(): void {
    try {
      const loggingSection = getSection('logging');
      const newConfig = {
        level: ConfiguredLogger.parseLogLevel(loggingSection.level),
        console: loggingSection.console,
        file: loggingSection.file,
        maxFileSize: loggingSection.max_file_size,
        maxFiles: loggingSection.max_files,
        logDir: loggingSection.log_dir,
      };

      this.updateConfig(newConfig);
    } catch (error) {
      this.warn('更新日志配置失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/**
 * 创建配置化的模块日志器
 */
export function createConfiguredLogger(moduleName: string, config?: Partial<LoggerConfig>): ConfiguredLogger {
  return ConfiguredLogger.create(moduleName, config);
}

/**
 * 默认配置化日志器实例
 */
export const configuredLogger = new ConfiguredLogger();