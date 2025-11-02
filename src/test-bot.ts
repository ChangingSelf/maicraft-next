/**
 * maicraft-next 测试入口点
 *
 * 用于测试 Phase 1 + Phase 2 的实现
 * - 连接到 Minecraft 服务器
 * - 初始化核心系统
 * - 注册所有 P0 动作
 * - 提供测试命令接口
 */

import { createBot, Bot } from 'mineflayer';
import { globalGameState, ActionExecutor, ActionIds } from './core';
import { BlockCache } from './core/cache/BlockCache';
import { ContainerCache } from './core/cache/ContainerCache';
import { LocationManager } from './core/cache/LocationManager';
import { getLogger } from './utils/Logger';
import {
  ChatAction,
  MoveAction,
  FindBlockAction,
  MineBlockAction,
  MineBlockByPositionAction,
  MineInDirectionAction,
  PlaceBlockAction,
  CraftItemAction,
  UseChestAction,
  UseFurnaceAction,
  EatAction,
  TossItemAction,
  KillMobAction,
  SwimToLandAction,
  SetLocationAction,
} from './core/actions/implementations';
import { initializeConfig, getSection } from './utils/Config';

// 加载配置文件
let config: any;

async function loadConfig() {
  try {
    await initializeConfig('./config.toml');
    const mcConfig = getSection('minecraft');
    config = {
      host: mcConfig.host,
      port: mcConfig.port,
      username: mcConfig.username,
      version: false, // false 表示自动检测
    };
    console.log('✅ 已从 config.toml 加载配置');
  } catch (error) {
    console.warn('⚠️ 无法加载 config.toml，使用默认配置:', (error as Error).message);
    // 回退到默认配置
    config = {
      host: process.env.MC_HOST || 'localhost',
      port: parseInt(process.env.MC_PORT || '25565'),
      username: process.env.MC_USERNAME || 'maicraft_test_bot',
      version: false,
    };
  }
}

// 使用项目的 Logger 系统
const logger = getLogger('test-bot');

/**
 * 主类
 */
class MaicraftTestBot {
  private bot!: Bot;
  private executor!: ActionExecutor;
  private blockCache!: BlockCache;
  private containerCache!: ContainerCache;
  private locationManager!: LocationManager;

