/**
 * 主决策循环
 *
 * 职责：循环控制
 * - 检查中断
 * - 委托策略管理器执行决策
 * - 定期评估任务
 */

import type { AgentState } from '../types';
import { LLMManager } from '@/llm/LLMManager';
import { BaseLoop } from './BaseLoop';
import { promptManager, initAllTemplates } from '../prompt';
import { ActionPromptGenerator } from '@/core/actions/ActionPromptGenerator';
import { PromptDataCollector } from './PromptDataCollector';
import { DecisionStrategyManager, AutoModeSwitchStrategy, LLMDecisionStrategy } from '../decision';

export class MainDecisionLoop extends BaseLoop<AgentState> {
  private llmManager: LLMManager;
  private strategyManager: DecisionStrategyManager;
  private evaluationCounter: number = 0;
  private promptsInitialized: boolean = false;

  constructor(state: AgentState, llmManager: LLMManager) {
    super(state, 'MainDecisionLoop');

    // 必须传入 llmManager，不允许创建新实例
    this.llmManager = llmManager;

    // 初始化提示词模板（只初始化一次）
    if (!this.promptsInitialized) {
      initAllTemplates();
      this.promptsInitialized = true;
      this.logger.info('✅ 提示词模板初始化完成');
    }

    // 初始化策略管理器
    this.strategyManager = new DecisionStrategyManager();
    this.registerStrategies(state);
  }

  /**
   * 注册所有决策策略
   */
  private registerStrategies(state: AgentState): void {
    // 创建动作提示词生成器和数据收集器
    const actionPromptGenerator = new ActionPromptGenerator(state.context.executor);
    const dataCollector = new PromptDataCollector(state, actionPromptGenerator);

    // 注册策略（按优先级自动排序）
    this.strategyManager.addStrategy(new AutoModeSwitchStrategy());
    this.strategyManager.addStrategy(new LLMDecisionStrategy(this.llmManager, dataCollector));

    // 输出策略统计
    const stats = this.strategyManager.getStats();
    this.logger.info(`✅ 已注册 ${stats.totalStrategies} 个决策策略`);
  }

  /**
   * 执行一次循环迭代
   */
  protected async runLoopIteration(): Promise<void> {
    // 1. 检查中断
    if (this.state.interrupt.isInterrupted()) {
      const reason = this.state.interrupt.getReason();
      this.state.interrupt.clear();
      this.logger.warn(`⚠️ 决策循环被中断: ${reason}`);
      await this.sleep(1000);
      return;
    }

    // 2. 委托策略管理器执行决策
    const executed = await this.strategyManager.executeStrategies(this.state);

    // 3. 如果没有策略执行，等待一段时间
    if (!executed) {
      this.logger.debug('⏸️ 没有可执行的策略，等待中...');
      await this.sleep(1000);
      return;
    }

    // 4. 定期评估任务
    this.evaluationCounter++;
    if (this.evaluationCounter % 5 === 0) {
      await this.evaluateTask();
    }
  }

  /**
   * 评估任务
   *
   * 对应 maicraft 的 judge_task()
   */
  private async evaluateTask(): Promise<void> {
    try {
      const { gameState } = this.state.context;
      const { memory, planningManager } = this.state;

      // 构建评估数据
      const evaluationData = {
        goal: this.state.goal,
        current_task: planningManager?.getCurrentTask()?.title || '暂无任务',
        position: `位置: (${gameState.blockPosition.x}, ${gameState.blockPosition.y}, ${gameState.blockPosition.z})`,
        inventory: gameState.getInventoryDescription?.() || '空',
        recent_decisions: memory.buildContextSummary({
          includeDecisions: 10,
        }),
        recent_thoughts: memory.buildContextSummary({
          includeThoughts: 5,
        }),
      };

      // 生成评估提示词
      const prompt = promptManager.generatePrompt('task_evaluation', evaluationData);

      // 使用系统提示词模板
      const systemPrompt = promptManager.generatePrompt('task_evaluation_system', {
        bot_name: this.state.context.gameState.playerName || 'Bot',
        player_name: this.state.context.gameState.playerName || 'Player'
      });
      const userPrompt = prompt;

      const response = await this.llmManager.chatCompletion(userPrompt, systemPrompt);
      const evaluation = response.success ? response.content : null;

      if (evaluation) {
        // 记录评估结果
        this.state.memory.recordThought(`[任务评估] ${evaluation}`);
        this.logger.info(`📊 任务评估完成`);
      }
    } catch (error) {
      this.logger.error('❌ 任务评估异常', undefined, error as Error);
    }
  }
}
