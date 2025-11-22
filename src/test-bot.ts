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
import { pathfinder, Movements } from 'mineflayer-pathfinder-mai';
import armorManager from 'mineflayer-armor-manager';
import { plugin as pvpPlugin } from 'mineflayer-pvp';
import { plugin as toolPlugin } from 'mineflayer-tool';
import { plugin as collectBlock } from 'mineflayer-collectblock-colalab';
import { ActionExecutor, ActionIds } from './core';
import { BlockCache } from './core/cache/BlockCache';
import { ContainerCache } from './core/cache/ContainerCache';
import { LocationManager } from './core/cache/LocationManager';
import { ContextManager } from './core/context/ContextManager';
import { getLogger } from './utils/Logger';
import { PlaceBlockUtils } from './utils/PlaceBlockUtils';
import { MovementUtils } from './utils/MovementUtils';
import {
  ChatAction,
  MoveAction,
  FindBlockAction,
  MineAtPositionAction,
  MineByTypeAction,
  MineInDirectionAction,
  PlaceBlockAction,
  CraftItemAction,
  UseChestAction,
  UseFurnaceAction,
  QueryContainerAction,
  ManageContainerAction,
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
  private contextManager!: ContextManager;

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

    // 加载插件
    this.loadPlugins();

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
      logger.error('Bot 错误:', {}, err);
    });

    this.bot.on('end', reason => {
      logger.warn('Bot 断开连接:', { reason });
    });

    this.bot.on('kicked', reason => {
      logger.warn('Bot 被踢出:', { reason });
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
   * 加载Mineflayer插件
   */
  private loadPlugins(): void {
    logger.info('加载插件...');

    // Pathfinder（必需）
    this.bot.loadPlugin(pathfinder);
    logger.info('✅ 加载插件: pathfinder');

    // Armor Manager
    this.bot.loadPlugin(armorManager);
    logger.info('✅ 加载插件: armor-manager');

    // PvP
    this.bot.loadPlugin(pvpPlugin);
    logger.info('✅ 加载插件: pvp');

    // Tool
    this.bot.loadPlugin(toolPlugin);
    logger.info('✅ 加载插件: tool');

    // CollectBlock
    this.bot.loadPlugin(collectBlock);
    logger.info('✅ 加载插件: collectblock');
  }

  /**
   * 初始化插件设置
   */
  private initializePluginSettings(): void {
    try {
      // 1. 设置 pathfinder movements
      if (this.bot.pathfinder) {
        const defaultMove = new Movements(this.bot);

        // 设置不能破坏的方块列表
        const blocksCantBreakIds = new Set<number>();
        const defaultBlocks = ['chest', 'furnace', 'crafting_table', 'bed'];

        logger.info(`配置移动过程中不能破坏的方块列表: ${defaultBlocks.join(', ')}`);

        for (const blockName of defaultBlocks) {
          const block = this.bot.registry.blocksByName[blockName];
          if (block) {
            blocksCantBreakIds.add(block.id);
          } else {
            logger.warn(`未知的方块名称: ${blockName}`);
          }
        }

        defaultMove.blocksCantBreak = blocksCantBreakIds;
        this.bot.pathfinder.setMovements(defaultMove);

        logger.info('✅ Pathfinder movements 初始化完成');
      }

      // 2. 设置 collectBlock movements
      if ((this.bot as any).collectBlock && this.bot.pathfinder) {
        (this.bot as any).collectBlock.movements = this.bot.pathfinder.movements;
        logger.info('✅ CollectBlock movements 已同步');
      }

      // 3. 装备所有护甲
      if (this.bot.armorManager) {
        this.bot.armorManager.equipAll();
        logger.info('✅ ArmorManager 自动装备已启用');
      }

      logger.info('✅ 所有插件设置初始化完成');
    } catch (error) {
      logger.error('初始化插件设置时发生错误', {}, error as Error);
    }
  }

  /**
   * 初始化核心系统
   */
  private async initializeCore() {
    logger.info('初始化核心系统...');

    // 1. 初始化插件设置
    this.initializePluginSettings();

    // 2. 创建工具类实例
    const movementUtils = new MovementUtils(logger);
    const placeBlockUtils = new PlaceBlockUtils(logger, movementUtils);

    // 3. 创建上下文管理器（这会自动创建和初始化 GameState）
    this.contextManager = new ContextManager();
    this.contextManager.createContext({
      bot: this.bot,
      executor: null as any, // 先传 null，稍后注入真正的 executor
      config: {},
      logger,
      placeBlockUtils,
      movementUtils,
    });
    logger.info('✅ ContextManager 和 GameState 初始化完成');

    // 4. 创建 ActionExecutor
    this.executor = new ActionExecutor(this.contextManager, logger);

    // 更新 ContextManager 中的 executor 引用
    this.contextManager.updateExecutor(this.executor);
    logger.info('✅ ActionExecutor 创建完成');

    // 5. 注册所有动作
    this.registerActions();

    // 6. 设置事件监听
    const events = this.executor.getEventManager();

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
      new MineAtPositionAction(),
      new MineByTypeAction(),
      new PlaceBlockAction(),
      new CraftItemAction(),
      new MineInDirectionAction(),

      // 容器操作
      new UseChestAction(),
      new UseFurnaceAction(),
      new QueryContainerAction(),
      new ManageContainerAction(),

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
        logger.error('命令执行失败:', {}, error as Error);
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
        this.bot.chat('--- 箱子测试命令 ---');
        this.bot.chat('!chest_query <x> <y> <z> - 查询箱子内容');
        this.bot.chat('!chest_put <x> <y> <z> <item> <count> - 放入物品');
        this.bot.chat('!chest_take <x> <y> <z> <item> <count> - 取出物品');
        this.bot.chat('!chest_test <x> <y> <z> - 完整测试流程');
        break;

      case 'status':
        const gameState = this.contextManager.getContext().gameState;
        this.bot.chat(`生命: ${gameState.health}/20, 饥饿: ${gameState.food}/20`);
        this.bot.chat(`等级: ${gameState.level}, 经验: ${gameState.experience}`);
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
        const pos = this.contextManager.getContext().gameState.blockPosition;
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
        await this.executor.execute(ActionIds.MINE_BY_TYPE, {
          blockType: args[0],
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

      case 'chest_query':
        if (args.length < 3) {
          this.bot.chat('用法: !chest_query <x> <y> <z>');
          return;
        }
        await this.testChestQuery(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2]));
        break;

      case 'chest_put':
        if (args.length < 5) {
          this.bot.chat('用法: !chest_put <x> <y> <z> <item> <count>');
          return;
        }
        await this.testChestPut(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2]), args[3], parseInt(args[4]));
        break;

      case 'chest_take':
        if (args.length < 5) {
          this.bot.chat('用法: !chest_take <x> <y> <z> <item> <count>');
          return;
        }
        await this.testChestTake(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2]), args[3], parseInt(args[4]));
        break;

      case 'chest_test':
        if (args.length < 3) {
          this.bot.chat('用法: !chest_test <x> <y> <z>');
          return;
        }
        await this.testChestFull(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2]));
        break;

      default:
        this.bot.chat(`未知命令: ${command}`);
        this.bot.chat('发送 !help 查看可用命令');
    }
  }

  /**
   * 测试查询箱子
   */
  private async testChestQuery(x: number, y: number, z: number) {
    this.bot.chat(`🔍 测试查询箱子 (${x}, ${y}, ${z})...`);
    logger.info('=== 开始箱子查询测试 ===');

    const result = await this.executor.execute('query_container', {
      position: { x, y, z },
    });

    if (result.success) {
      this.bot.chat('✅ 查询成功!');
      const inventory = result.data?.inventory || {};
      const itemCount = Object.keys(inventory).length;
      this.bot.chat(`箱子包含 ${itemCount} 种物品`);

      if (itemCount > 0) {
        const items = Object.entries(inventory)
          .map(([name, count]) => `${name}x${count}`)
          .slice(0, 5);
        this.bot.chat(`物品: ${items.join(', ')}`);
      }
    } else {
      this.bot.chat(`❌ 查询失败: ${result.message}`);
    }

    logger.info('=== 箱子查询测试完成 ===');
  }

  /**
   * 测试放入物品到箱子
   */
  private async testChestPut(x: number, y: number, z: number, item: string, count: number) {
    this.bot.chat(`📦 测试放入 ${item} x${count} 到箱子 (${x}, ${y}, ${z})...`);
    logger.info('=== 开始箱子放入测试 ===');

    const result = await this.executor.execute('manage_container', {
      position: { x, y, z },
      action: 'put_items',
      item,
      count,
    });

    if (result.success) {
      this.bot.chat(`✅ 成功: ${result.message}`);
    } else {
      this.bot.chat(`❌ 失败: ${result.message}`);
    }

    logger.info('=== 箱子放入测试完成 ===');
  }

  /**
   * 测试从箱子取出物品
   */
  private async testChestTake(x: number, y: number, z: number, item: string, count: number) {
    this.bot.chat(`📤 测试取出 ${item} x${count} 从箱子 (${x}, ${y}, ${z})...`);
    logger.info('=== 开始箱子取出测试 ===');

    const result = await this.executor.execute('manage_container', {
      position: { x, y, z },
      action: 'take_items',
      item,
      count,
    });

    if (result.success) {
      this.bot.chat(`✅ 成功: ${result.message}`);
    } else {
      this.bot.chat(`❌ 失败: ${result.message}`);
    }

    logger.info('=== 箱子取出测试完成 ===');
  }

  /**
   * 完整的箱子测试流程
   */
  private async testChestFull(x: number, y: number, z: number) {
    this.bot.chat(`🧪 开始完整箱子测试 (${x}, ${y}, ${z})...`);
    logger.info('=== 开始完整箱子测试流程 ===');

    try {
      // 1. 查询箱子内容
      this.bot.chat('步骤 1: 查询箱子内容');
      const queryResult = await this.executor.execute('query_container', {
        position: { x, y, z },
      });

      if (!queryResult.success) {
        this.bot.chat(`❌ 查询失败: ${queryResult.message}`);
        return;
      }

      this.bot.chat('✅ 查询成功');
      const inventory = queryResult.data?.inventory || {};
      const itemCount = Object.keys(inventory).length;
      this.bot.chat(`箱子包含 ${itemCount} 种物品`);

      // 等待一下
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. 尝试放入物品（使用背包中的第一个物品）
      const botInventory = this.bot.inventory.items();
      if (botInventory.length > 0) {
        const testItem = botInventory[0];
        this.bot.chat(`步骤 2: 放入 ${testItem.name} x1`);

        const putResult = await this.executor.execute('manage_container', {
          position: { x, y, z },
          action: 'put_items',
          item: testItem.name,
          count: 1,
        });

        if (putResult.success) {
          this.bot.chat('✅ 放入成功');
        } else {
          this.bot.chat(`⚠️ 放入失败: ${putResult.message}`);
        }

        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. 再次查询确认
        this.bot.chat('步骤 3: 再次查询确认');
        const queryResult2 = await this.executor.execute('query_container', {
          position: { x, y, z },
        });

        if (queryResult2.success) {
          const newInventory = queryResult2.data?.inventory || {};
          const newItemCount = Object.keys(newInventory).length;
          this.bot.chat(`箱子现在包含 ${newItemCount} 种物品`);
        }

        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. 取回物品
        this.bot.chat(`步骤 4: 取回 ${testItem.name} x1`);
        const takeResult = await this.executor.execute('manage_container', {
          position: { x, y, z },
          action: 'take_items',
          item: testItem.name,
          count: 1,
        });

        if (takeResult.success) {
          this.bot.chat('✅ 取回成功');
        } else {
          this.bot.chat(`⚠️ 取回失败: ${takeResult.message}`);
        }
      } else {
        this.bot.chat('⚠️ 背包为空，跳过放入/取出测试');
      }

      this.bot.chat('🎉 完整测试流程完成!');
    } catch (error) {
      this.bot.chat(`❌ 测试异常: ${(error as Error).message}`);
      logger.error('箱子测试异常:', {}, error as Error);
    }

    logger.info('=== 完整箱子测试流程完成 ===');
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
    logger.error('初始化失败:', {}, error as Error);
    process.exit(1);
  }
}

// 启动
main().catch(error => {
  logger.error('程序异常:', {}, error as Error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('\n👋 正在关闭...');
  process.exit(0);
});
