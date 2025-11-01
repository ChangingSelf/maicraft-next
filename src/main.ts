/**
 * Maicraft-Next Main Entry Point
 *
 * 集成完整的AI代理系统，包括：
 * - 核心基础设施（GameState, ActionExecutor, EventEmitter）
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

// 核心系统
import { globalGameState } from '@/core/state/GameState';
import { ActionExecutor } from '@/core/actions/ActionExecutor';
import { BlockCache } from '@/core/cache/BlockCache';
import { ContainerCache } from '@/core/cache/ContainerCache';
import { LocationManager } from '@/core/location/LocationManager';

// 动作实现
import {
  ChatAction,
  MoveAction,
  FindBlockAction,
  MineBlockAction,
  MineBlockByPositionAction,
  PlaceBlockAction,
  CraftItemAction,
} from './core/actions/implementations';

// AI代理系统
import { Agent } from '@/core/agent/Agent';

// LLM管理器
import { LLMManager, createLLMManager } from '@/llm/LLMManager';

// 工具类
import { initializeConfig, getSection, getConfig, type AppConfig } from '@/utils/Config';
import { getLogger, createLogger, LogLevel, type Logger } from '@/utils/Logger';

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
  private bot?: Bot;
  private config?: AppConfig;
  private logger: Logger = createLogger();
  private executor?: ActionExecutor;
  private agent?: Agent;
  private llmManager?: LLMManager;
  private blockCache?: BlockCache;
  private containerCache?: ContainerCache;
  private locationManager?: LocationManager;

  private isShuttingDown = false;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;

  /**
   * 初始化应用程序
   */
  async initialize(): Promise<void> {
    try {
      // 加载配置
      await this.loadConfiguration();

      this.logger.info('🚀 Maicraft-Next 正在启动...');
      this.logger.info(`版本: ${this.config!.app.version}`);

      // 初始化LLM管理器
      await this.initializeLLM();

      // 连接到Minecraft服务器
      await this.connectToMinecraft();

      // 初始化核心系统
      await this.initializeCore();

      // 初始化AI代理
      await this.initializeAgent();

      // 启动AI代理
      await this.startAgent();

      this.logger.info('✅ Maicraft-Next 启动完成');
      this.logger.info('AI代理现在正在运行...');
    } catch (error) {
      this.logger.error('初始化失败', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 加载配置文件
   */
  private async loadConfiguration(): Promise<void> {
    try {
      this.config = await initializeConfig('./config.toml', './config-template.toml');
      this.logger.info('✅ 配置加载成功');
    } catch (error) {
      this.logger.error('❌ 配置加载失败', undefined, error as Error);
      throw new Error('无法加载配置文件，请检查 config.toml 是否存在且格式正确');
    }
  }

  /**
   * 初始化LLM管理器
   */
  private async initializeLLM(): Promise<void> {
    if (!this.config || !this.logger) {
      throw new Error('配置或日志系统未初始化');
    }

    try {
      this.llmManager = createLLMManager(this.config.llm, this.logger);
      this.logger.info('✅ LLM管理器初始化完成', {
        provider: this.llmManager.getActiveProvider(),
      });

      // 执行健康检查
      const health = await this.llmManager.healthCheck();
      this.logger.info('LLM提供商健康检查', { health });
    } catch (error) {
      this.logger.error('LLM管理器初始化失败', undefined, error as Error);
      throw error;
    }
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

        // 初始化插件设置
        this.initializePluginSettings();

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
   * 初始化插件设置（在spawn后调用）
   */
  private initializePluginSettings(): void {
    if (!this.bot || !this.config || !this.logger) {
      this.logger?.error('Bot、配置或日志系统未初始化');
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
   * 设置Bot事件监听
   */
  private setupBotEvents(): void {
    if (!this.bot || !this.logger) {
      return;
    }

    // 连接状态事件
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

    // 游戏事件
    this.bot.on('death', () => {
      this.logger.error('💀 Agent死亡');
    });

    this.bot.on('respawn', () => {
      this.logger.info('🎮 Agent重生');
    });

    this.bot.on('health', () => {
      if (this.bot!.health < 6) {
        this.logger.warn(`⚠️ 生命值低: ${this.bot!.health}/20`);
      }
      if (this.bot!.food < 6) {
        this.logger.warn(`⚠️ 饥饿值低: ${this.bot!.food}/20`);
      }
    });
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

    // 停止当前agent
    if (this.agent) {
      await this.agent.stop();
    }

    // 重新连接到Minecraft
    await this.connectToMinecraft();

    // 重新初始化核心系统
    await this.initializeCore();

    // 重新初始化agent
    await this.initializeAgent();

    // 启动agent
    await this.startAgent();

    this.reconnectAttempts = 0;
    this.logger.info('✅ 重连成功');
  }

  /**
   * 初始化核心系统
   */
  private async initializeCore(): Promise<void> {
    if (!this.bot || !this.logger) {
      throw new Error('Bot或日志系统未初始化');
    }

    this.logger.info('初始化核心系统...');

    // 1. GameState已在bot连接时自动初始化
    // globalGameState 是全局实例，在 bot 登录时自动更新
    this.logger.info('✅ GameState已就绪');

    // 2. 创建缓存管理器
    this.blockCache = new BlockCache();
    this.containerCache = new ContainerCache();
    this.locationManager = new LocationManager();
    this.logger.info('✅ 缓存管理器初始化完成');

    // 3. 创建ActionExecutor
    this.executor = new ActionExecutor(this.bot, this.logger, this.config as any);

    this.executor.setBlockCache(this.blockCache);
    this.executor.setContainerCache(this.containerCache);
    this.executor.setLocationManager(this.locationManager);
    this.logger.info('✅ ActionExecutor初始化完成');

    // 4. 注册所有动作
    this.registerActions();

    // 5. 设置事件监听
    const events = this.executor.getEventEmitter();

    events.on('actionComplete', data => {
      this.logger.debug(`动作完成: ${data.actionName}`, {
        duration: data.duration,
        result: data.result.message,
      });
    });

    events.on('actionError', data => {
      this.logger.error(`动作错误: ${data.actionName}`, undefined, data.error);
    });

    this.logger.info('✅ 核心系统初始化完成');
  }

  /**
   * 注册所有动作
   */
  private registerActions(): void {
    if (!this.executor) {
      throw new Error('ActionExecutor未初始化');
    }

    const actions = [
      new ChatAction(),
      new MoveAction(),
      new FindBlockAction(),
      new MineBlockAction(),
      new MineBlockByPositionAction(),
      new PlaceBlockAction(),
      new CraftItemAction(),
    ];

    this.executor.registerAll(actions);
    this.logger.info(`✅ 已注册 ${actions.length} 个动作`);
  }

  /**
   * 初始化AI代理
   */
  private async initializeAgent(): Promise<void> {
    if (!this.bot || !this.executor || !this.llmManager || !this.config || !this.logger) {
      throw new Error('必要组件未初始化');
    }

    this.logger.info('初始化AI代理系统...');

    // 创建Agent
    this.agent = new Agent(this.bot, this.executor, this.llmManager, this.config, this.logger);

    // 初始化Agent（加载内存、计划等）
    await this.agent.initialize();

    this.logger.info('✅ AI代理初始化完成');
  }

  /**
   * 启动AI代理
   */
  private async startAgent(): Promise<void> {
    if (!this.agent) {
      throw new Error('Agent未初始化');
    }

    this.logger.info('启动AI代理...');

    await this.agent.start();

    this.logger.info('✅ AI代理已启动');
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

    // 1. 停止Agent
    if (this.agent) {
      try {
        await this.agent.stop();
        this.logger?.info('✅ Agent已停止');
      } catch (error) {
        this.logger?.error('停止Agent时出错', undefined, error as Error);
      }
    }

    // 2. 关闭LLM管理器
    if (this.llmManager) {
      try {
        this.llmManager.close();
        this.logger?.info('✅ LLM管理器已关闭');
      } catch (error) {
        this.logger?.error('关闭LLM管理器时出错', undefined, error as Error);
      }
    }

    // 3. 清理GameState
    if (globalGameState) {
      try {
        globalGameState.cleanup();
        this.logger?.info('✅ GameState已清理');
      } catch (error) {
        this.logger?.error('清理GameState时出错', undefined, error as Error);
      }
    }

    // 4. 断开Bot连接
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
