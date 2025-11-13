/**
 * Maicraft-Next Main Entry Point
 *
 * 集成完整的AI代理系统，包括：
 * - 核心基础设施（GameState, ActionExecutor, EventManager）
 * - AI代理系统（Agent, Memory, Planning, Mode, Loops）
 * - LLM集成
 * - 配置管理
 * - 日志系统
 */

import { createBot, Bot } from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder-mai';
import armorManager from 'mineflayer-armor-manager';
import { plugin as pvpPlugin } from 'mineflayer-pvp';
import { plugin as toolPlugin } from 'mineflayer-tool';
import { plugin as collectBlock } from 'mineflayer-collectblock-colalab';

// 依赖注入
import { Container, ServiceKeys, configureServices } from '@/core/di';
import type { Agent } from '@/core/agent/Agent';
import type { WebSocketServer } from '@/api/WebSocketServer';

// 工具类
import { type AppConfig } from '@/utils/Config';
import { createLogger, LogLevel, type Logger } from '@/utils/Logger';
import { ConfigLoader } from '@/utils/Config';

/**
 * 基础错误日志记录器（在配置加载前使用）
 */
const basicErrorLogger: Logger = createLogger({
  level: LogLevel.INFO,
  console: true,
  file: false,
});

/**
 * 主应用程序类
 */
class MaicraftNext {
  private container!: Container;
  private bot?: Bot;
  private config?: AppConfig;
  private logger: Logger = createLogger();

  private isShuttingDown = false;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;

