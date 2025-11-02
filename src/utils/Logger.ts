import { existsSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * 日志级别名称映射
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
};

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: string; // ISO 8601格式时间戳
  level: LogLevel; // 日志级别
  message: string; // 日志消息
  context?: Record<string, unknown>; // 上下文数据
  module?: string; // 模块名称
  error?: {
    name: string;
    message: string;
    stack?: string;
  }; // 错误对象信息
}

/**
 * Logger配置接口
 */
export interface LoggerConfig {
  level: LogLevel; // 最小日志级别
  console: boolean; // 是否输出到控制台
  file: boolean; // 是否输出到文件
  colors?: boolean; // 是否启用控制台彩色输出（默认true）
  maxFileSize?: number; // 最大文件大小（字节，默认10MB）
  maxFiles?: number; // 最大文件数量（默认5）
  dateFormat?: string; // 时间格式（默认ISO）
  logDir?: string; // 日志目录（默认logs）
}

/**
 * Logger配置验证Schema
 */
const LoggerConfigSchema = z.object({
  level: z.nativeEnum(LogLevel).default(LogLevel.INFO),
  console: z.boolean().default(true),
  file: z.boolean().default(true),
  colors: z.boolean().default(true), // 默认启用彩色输出
  maxFileSize: z
    .number()
    .positive()
    .default(10 * 1024 * 1024), // 10MB
  maxFiles: z.number().positive().default(5),
  dateFormat: z.string().default('iso'),
  logDir: z.string().default('logs'),
});

/**
 * 日志轮转信息
 */
interface LogRotationInfo {
  currentDate: string; // 当前日期
  fileIndex: number; // 文件索引
  currentSize: number; // 当前文件大小
}

/**
 * 结构化日志器
 */
export class Logger {
  private config: LoggerConfig;
  private rotationInfo: LogRotationInfo;
  private currentFilePath: string;
  private colors: boolean;

  constructor(config: Partial<LoggerConfig> = {}) {
    // 如果没有传入配置或传入空配置，尝试从全局配置中读取
    const configFromApp = Object.keys(config).length === 0 ? Logger.getConfigFromApp() : config;
    const validatedConfig = LoggerConfigSchema.parse(configFromApp);
    this.config = validatedConfig;
    this.colors = validatedConfig.colors;

    // 初始化日志轮转信息
    this.rotationInfo = {
      currentDate: this.getCurrentDate(),
      fileIndex: 0,
      currentSize: 0,
    };

    // 确保日志目录存在
    this.ensureLogDirectory();

    // 初始化当前文件路径
    this.currentFilePath = this.getLogFilePath();

    // 如果启用文件输出，检查现有文件大小
    if (this.config.file) {
      this.initializeCurrentFile();
    }
  }

  /**
   * 记录错误级别日志
   */
  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * 记录警告级别日志
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * 记录信息级别日志
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * 记录调试级别日志
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * 通用日志记录方法
   */
  log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    // 检查日志级别
    if (level > this.config.level) {
      return;
    }

    // 创建日志条目
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    // 输出到控制台
    if (this.config.console) {
      this.writeToConsole(entry);
    }

