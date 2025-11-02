/**
 * 主决策循环
 * 不再持有 Agent 引用，只访问共享状态
 */

import type { AgentState, ActionCall } from '../types';
import type { ActionId } from '@/core/actions/ActionIds';
import { LLMManager } from '@/llm/LLMManager';
import type { LLMResponse } from '@/llm/types';
import { BaseLoop } from './BaseLoop';
import { promptManager, initAllTemplates, parseThinkingMultiple } from '../prompt';
import { ActionPromptGenerator } from '@/core/actions/ActionPromptGenerator';
import { PromptDataCollector } from './PromptDataCollector';

export class MainDecisionLoop extends BaseLoop<AgentState> {
  private llmManager: any; // LLMManager type
  private evaluationCounter: number = 0;
  private promptsInitialized: boolean = false;
  private actionPromptGenerator: ActionPromptGenerator;
  private dataCollector: PromptDataCollector;

  constructor(state: AgentState, llmManager?: any) {
    super(state, 'MainDecisionLoop');

    // 创建动作提示词生成器
    this.actionPromptGenerator = new ActionPromptGenerator(state.context.executor);

    // 创建数据收集器
    this.dataCollector = new PromptDataCollector(state, this.actionPromptGenerator);

    // 使用传入的 llmManager 或创建新实例
    this.llmManager = llmManager || new LLMManager(state.config.llm, this.logger);

    // 初始化提示词模板（只初始化一次）
    if (!this.promptsInitialized) {
      initAllTemplates();
      this.promptsInitialized = true;
      this.logger.info('✅ 提示词模板初始化完成');
    }
  }

  /**
   * 执行一次循环迭代
   */
  protected async runLoopIteration(): Promise<void> {
    // 检查中断
    if (this.state.interrupt.isInterrupted()) {
      const reason = this.state.interrupt.getReason();
      this.state.interrupt.clear();
      this.logger.warn(`⚠️ 决策循环被中断: ${reason}`);
      await this.sleep(1000);
      return;
    }

    // 检查是否允许 LLM 决策
    if (!this.state.modeManager.canUseLLMDecision()) {
      const autoSwitched = await this.state.modeManager.checkAutoTransitions();
      if (!autoSwitched) {
        await this.sleep(1000);
      }
      return;
    }

    // 执行决策
    await this.executeDecisionCycle();

    // 定期评估
    this.evaluationCounter++;
    if (this.evaluationCounter % 5 === 0) {
      await this.evaluateTask();
    }
  }

  /**
   * 执行一次决策周期
   */
  private async executeDecisionCycle(): Promise<void> {
    // 1. 收集基础信息数据
    const basicInfoData = this.dataCollector.collectBasicInfo();

    // 2. 生成 basic_info 提示词
    const basicInfo = promptManager.generatePrompt('basic_info', basicInfoData);

    // 3. 收集所有数据
    const inputData = this.dataCollector.collectAllData();
    inputData.basic_info = basicInfo; // 设置生成的 basic_info

    // 4. 使用 promptManager.generatePrompt 生成 main_thinking 提示词
    const prompt = promptManager.generatePrompt('main_thinking', inputData);
    this.logger.info('💭 生成提示词完成');

    // 5. 调用 LLM
    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    const response = await this.llmManager.chat(messages);
    this.logger.info('🤖 LLM 响应完成');

    // 6. 解析响应
    const { thinking, actions } = this.parseResponse(response);

    if (!actions || actions.length === 0) {
      this.logger.warn('⚠️ 无有效动作');
      return;
    }

    // 7. 记录思考
    if (thinking) {
      this.state.memory.recordThought(thinking);
    }

    // 8. 执行动作
    const result = await this.executeActions(actions, thinking || '未知意图');

    // 9. 记录决策
    this.state.memory.recordDecision(thinking || '未知意图', actions, result.success ? 'success' : 'failed', result.feedback);
  }

  /**
   * 解析响应
   *
   * 完全照搬 maicraft 的 parse_thinking_multiple
   */
  private parseResponse(response: LLMResponse): {
    thinking: string | null;
    actions: ActionCall[];
  } {
    // 从 LLMResponse 中提取文本内容
    const content = response.choices[0]?.message?.content || '';

    if (!content) {
      this.logger.warn('⚠️ LLM 响应内容为空');
      return { thinking: null, actions: [] };
    }

    // 使用 parseThinkingMultiple 解析（完全照搬原版）
    const parseResult = parseThinkingMultiple(content);

    if (!parseResult.success) {
      this.logger.warn('⚠️ 没有解析到有效的动作');
      return { thinking: parseResult.jsonBefore || null, actions: [] };
    }

    // 转换为 ActionCall 格式
    const actions: ActionCall[] = parseResult.jsonObjList.map(jsonObj => ({
      actionType: jsonObj.action_type,
      params: jsonObj,
    }));

    // thinking 是 JSON 前的内容
    const thinking = parseResult.jsonBefore || null;

    this.logger.debug(`解析到 ${actions.length} 个动作，thinking: ${thinking?.substring(0, 50)}...`);

    return { thinking, actions };
  }

  /**
   * 执行动作列表
   */
  private async executeActions(actions: ActionCall[], intention: string): Promise<{ success: boolean; feedback: string }> {
    const feedbacks: string[] = [];
    let allSuccess = true;

    this.logger.info(`📋 准备执行 ${actions.length} 个动作`);

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      this.logger.info(`🎬 执行动作 ${i + 1}/${actions.length}: ${action.actionType}`);

      try {
        const result = await this.state.context.executor.execute(action.actionType as ActionId, action.params);

        feedbacks.push(`动作 ${i + 1}: ${action.actionType} - ${result.success ? '成功' : '失败'}: ${result.message}`);

        this.logger.info(`${result.success ? '✅' : '❌'} 动作 ${i + 1}/${actions.length}: ${result.message}`);

        if (!result.success) {
          allSuccess = false;
          break;
        }
      } catch (error) {
        feedbacks.push(`动作 ${i + 1}: ${action.actionType} - 异常: ${error}`);
        this.logger.error(`❌ 动作执行异常:`, undefined, error as Error);
        allSuccess = false;
        break;
      }
    }

    return {
      success: allSuccess,
      feedback: feedbacks.join('\n'),
    };
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

      const messages = [
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llmManager.chat(messages);
      const evaluation = response.choices[0]?.message?.content;

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
