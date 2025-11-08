/**
 * Agent 主类
 * 整个 AI 系统的入口和协调者
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { Bot } from 'mineflayer';
import type { AppConfig as Config } from '@/utils/Config';
import type { AgentState, AgentStatus, GameContext } from './types';
import { InterruptController } from './InterruptController';
import { MemoryManager } from './memory/MemoryManager';
import { GoalPlanningManager } from './planning/GoalPlanningManager';
import { ModeManager } from './mode/ModeManager';
import { MainDecisionLoop } from './loop/MainDecisionLoop';
import { ChatLoop } from './loop/ChatLoop';
import { ActionExecutor } from '@/core/actions/ActionExecutor';

export class Agent {
  // 共享状态（只读）
  readonly state: AgentState;

  // 决策系统（作为内部组件，不暴露）
  private mainLoop: MainDecisionLoop;
  private chatLoop: ChatLoop;

  // 外部传入的组件
  private bot: Bot;
  private executor: ActionExecutor;
  private llmManager: any; // LLMManager 类型
  private externalLogger: Logger;

  // 生命周期
  private isRunning: boolean = false;

  private logger: Logger;

  constructor(bot: Bot, executor: ActionExecutor, llmManager: any, config: Config, logger?: Logger) {
    this.bot = bot;
    this.executor = executor;
    this.llmManager = llmManager;
    this.externalLogger = logger || getLogger('Agent');
    this.logger = this.externalLogger;

    // 初始化共享状态（使用传入的 executor 中的 contextManager）
    this.state = this.initializeState(bot, config);

    // 绑定状态到 ModeManager
    this.state.modeManager.bindState(this.state);

    // 初始化决策循环（传入共享状态和 llmManager）
    this.mainLoop = new MainDecisionLoop(this.state, this.llmManager);
    this.chatLoop = new ChatLoop(this.state, this.llmManager);

    // 设置事件监听
    this.setupEventListeners();

    // 设置定期保存记忆
    this.setupPeriodicSave();
  }

  /**
   * 初始化共享状态
   */
  private initializeState(bot: Bot, config: Config): AgentState {
    // 从 executor 中获取已创建的上下文
    const context = this.executor.getContextManager().getContext();

    const gameContext: GameContext = {
      gameState: context.gameState,
      blockCache: context.blockCache,
      containerCache: context.containerCache,
      locationManager: context.locationManager,
      logger: context.logger,
    };

    const memory = new MemoryManager();
    const planningManager = new GoalPlanningManager(gameContext);
    const modeManager = new ModeManager(context);
    const interrupt = new InterruptController();

    return {
      goal: config.agent?.goal || '探索世界',
      isRunning: false,
      context,
      modeManager,
      planningManager,
      memory,
      llmManager: this.llmManager,
      interrupt,
      config,
    };
  }

  /**
   * 设置WebSocket服务器（用于记忆推送）
   */
  setWebSocketServer(webSocketServer: any): void {
    this.state.memory.setWebSocketServer(webSocketServer);
    this.logger.info('📡 Agent 已连接到WebSocket服务器');
  }

  /**
   * 初始化 Agent（加载资源、设置状态等，但不启动决策循环）
   */
  async initialize(): Promise<void> {
    this.logger.info('🔧 Agent 初始化中...');

    try {
      // 初始化游戏状态（如果还没初始化）
      if (!(this.state.context.gameState as any).initialized) {
        this.state.context.gameState.initialize(this.state.context.bot);
      }

      // 初始化记忆系统
      await this.state.memory.initialize();

      // 初始化规划系统
      await this.state.planningManager.initialize();

      // 注册所有模式
      await this.state.modeManager.registerModes();

      this.logger.info('✅ Agent 初始化完成');
    } catch (error) {
      this.logger.error('❌ Agent 初始化失败:', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 启动 Agent（开始决策循环）
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Agent 已在运行');
      return;
    }

    this.isRunning = true;
    this.state.isRunning = true;

    this.logger.info('🚀 Agent 启动中...');

    try {
      // 设置初始模式
      await this.state.modeManager.setMode(ModeManager.MODE_TYPES.MAIN, '初始化');

      // 启动决策循环
      this.mainLoop.start();
      this.chatLoop.start();

      this.logger.info('✅ Agent 启动完成');
    } catch (error) {
      this.logger.error('❌ Agent 启动失败:', undefined, error as Error);
      this.isRunning = false;
      this.state.isRunning = false;
      throw error;
    }
  }

  /**
   * 停止 Agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Agent 未在运行');
      return;
    }

    this.logger.info('🛑 Agent 停止中...');

    this.isRunning = false;
    this.state.isRunning = false;

    // 停止决策循环
    this.mainLoop.stop();
    this.chatLoop.stop();

    // 停止规划系统
    this.state.planningManager.stop();

    // 保存状态
    await this.saveState();

    this.logger.info('✅ Agent 已停止');
  }

  /**
   * 设置定期保存记忆
   */
  private setupPeriodicSave(): void {
    // 每30秒保存一次记忆
    setInterval(async () => {
      try {
        await this.state.memory.saveAll();
      } catch (error) {
        this.logger.error('定期保存记忆失败', undefined, error as Error);
      }
    }, 30 * 1000);
  }

  /**
   * 设置事件监听（游戏逻辑相关）
   */
  private setupEventListeners(): void {
    const { context, interrupt, modeManager } = this.state;

    // 受伤事件 - 切换到战斗模式
    context.events.on('entityHurt', async (data: any) => {
      if (data.entity?.id === context.bot.entity?.id) {
        // 只有当受伤的是自己时才切换模式
        await modeManager.trySetMode(ModeManager.MODE_TYPES.COMBAT, '受到攻击');
        this.state.memory.recordThought('⚔️ 受到攻击，切换到战斗模式', { entity: data.entity });
      }
    });

    // 死亡事件 - 触发中断
    context.events.on('death', () => {
      interrupt.trigger('玩家死亡');
      this.logger.warn('💀 玩家死亡');
      this.state.memory.recordThought('💀 玩家死亡，需要重生', {});
    });

    // 重生事件 - 恢复正常状态
    context.events.on('spawn', () => {
      this.logger.info('🎮 玩家重生');
      this.state.memory.recordThought('🎮 玩家重生，恢复正常活动', {});
    });

    // 健康和饥饿状态变化 - AI决策相关
    context.events.on('health', (data: any) => {
      const { health, food } = data;

      // 低血量警告
      if (health < 6) {
        this.state.memory.recordThought('⚠️ 生命值过低，需要回血或进食', { health });
      }

      // 低饥饿值警告
      if (food < 6) {
        this.state.memory.recordThought('⚠️ 饥饿值过低，需要进食', { food });
      }

      // 记录健康状态变化
      this.logger.debug(`健康状态更新: 生命值 ${health}/20, 饥饿值 ${food}/20`);
    });
  }

  /**
   * 保存状态
   */
  private async saveState(): Promise<void> {
    this.logger.info('💾 保存 Agent 状态...');

    try {
      await Promise.all([
        this.state.memory.saveAll(),
        this.state.context.blockCache.save?.(),
        this.state.context.containerCache.save?.(),
        this.state.context.locationManager.save?.(),
      ]);

      this.logger.info('✅ Agent 状态保存完成');
    } catch (error) {
      this.logger.error('❌ 保存 Agent 状态失败:', error);
    }
  }

  /**
   * 获取状态摘要
   */
  getStatus(): AgentStatus {
    return {
      isRunning: this.isRunning,
      currentMode: this.state.modeManager.getCurrentMode(),
      goal: this.state.goal,
      currentTask: this.state.planningManager.getCurrentTask(),
      interrupted: this.state.interrupt.isInterrupted(),
      interruptReason: this.state.interrupt.getReason(),
    };
  }

  /**
   * 设置目标
   */
  setGoal(description: string): void {
    (this.state as any).goal = description;
    this.state.planningManager.createGoal(description);
    this.logger.info(`🎯 设置新目标: ${description}`);
  }
}
