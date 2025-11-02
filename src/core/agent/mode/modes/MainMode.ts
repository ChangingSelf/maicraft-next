/**
 * 主模式
 *
 * 参考原maicraft的MainMode设计
 * 负责正常的探索、任务执行和LLM决策
 * 不实现监听器，专注于主动决策
 */

import { BaseMode } from '../BaseMode';
import { ModeManager } from '../ModeManager';
import type { RuntimeContext } from '@/core/context/RuntimeContext';
import type { AgentState } from '../../types';
import { LLMManager } from '@/llm/LLMManager';
import { promptManager, initAllTemplates } from '../../prompt';
import { ActionPromptGenerator } from '@/core/actions/ActionPromptGenerator';
import { PromptDataCollector } from '../../loop/PromptDataCollector';
import { getLogger } from '@/utils/Logger';

export class MainMode extends BaseMode {
  readonly type = ModeManager.MODE_TYPES.MAIN;
  readonly name = '主模式';
  readonly description = '正常探索和任务执行';
  readonly priority = 0; // 最低优先级，默认模式
  readonly requiresLLMDecision = true; // 需要LLM参与决策

  // GameStateListener 实现
  readonly listenerName = 'MainMode';
  readonly enabled = false; // 主模式不需要监听游戏状态

  // 主模式特定状态
  private llmManager: LLMManager | null = null;
  private actionPromptGenerator: ActionPromptGenerator | null = null;
  private dataCollector: PromptDataCollector | null = null;
  private promptsInitialized: boolean = false;

  constructor(context: RuntimeContext) {
    super(context);
    // 重新设置logger以使用正确的名称
    this.logger = getLogger(this.name);
  }

  /**
   * 绑定Agent状态并初始化LLM组件
   */
  bindState(state: AgentState): void {
    super.bindState(state);

    if (state) {
      // 初始化LLM相关组件
      this.llmManager = state.llmManager;

      // 初始化提示词模板（只初始化一次）
      if (!this.promptsInitialized) {
        initAllTemplates();
        this.promptsInitialized = true;
        this.logger.info('✅ 主模式提示词模板初始化完成');
      }

      // 创建动作提示词生成器和数据收集器
      if (this.llmManager) {
        this.actionPromptGenerator = new ActionPromptGenerator(state.context.executor);
        this.dataCollector = new PromptDataCollector(state, this.actionPromptGenerator);
      }
    }
  }

  /**
   * 激活模式
   */
  protected async onActivate(reason: string): Promise<void> {
    this.logger.info(`🚀 进入主模式: ${reason}`);

    // 记录到思考日志
    if (this.state?.memory) {
      this.state.memory.recordThought(`🚀 切换到主模式: ${reason}`);
    }
  }

  /**
   * 停用模式
   */
  protected async onDeactivate(reason: string): Promise<void> {
    this.logger.info(`⏸️ 退出主模式: ${reason}`);

    // 记录到思考日志
    if (this.state?.memory) {
      this.state.memory.recordThought(`⏸️ 退出主模式: ${reason}`);
    }
  }

  /**
   * 模式主逻辑 - LLM决策
   * 参考原maicraft的next_thinking方法
   */
  async execute(): Promise<void> {
    if (!this.state || !this.llmManager || !this.dataCollector) {
      const missingComponents = [];
      if (!this.state) missingComponents.push('state');
      if (!this.llmManager) missingComponents.push('llmManager');
      if (!this.dataCollector) missingComponents.push('dataCollector');

      this.logger.warn(`⚠️ 主模式缺少必要组件: ${missingComponents.join(', ')}`);
      this.logger.debug(`组件状态 - state: ${!!this.state}, llmManager: ${!!this.llmManager}, dataCollector: ${!!this.dataCollector}`);
      return;
    }

    try {
      // 执行LLM决策
      await this.executeLLMDecision();

    } catch (error) {
      this.logger.error('❌ 主模式执行异常:', undefined, error as Error);

      if (this.state?.memory) {
        this.state.memory.recordThought(`❌ 主模式执行异常: ${error}`);
      }
    }
  }

