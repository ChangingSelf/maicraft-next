/**
 * Logger使用示例
 *
 * 这个文件展示了如何使用Logger模块的各种功能
 */

import { Logger, LogLevel, createLogger, createModuleLogger } from './Logger.js';

// 基础使用示例
console.log('=== 基础使用示例 ===');

const logger = new Logger({
  level: LogLevel.INFO,
  console: true,
  file: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
});

logger.info('应用启动', { port: 3000, env: 'development' });
logger.warn('配置项缺失', { key: 'database_url' });
logger.error('连接失败', undefined, new Error('Network timeout'));

// 模块专用日志器示例
console.log('\n=== 模块专用日志器示例 ===');

const minecraftLogger = logger.child('minecraft');
const authLogger = createModuleLogger('auth');

minecraftLogger.info('玩家连接', { username: 'player1', ip: '192.168.1.100' });
authLogger.info('用户登录', { userId: 123, method: 'password' });

// 不同日志级别示例
console.log('\n=== 不同日志级别示例 ===');

const debugLogger = createLogger({
  level: LogLevel.DEBUG,
  console: true,
  file: false,
});

debugLogger.debug('调试信息', { variable: 'value', step: 1 });
debugLogger.info('正常信息');
debugLogger.warn('警告信息');
debugLogger.error('错误信息');

// 配置更新示例
console.log('\n=== 配置更新示例 ===');

logger.updateConfig({ level: LogLevel.ERROR });
logger.info('这条信息不会显示（级别太低）');
logger.error('这条错误会显示（级别够高）');

// 恢复配置
logger.updateConfig({ level: LogLevel.INFO });

// 关闭日志器
logger.close();

console.log('\n=== 示例完成 ===');
console.log('请查看logs目录下的日志文件以了解文件输出格式');