    // 输出到文件
    if (this.config.file) {
      this.writeToFile(entry);
    }
  }

  /**
   * 创建子日志器（模块专用）
   */
  child(module: string): Logger {
    const childLogger = new Logger(this.config);

    // 重写日志方法以添加模块名称
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) => {
      originalLog(level, message, { ...context, module }, error);
    };

    return childLogger;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    const newConfig = LoggerConfigSchema.parse({ ...this.config, ...config });
    this.config = newConfig;
  }

  /**
   * 关闭日志器（清理资源）
   */
  close(): void {
    // 目前没有需要清理的资源，但保留接口以备将来扩展
  }

  /**
   * 从应用配置中获取日志配置
   */
  private static getConfigFromApp(): Partial<LoggerConfig> {
    try {
      // 直接读取配置文件，避免循环依赖
      const { existsSync, readFileSync } = require('fs');
      const { parse: parseToml } = require('smol-toml');

      const configPath = './config.toml';
      if (existsSync(configPath)) {
        const configContent = readFileSync(configPath, 'utf8');
        const rawConfig = parseToml(configContent);

        if (rawConfig && rawConfig.logging) {
          const logging = rawConfig.logging;
          return {
            level: Logger.parseLogLevel(logging.level || 'info'),
            console: logging.console !== false, // 默认true
            file: logging.file !== false, // 默认true
            colors: logging.colors !== false, // 默认true
            maxFileSize: logging.max_file_size || 10 * 1024 * 1024,
            maxFiles: logging.max_files || 5,
            logDir: logging.log_dir || './logs',
          };
        }
      }
    } catch (error) {
      // 如果读取配置失败，使用默认配置
      // 不输出警告，避免在Logger初始化时的循环依赖
    }

    // 返回默认配置
    return {
      level: LogLevel.INFO,
      console: true,
      file: true,
      colors: true,
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
      logDir: './logs',
    };
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
   * 根据应用配置更新日志器配置
   */
  updateFromAppConfig(): void {
    try {
      const newConfig = Logger.getConfigFromApp();
      this.updateConfig(newConfig);
    } catch (error) {
      this.warn('更新日志配置失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 将日期格式化为 "YYYY-MM-DD HH:mm:ss" 字符串
   */
  private formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }

  /**
   * 根据日志级别获取 ANSI 颜色代码
   */
  private getColor(level: LogLevel): string {
    if (!this.colors) {
      return '';
    }

    switch (level) {
      case LogLevel.DEBUG:
        return '\x1b[90m'; // 灰色
      case LogLevel.INFO:
        return '\x1b[32m'; // 绿色
      case LogLevel.WARN:
        return '\x1b[33m'; // 黄色
      case LogLevel.ERROR:
        return '\x1b[31m'; // 红色
      default:
        return '';
    }
  }

  /**
   * 输出到控制台
   */
  private writeToConsole(entry: LogEntry): void {
    const levelName = LOG_LEVEL_NAMES[entry.level];
    const moduleInfo = entry.context?.module ? `[${entry.context.module}] ` : '';

    // 创建context副本，移除module字段（因为已经在模块前缀中显示了）
    const contextForDisplay = entry.context ? { ...entry.context } : undefined;
    if (contextForDisplay?.module) {
      delete contextForDisplay.module;
    }

    const contextStr = contextForDisplay && Object.keys(contextForDisplay).length > 0 ? ` ${JSON.stringify(contextForDisplay, null, 0)}` : '';

    // 构建彩色消息
    const rawParts: string[] = [];
    const coloredParts: string[] = [];

    // 时间戳
    const timestamp = `[${this.formatTimestamp(new Date(entry.timestamp))}]`;
    rawParts.push(timestamp);
    coloredParts.push(this.colors ? `\x1b[90m${timestamp}\x1b[0m` : timestamp); // 灰色

    // 日志级别
    const levelPart = `[${levelName}]`;
    rawParts.push(levelPart);
    coloredParts.push(this.colors ? `${this.getColor(entry.level)}${levelPart}\x1b[0m` : levelPart);

    // 模块前缀
    if (entry.context?.module) {
      rawParts.push(`[${entry.context.module}]`);
      coloredParts.push(this.colors ? `\x1b[34m[${entry.context.module}]\x1b[0m` : `[${entry.context.module}]`); // 蓝色
    }

    // 构建完整消息
    const prefix = (this.colors ? coloredParts : rawParts).join(' ');
    const message = `${entry.message}${contextStr}`;
    const fullMessage = `${prefix} ${message}`;

    // 根据日志级别输出到控制台
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(fullMessage);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
      case LogLevel.WARN:
        console.warn(fullMessage);
        break;
      case LogLevel.INFO:
        console.log(fullMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(fullMessage);
        break;
    }
  }

  /**
   * 输出到文件
   */
  private writeToFile(entry: LogEntry): void {
    try {
      // 写入JSONL格式
      const jsonLine = JSON.stringify(entry) + '\n';
      const lineSize = Buffer.byteLength(jsonLine, 'utf8');

      // 检查是否需要轮转日志（写入前检查）
      if (this.rotationInfo.currentSize + lineSize > this.config.maxFileSize!) {
        this.rotateLog();
      }

      appendFileSync(this.currentFilePath, jsonLine, 'utf8');

      // 更新当前文件大小
      this.rotationInfo.currentSize += lineSize;
    } catch (error) {
      // 文件写入失败时输出到控制台
      console.error('Failed to write log to file:', error);
      console.error('Log entry:', entry);
    }
  }

  /**
   * 执行日志轮转
   */
  private rotateLog(): void {
    const currentDate = this.getCurrentDate();

    // 检查日期是否变化
    if (currentDate !== this.rotationInfo.currentDate) {
      this.rotationInfo.currentDate = currentDate;
      this.rotationInfo.fileIndex = 0;
      this.rotationInfo.currentSize = 0;
      this.currentFilePath = this.getLogFilePath();
      return;
    }

    // 文件大小超过限制，创建新文件
    this.rotationInfo.fileIndex++;
    this.rotationInfo.currentSize = 0;
    this.currentFilePath = this.getLogFilePath();

    // 清理旧文件
    this.cleanupOldFiles();
  }

  /**
   * 获取当前日期字符串
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(): string {
    const { fileIndex, currentDate } = this.rotationInfo;
    const fileName = fileIndex > 0 ? `app-${currentDate}-${fileIndex}.jsonl` : `app-${currentDate}.jsonl`;
    return join(this.config.logDir!, fileName);
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    const logDir = this.config.logDir!;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 初始化当前文件（检查现有文件大小）
   */
  private initializeCurrentFile(): void {
    if (existsSync(this.currentFilePath)) {
      try {
        const stats = statSync(this.currentFilePath);
        this.rotationInfo.currentSize = stats.size;
      } catch (error) {
        // 如果无法获取文件大小，重置为0
        this.rotationInfo.currentSize = 0;
      }
    }
  }

  /**
   * 清理旧日志文件
   */
  private cleanupOldFiles(): void {
    const { maxFiles } = this.config;
    if (maxFiles === undefined || maxFiles <= 0) {
      return;
    }

    try {
      const logDir = this.config.logDir!;

      // 获取所有日志文件并按修改时间排序（最新的在前）
      const files = readdirSync(logDir)
        .filter((file: string) => file.startsWith('app-') && file.endsWith('.jsonl'))
        .map((file: string) => ({
          name: file,
          path: join(logDir, file),
          mtime: statSync(join(logDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // 最新的在前

      // 保留最新的 maxFiles 个文件，删除其余的
      if (files.length > maxFiles) {
        const filesToDelete = files.slice(maxFiles);
        for (const file of filesToDelete) {
          unlinkSync(file.path);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }
}

/**
 * 全局日志管理器
 *
 * 提供统一的日志器管理，避免重复配置读取和内存开销
 */
export class GlobalLoggerManager {
  private static instance: GlobalLoggerManager;
  private rootLogger: Logger;
  private childLoggers: Map<string, Logger> = new Map();

  private constructor() {
    this.rootLogger = new Logger();
  }

  /**
   * 获取全局日志管理器实例
   */
  static getInstance(): GlobalLoggerManager {
    if (!GlobalLoggerManager.instance) {
      GlobalLoggerManager.instance = new GlobalLoggerManager();
    }
    return GlobalLoggerManager.instance;
  }

  /**
   * 获取指定模块的日志器
   * @param moduleName 模块名称
   * @returns 模块专用日志器
   */
  getLogger(moduleName: string): Logger {
    if (!this.childLoggers.has(moduleName)) {
      const childLogger = this.rootLogger.child(moduleName);
      this.childLoggers.set(moduleName, childLogger);
    }
    return this.childLoggers.get(moduleName)!;
  }

  /**
   * 更新所有日志器的配置
   */
  updateAllConfigs(): void {
    this.rootLogger.updateFromAppConfig();
    // 子日志器会自动继承新的配置
  }

  /**
   * 获取根日志器（用于全局日志）
   */
  getRootLogger(): Logger {
    return this.rootLogger;
  }
}

/**
 * 默认日志器实例（向后兼容）
 */
export const logger = GlobalLoggerManager.getInstance().getRootLogger();

/**
 * 获取模块日志器的便捷函数
 */
export function getLogger(moduleName: string): Logger {
  return GlobalLoggerManager.getInstance().getLogger(moduleName);
}

/**
 * 创建日志器的便捷函数
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

/**
 * 创建模块专用日志器的便捷函数
 */
export function createModuleLogger(moduleName: string, config?: Partial<LoggerConfig>): Logger {
  const logger = new Logger(config);
  const originalLog = logger.log.bind(logger);
  logger.log = (level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) => {
    originalLog(level, message, { ...context, module: moduleName }, error);
  };
  return logger;
}

/**
 * 创建配置化的日志器（兼容ConfiguredLogger）
 * 这个函数会自动从配置文件读取日志配置
 */
export function createConfiguredLogger(moduleName: string, config?: Partial<LoggerConfig>): Logger {
  const logger = new Logger(config);
  const originalLog = logger.log.bind(logger);
  logger.log = (level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) => {
    originalLog(level, message, { ...context, module: moduleName }, error);
  };
  return logger;
}