  /**
   * 检查自动转换
   */
  async checkTransitions(): Promise<string[]> {
    const targetModes: string[] = [];

    // 主模式通常不会主动转换，由监听器触发
    // 但可以添加一些基本的转换条件
    if (this.shouldEnterCombat()) {
      targetModes.push(ModeManager.MODE_TYPES.COMBAT);
    }

    return targetModes;
  }

  /**
   * 执行LLM决策
   * 参考原maicraft的next_thinking逻辑
   */
  private async executeLLMDecision(): Promise<void> {
    // 收集决策数据
    const promptData = await this.dataCollector!.collectAllData();

    // 生成提示词
    const prompt = promptManager.generatePrompt('main_thinking', promptData);

    // 生成系统提示词
    const systemPrompt = promptManager.generatePrompt('main_thinking_system', {
      bot_name: this.state!.context.gameState.playerName || 'Bot',
      player_name: this.state!.context.gameState.playerName || 'Player',
    });

    this.logger.debug('💭 生成提示词完成');

    // 调用LLM
    const response = await this.llmManager!.chatCompletion(prompt, systemPrompt);

    if (!response.success) {
      this.logger.warn(`⚠️ LLM调用失败`);
      return;
    }

    this.logger.info('🤖 LLM 响应完成');

    // 解析并执行动作
    if (response.content) {
      await this.parseAndExecuteActions(response.content);
    }
  }

  /**
   * 解析并执行动作
   * 参考原maicraft的动作解析逻辑
   */
  private async parseAndExecuteActions(llmResponse: string): Promise<void> {
    // 这里需要实现动作解析逻辑
    // 由于原项目可能有专门的解析器，这里提供基础实现

    try {
      // 简单的JSON解析示例
      const actionMatches = llmResponse.match(/\{[^}]*\}/g) || [];

      if (actionMatches.length === 0) {
        this.logger.warn('⚠️ 未检测到有效动作');
        return;
      }

      this.logger.info(`📋 准备执行 ${actionMatches.length} 个动作`);

      // 执行每个动作
      for (let i = 0; i < actionMatches.length; i++) {
        try {
          const actionJson = JSON.parse(actionMatches[i]);

          this.logger.debug(`🔍 解析的动作JSON: ${JSON.stringify(actionJson, null, 2)}`);

          // 尝试多种可能的动作字段名
          const actionName = actionJson.action_type || actionJson.action || actionJson.type || actionJson.name || actionJson.command;

          if (!actionName) {
            this.logger.warn(`⚠️ 动作 ${i + 1}/${actionMatches.length}: 缺少动作字段 - ${JSON.stringify(actionJson)}`);
            continue;
          }

          this.logger.info(`🎬 执行动作 ${i + 1}/${actionMatches.length}: ${actionName}`);

          // 执行动作
          const result = await this.state!.context.executor.execute(actionName, actionJson.params || actionJson);

          if (result.success) {
            this.logger.info(`✅ 动作 ${i + 1}/${actionMatches.length}: 成功`);
          } else {
            this.logger.warn(`⚠️ 动作 ${i + 1}/${actionMatches.length}: 失败 - ${result.message}`);
            // 原maicraft设计：失败时停止后续动作
            break;
          }
        } catch (parseError) {
          this.logger.error(`❌ 动作 ${i + 1}/${actionMatches.length} 解析失败:`, undefined, parseError as Error);
          break;
        }
      }

    } catch (error) {
      this.logger.error('❌ 动作解析执行异常:', undefined, error as Error);
    }
  }

  /**
   * 判断是否应该进入战斗
   * 基础威胁检测，主要依赖CombatMode的监听器
   */
  private shouldEnterCombat(): boolean {
    if (!this.state?.context?.gameState?.nearbyEntities) {
      return false;
    }

    const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper'];
    const entities = this.state.context.gameState.nearbyEntities || [];
    const enemies = entities.filter((e: any) =>
      hostileMobs.includes(e.name?.toLowerCase())
    );

    return enemies.length > 0 && enemies[0].distance < 10;
  }

  /**
   * 获取主模式统计信息
   */
  getMainModeStats(): {
    isLLMAvailable: boolean;
    promptsInitialized: boolean;
  } {
    return {
      isLLMAvailable: !!this.llmManager,
      promptsInitialized: this.promptsInitialized,
    };
  }
}
