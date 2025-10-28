import { Logger, LogLevel, createLogger, createModuleLogger, logger } from '../Logger';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { rimraf } from 'rimraf';

describe('Logger', () => {
  const testLogDir = 'test-logs';

  beforeEach(() => {
    // 清理测试日志目录
    if (existsSync(testLogDir)) {
      rimraf.sync(testLogDir);
    }
  });

  afterEach(() => {
    // 清理测试日志目录
    if (existsSync(testLogDir)) {
      rimraf.sync(testLogDir);
    }
  });

  describe('基础功能', () => {
    test('应该创建Logger实例', () => {
      const testLogger = new Logger({
        level: LogLevel.DEBUG,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      expect(testLogger).toBeInstanceOf(Logger);
    });

    test('应该支持不同级别的日志', () => {
      const testLogger = new Logger({
        level: LogLevel.DEBUG,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      // 测试各种日志级别
      testLogger.error('错误消息');
      testLogger.warn('警告消息');
      testLogger.info('信息消息');
      testLogger.debug('调试消息');

      // 验证日志文件是否创建
      const logFiles = readdirSync(testLogDir);
      expect(logFiles.length).toBeGreaterThan(0);
      expect(logFiles[0]).toMatch(/^app-\d{4}-\d{2}-\d{2}\.jsonl$/);
    });

    test('应该根据日志级别过滤消息', () => {
      const testLogger = new Logger({
        level: LogLevel.WARN,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      testLogger.error('错误消息'); // 应该记录
      testLogger.warn('警告消息'); // 应该记录
      testLogger.info('信息消息'); // 不应该记录
      testLogger.debug('调试消息'); // 不应该记录

      // 读取日志文件内容
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logLines = logContent.trim().split('\n');

      // 应该只有2条记录（error和warn）
      expect(logLines.length).toBe(2);

      // 验证日志内容
      const logs = logLines.map(line => JSON.parse(line));
      expect(logs[0].level).toBe(LogLevel.ERROR);
      expect(logs[1].level).toBe(LogLevel.WARN);
    });
  });

  describe('结构化日志', () => {
    test('应该支持上下文数据', () => {
      const testLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      const context = {
        userId: 123,
        action: 'login',
        ip: '192.168.1.1',
      };

      testLogger.info('用户登录', context);

      // 读取并验证日志内容
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.message).toBe('用户登录');
      expect(logEntry.context).toEqual(context);
      expect(logEntry.level).toBe(LogLevel.INFO);
      expect(logEntry.timestamp).toBeDefined();
    });

    test('应该支持错误对象', () => {
      const testLogger = new Logger({
        level: LogLevel.ERROR,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      const error = new Error('测试错误');
      testLogger.error('发生错误', { operation: 'test' }, error);

      // 读取并验证日志内容
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.message).toBe('发生错误');
      expect(logEntry.error).toEqual({
        name: 'Error',
        message: '测试错误',
        stack: expect.stringContaining('Error: 测试错误'),
      });
      expect(logEntry.context.operation).toBe('test');
    });

    test('应该生成有效的JSONL格式', () => {
      const testLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      testLogger.info('消息1');
      testLogger.info('消息2', { key: 'value' });

      // 读取日志文件
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logLines = logContent.trim().split('\n');

      // 验证每行都是有效的JSON
      expect(logLines.length).toBe(2);
      logLines.forEach(line => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });
  });

  describe('模块专用日志器', () => {
    test('应该创建子日志器', () => {
      const parentLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      const childLogger = parentLogger.child('test-module');
      childLogger.info('模块消息');

      // 验证日志包含模块信息
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.context.module).toBe('test-module');
      expect(logEntry.message).toBe('模块消息');
    });

    test('应该支持便捷函数创建模块日志器', () => {
      const moduleLogger = createModuleLogger('auth-service', {
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      moduleLogger.warn('认证失败', { userId: 456 });

      // 验证日志包含模块信息
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.context.module).toBe('auth-service');
      expect(logEntry.context.userId).toBe(456);
      expect(logEntry.level).toBe(LogLevel.WARN);
    });
  });

  describe('日志轮转', () => {
    test('应该在小文件大小限制时创建新文件', () => {
      const testLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: testLogDir,
        maxFileSize: 100, // 很小的文件大小限制
        maxFiles: 3,
      });

      // 写入足够的日志以触发轮转
      for (let i = 0; i < 20; i++) {
        testLogger.info(`消息 ${i}`, { data: 'x'.repeat(30) }); // 增加消息大小
      }

      // 验证创建了多个日志文件
      const logFiles = readdirSync(testLogDir).filter(file => file.endsWith('.jsonl'));
      expect(logFiles.length).toBeGreaterThan(1);

      // 验证有多个不同的文件（说明轮转发生了）
      const uniqueFileNames = new Set(logFiles);
      expect(uniqueFileNames.size).toBeGreaterThan(1);
    });

    test('应该清理旧日志文件', () => {
      const testLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: testLogDir,
        maxFileSize: 40, // 更小的文件大小限制
        maxFiles: 2,
      });

      // 写入大量日志以创建多个文件并触发清理
      for (let i = 0; i < 50; i++) {
        testLogger.info(`消息 ${i}`, { data: 'x'.repeat(20) }); // 增加消息大小
      }

      // 验证文件数量被控制在合理范围内（考虑清理时机，可能会有maxFiles+1个文件）
      const logFiles = readdirSync(testLogDir).filter(file => file.endsWith('.jsonl'));
      expect(logFiles.length).toBeLessThanOrEqual(3); // 允许最多3个文件（maxFiles + 1）
    });
  });

  describe('配置管理', () => {
    test('应该支持配置更新', () => {
      const testLogger = new Logger({
        level: LogLevel.WARN,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      testLogger.info('不应该记录这条消息');
      testLogger.updateConfig({ level: LogLevel.DEBUG });
      testLogger.info('应该记录这条消息');

      // 验证只有更新后的消息被记录
      const logFiles = readdirSync(testLogDir);
      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logLines = logContent.trim().split('\n');

      expect(logLines.length).toBe(1);
      const logEntry = JSON.parse(logLines[0]);
      expect(logEntry.message).toBe('应该记录这条消息');
    });

    test('应该使用默认配置', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).toBeInstanceOf(Logger);
    });
  });

  describe('便捷函数', () => {
    test('createLogger应该创建配置好的日志器', () => {
      const customLogger = createLogger({
        level: LogLevel.DEBUG,
        console: false,
        file: true,
        logDir: testLogDir,
      });

      customLogger.debug('调试消息');

      const logFiles = readdirSync(testLogDir);
      expect(logFiles.length).toBe(1);

      const logContent = readFileSync(join(testLogDir, logFiles[0]), 'utf8');
      const logEntry = JSON.parse(logContent.trim());
      expect(logEntry.level).toBe(LogLevel.DEBUG);
    });

    test('默认logger应该可以正常工作', () => {
      // 测试默认logger（不会写入文件，只是确保不抛出异常）
      expect(() => {
        logger.info('测试默认logger');
      }).not.toThrow();
    });
  });

  describe('错误处理', () => {
    test('应该在文件写入失败时降级到控制台', () => {
      // 使用无效的日志目录路径
      const invalidLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: '/invalid/path/that/does/not/exist',
      });

      // 这应该不会抛出异常，而是降级到控制台输出
      expect(() => {
        invalidLogger.info('这条消息应该输出到控制台');
      }).not.toThrow();
    });
  });

  describe('目录管理', () => {
    test('应该自动创建日志目录', () => {
      const newLogDir = join(testLogDir, 'nested', 'directory');

      const testLogger = new Logger({
        level: LogLevel.INFO,
        console: false,
        file: true,
        logDir: newLogDir,
      });

      testLogger.info('测试消息');

      // 验证目录被创建
      expect(existsSync(newLogDir)).toBe(true);

      // 验证日志文件被创建
      const logFiles = readdirSync(newLogDir);
      expect(logFiles.length).toBe(1);
    });
  });
});
