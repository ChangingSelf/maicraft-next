/**
 * 配置系统使用示例
 *
 * 这个文件展示了如何使用配置系统的各种功能
 */

import {
  ConfigManager,
  initializeConfig,
  getConfig,
  getSection,
  updateConfig
} from '../utils/Config';
import { createConfiguredLogger } from '../utils/Logger';

async function basicUsageExample() {
  console.log('=== 基本使用示例 ===');

  // 1. 初始化配置系统
  const config = await initializeConfig();
  console.log('配置加载成功:', config.app.name, config.app.version);

  // 2. 获取完整配置
  const fullConfig = getConfig();
  console.log('Minecraft服务器配置:', {
    host: fullConfig.minecraft.host,
    port: fullConfig.minecraft.port,
    username: fullConfig.minecraft.username
  });

  // 3. 获取特定配置段
  const loggingConfig = getSection('logging');
  console.log('日志配置:', {
    level: loggingConfig.level,
    console: loggingConfig.console,
    file: loggingConfig.file
  });

  // 4. 创建配置化的日志器
  const logger = createConfiguredLogger('Example');
  logger.info('这是一个配置化的日志消息');
  logger.debug('调试信息', { config: config.app.debug });
}

async function configUpdateExample() {
  console.log('\n=== 配置更新示例 ===');

  // 1. 获取配置管理器
  const configManager = new ConfigManager();

  // 2. 加载配置
  await configManager.loadConfig();

  // 3. 监听配置变化
  configManager.on('configChanged', (newConfig) => {
    console.log('配置已更新:', {
      debug: newConfig.app.debug,
      logLevel: newConfig.logging.level
    });
  });

  // 4. 更新配置
  await configManager.updateConfig({
    app: {
      debug: true
    },
    logging: {
      level: 'debug'
    }
  });

  // 5. 验证更新结果
  const updatedConfig = configManager.getConfig();
  console.log('更新后的配置:', {
    debug: updatedConfig.app.debug,
    logLevel: updatedConfig.logging.level
  });

  configManager.close();
}

async function hotReloadExample() {
  console.log('\n=== 热重载示例 ===');

  // 1. 创建支持热重载的配置管理器
  const configManager = new ConfigManager();

  // 2. 加载配置
  const config = await configManager.loadConfig();

  if (config.advanced.hot_reload) {
    console.log('热重载已启用');

    // 3. 监听重载事件
    configManager.on('configReloaded', (newConfig) => {
      console.log('配置已重新加载:', newConfig.app.name);

      // 更新日志器配置
      const logger = createConfiguredLogger('HotReloadExample');
      logger.updateFromAppConfig();
      logger.info('日志器配置已更新');
    });

    console.log('现在请修改 config.toml 文件，系统将自动重新加载配置');
    console.log('按 Ctrl+C 退出示例');

    // 保持程序运行以监听文件变化
    return new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log('\n关闭热重载示例');
        configManager.close();
        resolve();
      });
    });
  } else {
    console.log('热重载未启用，请在配置文件中设置 advanced.hot_reload = true');
    configManager.close();
  }
}

async function errorHandlingExample() {
  console.log('\n=== 错误处理示例 ===');

  // 1. 尝试使用不存在的配置文件
  try {
    const configManager = new ConfigManager('./non-existent-config.toml', './non-existent-template.toml');
    await configManager.loadConfig();
  } catch (error) {
    console.log('预期的错误:', error instanceof Error ? error.message : String(error));
  }

  // 2. 创建格式错误的配置文件
  const { writeFileSync } = await import('fs');
  writeFileSync('./invalid-config.toml', '[invalid toml content');

  try {
    const configManager = new ConfigManager('./invalid-config.toml');
    const config = await configManager.loadConfig();
    console.log('使用默认配置:', config.app.name);
  } catch (error) {
    console.log('处理格式错误:', error instanceof Error ? error.message : String(error));
  }

  // 清理
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync('./invalid-config.toml');
  } catch {
    // 忽略清理错误
  }
}

async function configurationMigrationExample() {
  console.log('\n=== 配置迁移示例 ===');

  // 1. 创建旧版配置文件（假设的旧格式）
  const oldConfigContent = `
[app]
name = "old-maicraft"
debug = true

[minecraft]
server = "localhost"
port = 25565
`;

  const { writeFileSync } = await import('fs');
  writeFileSync('./old-config.toml', oldConfigContent);

  // 2. 创建配置管理器并检测旧配置
  const configManager = new ConfigManager('./old-config.toml');

  try {
    const config = await configManager.loadConfig();

    // 3. 迁移配置到新格式
    const migratedConfig = {
      ...config,
      app: {
        ...config.app,
        name: 'maicraft-next', // 更新应用名称
        version: '0.1.0'      // 添加版本号
      },
      minecraft: {
        host: 'localhost',     // 重命名字段
        port: 25565,
        username: 'MigratedBot',
        password: '',
        auth: 'offline',
        reconnect: true,
        reconnect_delay: 5000,
        max_reconnect_attempts: 5,
        timeout: 30000,
        keep_alive: true
      }
    };

    await configManager.updateConfig(migratedConfig);
    console.log('配置迁移完成');

    // 4. 验证迁移结果
    const newConfig = configManager.getConfig();
    console.log('迁移后的配置:', {
      name: newConfig.app.name,
      version: newConfig.app.version,
      host: newConfig.minecraft.host,
      username: newConfig.minecraft.username
    });

  } catch (error) {
    console.log('配置迁移失败:', error instanceof Error ? error.message : String(error));
  } finally {
    configManager.close();

    // 清理
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync('./old-config.toml');
    } catch {
      // 忽略清理错误
    }
  }
}

async function main() {
  console.log('配置系统使用示例\n');

  try {
    await basicUsageExample();
    await configUpdateExample();
    await errorHandlingExample();
    await configurationMigrationExample();

    // 热重载示例需要用户交互，放在最后
    // await hotReloadExample();

  } catch (error) {
    console.error('示例执行出错:', error);
  }

  console.log('\n示例执行完成');
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  main().catch(console.error);
}

export {
  basicUsageExample,
  configUpdateExample,
  hotReloadExample,
  errorHandlingExample,
  configurationMigrationExample
};