  /**
   * 初始化并连接
   */
  async initialize() {
    logger.info('🚀 maicraft-next 测试 Bot 启动');
    logger.info(`连接到服务器: ${config.host}:${config.port}`);

    // 创建 bot
    this.bot = createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version as any,
    });

    // 设置事件监听
    this.setupBotEvents();

    // 等待 bot 登录
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 30000);

      this.bot.once('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.bot.once('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    logger.info('✅ Bot 已登录并重生');

    // 初始化核心系统
    await this.initializeCore();

    // 设置命令处理
    this.setupCommands();

    logger.info('✅ 测试 Bot 准备就绪');
    logger.info('发送 "!help" 查看可用命令');
  }

  /**
   * 设置 bot 事件监听
   */
  private setupBotEvents() {
    this.bot.on('error', err => {
      logger.error('Bot 错误:', err);
    });

    this.bot.on('end', reason => {
      logger.warn('Bot 断开连接:', reason);
    });

    this.bot.on('kicked', reason => {
      logger.warn('Bot 被踢出:', reason);
    });

    this.bot.on('death', () => {
      logger.error('💀 Bot 死亡');
      // 自动重生
      setTimeout(() => {
        this.bot.chat('/respawn');
      }, 1000);
    });

    this.bot.on('spawn', () => {
      logger.info('🎮 Bot 重生');
    });
  }

  /**
   * 初始化核心系统
   */
  private async initializeCore() {
    logger.info('初始化核心系统...');

    // 1. 初始化 GameState
    globalGameState.initialize(this.bot);
    logger.info('✅ GameState 初始化完成');

    // 2. 创建上下文管理器
    const contextManager = new ContextManager();
    contextManager.createContext({
      bot: this.bot,
      executor: null as any, // 先传 null，稍后注入真正的 executor
      config: {},
      logger,
    });
    logger.info('✅ ContextManager 创建完成');

    // 3. 创建 ActionExecutor
    this.executor = new ActionExecutor(contextManager, logger);

    // 更新 ContextManager 中的 executor 引用
    contextManager.updateExecutor(this.executor);
    logger.info('✅ ActionExecutor 创建完成');

    // 4. 注册所有 P0 动作
    this.registerActions();

    // 5. 设置事件监听
    const events = this.executor.getEventEmitter();

    events.on('actionComplete', data => {
      logger.info(`✅ 动作完成: ${data.actionName} (${data.duration}ms)`);
    });

    events.on('actionError', data => {
      logger.error(`❌ 动作错误: ${data.actionName}`, data.error);
    });

    events.on('health', data => {
      if (data.health < 6) {
        logger.warn(`⚠️ 生命值过低: ${data.health}/20`);
      }
      if (data.food < 6) {
        logger.warn(`⚠️ 饥饿值过低: ${data.food}/20`);
      }
    });

    logger.info('✅ 事件监听设置完成');
  }

  /**
   * 注册所有动作
   */
  private registerActions() {
    logger.info('注册动作...');

    const actions = [
      // P0 核心动作
      new ChatAction(),
      new MoveAction(),
      new FindBlockAction(),
      new MineBlockAction(),
      new MineBlockByPositionAction(),
      new PlaceBlockAction(),
      new CraftItemAction(),
      new MineInDirectionAction(),

      // 容器操作
      new UseChestAction(),
      new UseFurnaceAction(),

      // 生存相关
      new EatAction(),
      new TossItemAction(),
      new KillMobAction(),

      // 移动和探索
      new SwimToLandAction(),

      // 地标管理
      new SetLocationAction(),
    ];

    this.executor.registerAll(actions);

    logger.info(`✅ 已注册 ${actions.length} 个动作`);
  }

  /**
   * 设置命令处理
   */
  private setupCommands() {
    this.bot.on('chat', async (username, message) => {
      // 忽略自己的消息
      if (username === this.bot.username) return;

      // 只处理以 ! 开头的命令
      if (!message.startsWith('!')) return;

      const args = message.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();

      logger.info(`收到命令: ${command} from ${username}`);

      try {
        await this.handleCommand(command, args.slice(1), username);
      } catch (error) {
        logger.error('命令执行失败:', error);
        this.bot.chat(`命令执行失败: ${(error as Error).message}`);
      }
    });
  }

  /**
   * 处理命令
   */
  private async handleCommand(command: string, args: string[], username: string) {
    switch (command) {
      case 'help':
        this.bot.chat('可用命令:');
        this.bot.chat('!status - 显示状态');
        this.bot.chat('!pos - 显示位置');
        this.bot.chat('!move <x> <y> <z> - 移动到坐标');
        this.bot.chat('!find <block> - 寻找方块');
        this.bot.chat('!mine <block> [count] - 挖掘方块');
        this.bot.chat('!craft <item> [count] - 合成物品');
        this.bot.chat('!actions - 显示所有动作');
        this.bot.chat('!chat <message> - 发送消息');
        break;

      case 'status':
        this.bot.chat(`生命: ${globalGameState.health}/20, 饥饿: ${globalGameState.food}/20`);
        this.bot.chat(`等级: ${globalGameState.level}, 经验: ${globalGameState.experience}`);
        break;
      case 'chat':
        if (args.length < 1) {
          this.bot.chat('用法: !chat <message>');
          return;
        }
        await this.executor.execute(ActionIds.CHAT, {
          message: args[0],
        });
        break;

      case 'pos':
        const pos = globalGameState.blockPosition;
        this.bot.chat(`位置: (${pos.x}, ${pos.y}, ${pos.z})`);
        break;

      case 'move':
        if (args.length < 3) {
          this.bot.chat('用法: !move <x> <y> <z>');
          return;
        }
        await this.executor.execute(ActionIds.MOVE, {
          x: parseFloat(args[0]),
          y: parseFloat(args[1]),
          z: parseFloat(args[2]),
        });
        break;

      case 'find':
        if (args.length < 1) {
          this.bot.chat('用法: !find <block>');
          return;
        }
        await this.executor.execute(ActionIds.FIND_BLOCK, {
          block: args[0],
          radius: 16,
        });
        break;

      case 'mine':
        if (args.length < 1) {
          this.bot.chat('用法: !mine <block> [count]');
          return;
        }
        await this.executor.execute(ActionIds.MINE_BLOCK, {
          name: args[0],
          count: args[1] ? parseInt(args[1]) : 1,
        });
        break;

      case 'craft':
        if (args.length < 1) {
          this.bot.chat('用法: !craft <item> [count]');
          return;
        }
        await this.executor.execute(ActionIds.CRAFT, {
          item: args[0],
          count: args[1] ? parseInt(args[1]) : 1,
        });
        break;

      case 'actions':
        const actions = this.executor.getRegisteredActions();
        this.bot.chat(`已注册 ${actions.length} 个动作:`);
        actions.forEach(action => {
          this.bot.chat(`- ${action.id}: ${action.description}`);
        });
        break;

      default:
        this.bot.chat(`未知命令: ${command}`);
        this.bot.chat('发送 !help 查看可用命令');
    }
  }
}

/**
 * 主函数
 */
async function main() {
  // 先加载配置
  await loadConfig();

  const testBot = new MaicraftTestBot();

  try {
    await testBot.initialize();
  } catch (error) {
    logger.error('初始化失败:', error);
    process.exit(1);
  }
}

// 启动
main().catch(error => {
  logger.error('程序异常:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('\n👋 正在关闭...');
  process.exit(0);
});