  /**
   * 初始化应用程序
   */
  async initialize(): Promise<void> {
    try {
      // 1. 使用 ConfigLoader 加载配置
      const configLoader = new ConfigLoader();
      this.config = await configLoader.loadDefaultConfig();

      this.logger.info('🚀 Maicraft-Next 正在启动...');
      this.logger.info(`版本: ${this.config!.app.version}`);

      // 2. 创建 DI 容器
      this.container = new Container(this.logger);

      // 3. 连接到Minecraft服务器
      await this.connectToMinecraft();

      // 4. 注册基础服务到容器
      this.container.registerInstance(ServiceKeys.Config, this.config!);
      this.container.registerInstance(ServiceKeys.Logger, this.logger);
      this.container.registerInstance(ServiceKeys.Bot, this.bot!);

      // 5. 配置所有其他服务
      configureServices(this.container);

      // 6. 初始化插件设置
      this.initializePluginSettings();

      // 7. 启动 WebSocket 服务器
      await this.container.resolveAsync<WebSocketServer>(ServiceKeys.WebSocketServer);
      this.logger.info('✅ WebSocket服务器启动完成');

      // 8. 启动 Agent 并连接 WebSocket
      const agent = await this.container.resolveAsync<Agent>(ServiceKeys.Agent);
      const wsServer = this.container.resolve<WebSocketServer>(ServiceKeys.WebSocketServer);

      // 连接 Agent 和 WebSocket 服务器
      agent.setWebSocketServer(wsServer);
      wsServer.setMemoryManager(agent.getMemoryManager());

      await agent.start();
      this.logger.info('✅ Agent已启动');

      this.logger.info('✅ Maicraft-Next 启动完成');
      this.logger.info('AI代理现在正在运行...');
    } catch (error) {
      this.logger.error('初始化失败', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 获取WebSocket服务器实例
   */
  getWebSocketServer(): WebSocketServer | undefined {
    return this.container?.resolve<WebSocketServer>(ServiceKeys.WebSocketServer);
  }

  /**
   * 连接到Minecraft服务器
   */
  private async connectToMinecraft(): Promise<void> {
    if (!this.config || !this.logger) {
      throw new Error('配置或日志系统未初始化');
    }

    const mcConfig = this.config.minecraft;

    this.logger.info('连接到Minecraft服务器', {
      host: mcConfig.host,
      port: mcConfig.port,
      username: mcConfig.username,
    });

    // 创建bot
    this.bot = createBot({
      host: mcConfig.host,
      port: mcConfig.port,
      username: mcConfig.username,
      password: mcConfig.password || undefined,
      auth: mcConfig.auth,
    });

    // 加载插件
    this.loadPlugins();

    // 设置事件监听
    this.setupBotEvents();

    // 等待登录
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, mcConfig.timeout);

      this.bot!.once('spawn', () => {
        clearTimeout(timeout);
        this.logger.info('✅ 成功连接到服务器并重生');

        resolve();
      });

      this.bot!.once('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 加载Mineflayer插件
   */
  private loadPlugins(): void {
    if (!this.bot || !this.logger) {
      throw new Error('Bot或日志系统未初始化');
    }

    // 加载所有必需的mineflayer插件

    // Pathfinder（必需）
    this.bot.loadPlugin(pathfinder);
    this.logger.info('✅ 加载插件: pathfinder');

    // Armor Manager
    this.bot.loadPlugin(armorManager);
    this.logger.info('✅ 加载插件: armor-manager');

    // PvP
    this.bot.loadPlugin(pvpPlugin);
    this.logger.info('✅ 加载插件: pvp');

    // Tool
    this.bot.loadPlugin(toolPlugin);
    this.logger.info('✅ 加载插件: tool');

    // CollectBlock
    this.bot.loadPlugin(collectBlock);
    this.logger.info('✅ 加载插件: collectblock');
  }

  /**
   * 初始化插件设置
   */
  private initializePluginSettings(): void {
    if (!this.bot || !this.config) {
      this.logger.error('Bot或配置未初始化');
      return;
    }

    try {
      // 1. 设置 pathfinder movements
      if (this.bot.pathfinder) {
        const defaultMove = new Movements(this.bot);

        // 设置不能破坏的方块列表
        const blocksCantBreakIds = new Set<number>();
        const defaultBlocks = ['chest', 'furnace', 'crafting_table', 'bed']; // 默认不能破坏的方块
        const blockNames = this.config.plugins.pathfinder?.blocks_cant_break || defaultBlocks;

        this.logger.info(`配置移动过程中不能破坏的方块列表: ${blockNames.join(', ')}`);

        for (const blockName of blockNames) {
          const block = this.bot.registry.blocksByName[blockName];
          if (block) {
            blocksCantBreakIds.add(block.id);
            this.logger.debug(`已添加移动过程中不能破坏的方块: ${blockName} (ID: ${block.id})`);
          } else {
            this.logger.warn(`未知的方块名称: ${blockName}`);
          }
        }

        defaultMove.blocksCantBreak = blocksCantBreakIds;
        this.bot.pathfinder.setMovements(defaultMove);

        this.logger.info('✅ Pathfinder movements 初始化完成');
      }

      // 2. 设置 collectBlock movements
      if ((this.bot as any).collectBlock && this.bot.pathfinder) {
        (this.bot as any).collectBlock.movements = this.bot.pathfinder.movements;
        this.logger.info('✅ CollectBlock movements 已同步');
      }

      // 3. 装备所有护甲
      if (this.bot.armorManager) {
        this.bot.armorManager.equipAll();
        this.logger.info('✅ ArmorManager 自动装备已启用');
      }

      this.logger.info('✅ 所有插件设置初始化完成');
    } catch (error) {
      this.logger.error('初始化插件设置时发生错误', undefined, error as Error);
    }
  }

  /**
   * 设置Bot事件监听（仅连接相关）
   */
  private setupBotEvents(): void {
    if (!this.bot || !this.logger) {
      return;
    }

    // 连接状态事件（main.ts 只负责连接管理，不处理游戏逻辑）
    this.bot.on('error', error => {
      this.logger.error('Bot错误', undefined, error as Error);
    });

    this.bot.on('kicked', reason => {
      this.logger.warn('被服务器踢出', { reason });
      this.handleDisconnect('kicked');
    });

    this.bot.on('end', reason => {
      this.logger.warn('连接断开', { reason });
      this.handleDisconnect('ended');
    });

    // 游戏事件监听已移至 Agent.ts，由 Agent 统一处理游戏逻辑
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(reason: string): void {
    if (this.isShuttingDown) {
      return;
    }

    const mcConfig = this.config!.minecraft;

    if (!mcConfig.reconnect) {
      this.logger.info('自动重连已禁用，程序将退出');
      this.shutdown();
      return;
    }

    if (this.reconnectAttempts >= mcConfig.max_reconnect_attempts) {
      this.logger.error('达到最大重连次数，程序将退出');
      this.shutdown();
      return;
    }

    this.reconnectAttempts++;
    this.logger.info(`将在 ${mcConfig.reconnect_delay}ms 后尝试重连 (${this.reconnectAttempts}/${mcConfig.max_reconnect_attempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.reconnect();
      } catch (error) {
        this.logger.error('重连失败', undefined, error as Error);
        this.handleDisconnect('reconnect_failed');
      }
    }, mcConfig.reconnect_delay);
  }

  /**
   * 重新连接
   */
  private async reconnect(): Promise<void> {
    this.logger.info('正在重新连接...');

    // 销毁旧容器
    if (this.container) {
      await this.container.dispose();
    }

    // 重新初始化
    await this.initialize();

    this.reconnectAttempts = 0;
    this.logger.info('✅ 重连成功');
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger?.info('👋 正在关闭Maicraft-Next...');

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // 1. 销毁容器（会自动调用所有服务的 disposer）
    if (this.container) {
      try {
        await this.container.dispose();
        this.logger?.info('✅ 容器已销毁');
      } catch (error) {
        this.logger?.error('销毁容器时出错', undefined, error as Error);
      }
    }

    // 2. 断开Bot连接
    if (this.bot) {
      try {
        this.bot.quit('Shutting down');
        this.logger?.info('✅ Bot连接已断开');
      } catch (error) {
        this.logger?.error('断开Bot连接时出错', undefined, error as Error);
      }
    }

    this.logger?.info('✅ Maicraft-Next 已关闭');

    // 等待日志写入完成
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const app = new MaicraftNext();

  // 设置信号处理
  const shutdownHandler = async (signal: string) => {
    try {
      await app.shutdown();
      process.exit(0);
    } catch (error) {
      console.error('关闭时出错:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

  // 捕获未处理的异常
  process.on('uncaughtException', error => {
    basicErrorLogger.error('未捕获的异常', undefined, error);
    app.shutdown().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    basicErrorLogger.error('未处理的Promise拒绝', undefined, err);
    app.shutdown().then(() => process.exit(1));
  });

  // 启动应用
  try {
    await app.initialize();
  } catch (error) {
    basicErrorLogger.error('启动失败', undefined, error as Error);
    await app.shutdown();
    process.exit(1);
  }
}

// 启动程序
if (require.main === module) {
  main().catch(error => {
    basicErrorLogger.error('程序异常', undefined, error as Error);
    process.exit(1);
  });
}

export { MaicraftNext };
