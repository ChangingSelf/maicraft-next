/**
 * Agent 主类
 * 整个 AI 系统的入口和协调者
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { Bot } from 'mineflayer';
import type { AppConfig as Config } from '@/utils/Config';
import type { AgentState, AgentStatus, GameContext } from './types';
import type { Goal } from './planning/Goal';
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

  constructor(
    bot: Bot,
    executor: ActionExecutor,
    llmManager: any,
    config: Config,
    memory: MemoryManager,
    planningManager: GoalPlanningManager,
    modeManager: ModeManager,
    interrupt: InterruptController,
    logger?: Logger,
  ) {
    this.bot = bot;
    this.executor = executor;
    this.llmManager = llmManager;
    this.externalLogger = logger || getLogger('Agent');
    this.logger = this.externalLogger;

    // 从外部注入的组件构建状态
    const context = this.executor.getContextManager().getContext();

    this.state = {
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

    // 绑定状态到 ModeManager
    this.state.modeManager.bindState(this.state);

    // 设置规划管理器的目标完成回调
    this.setupGoalPlanningCallbacks();

    // 创建决策循环（依赖 AgentState，在这里创建）
    this.mainLoop = new MainDecisionLoop(this.state, this.llmManager);
    this.chatLoop = new ChatLoop(this.state, this.llmManager);

    // 设置事件监听
    this.setupEventListeners();

    // 设置定期保存记忆
    this.setupPeriodicSave();
  }

  /**
   * 设置WebSocket服务器（用于记忆推送）
   */
  setWebSocketServer(webSocketServer: any): void {
    this.state.memory.setWebSocketServer(webSocketServer);
    this.logger.info('📡 Agent 已连接到WebSocket服务器');
  }

  /**
   * 获取记忆管理器
   */
  getMemoryManager(): any {
    return this.state.memory;
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

      // 如果配置中有目标但规划系统中没有，创建初始目标
      if (this.state.goal && !this.state.planningManager.getCurrentGoal()) {
        this.logger.info(`🎯 从配置创建初始目标: ${this.state.goal}`);
        this.state.planningManager.createGoal(this.state.goal);
      }

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
   * 设置规划管理器的回调函数
   */
  private setupGoalPlanningCallbacks(): void {
    this.state.planningManager.setOnGoalCompleted((goal: Goal) => {
      this.handleGoalCompletion(goal);
    });
  }

  /**
   * 处理目标完成事件
   */
  private handleGoalCompletion(goal: Goal): void {
    // 1. 记录目标完成事件到思考记忆
    this.state.memory.recordThought(`成功完成了目标: ${goal.description}`, {
      completedGoal: goal.description,
      duration: Date.now() - goal.createdAt,
      planCount: goal.planIds.length,
    });

    // 2. 触发"目标完成"事件通知
    this.state.context.events.emit('goalCompleted', {
      goal: {
        id: goal.id,
        description: goal.description,
        completedAt: goal.completedAt,
        duration: goal.completedAt ? goal.completedAt - goal.createdAt : 0,
        planCount: goal.planIds.length,
      },
    });

    // 3. 自动生成新目标
    this.generateNewGoalAfterCompletion(goal);
  }

  /**
   * 基于完成的目标自动生成新目标
   */
  private generateNewGoalAfterCompletion(completedGoal: Goal): void {
    // 这里可以根据完成的目标类型、环境状态、历史经验等来生成新目标
    // 暂时实现一个简单的逻辑
    this.logger.info('🤖 正在分析环境，生成新目标...');

    // 记录思考过程
    this.state.memory.recordThought('🤖 分析已完成目标，准备生成新目标', {
      completedGoal: completedGoal.description,
    });

    // TODO: 实现基于环境分析的智能目标生成
    // 目前暂时进入等待模式
    this.logger.info('🎯 自动目标生成功能开发中，暂时等待用户指令');
    this.state.memory.recordThought('🎯 自动目标生成功能开发中，等待用户指令', {});
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
      this.logger.error('❌ 保存 Agent 状态失败:', {}, error as Error);
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
