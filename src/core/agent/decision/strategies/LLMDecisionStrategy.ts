/**
 * LLM 决策策略
 *
 * 使用 LLM 进行智能决策
 */

import type { AgentState, ActionCall } from '../../types';
import type { DecisionStrategy } from '../types';
import { StrategyGroup } from '../types';
import type { LLMManager } from '@/llm/LLMManager';
import type { LLMResponse } from '@/llm/types';
import { MessageRole } from '@/llm/types';
import type { ActionId } from '@/core/actions/ActionIds';
import { getLogger, type Logger } from '@/utils/Logger';
import { promptManager, parseThinkingMultiple } from '../../prompt';
import type { PromptDataCollector } from '../../loop/PromptDataCollector';

export class LLMDecisionStrategy implements DecisionStrategy {
  readonly name = 'LLM决策';
  private logger: Logger;
  private llmManager: LLMManager;
  private dataCollector: PromptDataCollector;

  constructor(llmManager: LLMManager, dataCollector: PromptDataCollector) {
    this.logger = getLogger('LLMDecisionStrategy');
    this.llmManager = llmManager;
    this.dataCollector = dataCollector;
  }

  canExecute(state: AgentState): boolean {
    // 只有在允许 LLM 决策的模式下才执行
    return state.modeManager.canUseLLMDecision();
  }

  async execute(state: AgentState): Promise<void> {
    // 1. 收集基础信息数据
    const basicInfoData = this.dataCollector.collectBasicInfo();

    // 2. 生成 basic_info 提示词
    const basicInfo = promptManager.generatePrompt('basic_info', basicInfoData);

    // 3. 收集所有数据
    const inputData = this.dataCollector.collectAllData();
    inputData.basic_info = basicInfo;

    // 4. 生成 main_thinking 提示词
    const prompt = promptManager.generatePrompt('main_thinking', inputData);
    this.logger.info('💭 生成提示词完成');

    // 5. 调用 LLM
    const messages = [
      {
        role: MessageRole.USER,
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
      state.memory.recordThought(thinking);
    }

    // 8. 执行动作
    const result = await this.executeActions(state, actions, thinking || '未知意图');

    // 9. 记录决策
    state.memory.recordDecision(thinking || '未知意图', actions, result.success ? 'success' : 'failed', result.feedback);
  }

  getPriority(): number {
    return 10; // 最低优先级，作为兜底决策
  }

  getGroup(): StrategyGroup {
    return StrategyGroup.AI_DECISION;
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(response: LLMResponse): {
    thinking: string | null;
    actions: ActionCall[];
  } {
    const content = response.choices[0]?.message?.content || '';

    if (!content) {
      this.logger.warn('⚠️ LLM 响应内容为空');
      return { thinking: null, actions: [] };
    }

    // 使用 parseThinkingMultiple 解析
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

    const thinking = parseResult.jsonBefore || null;

    this.logger.debug(`解析到 ${actions.length} 个动作，thinking: ${thinking?.substring(0, 50)}...`);

    return { thinking, actions };
  }

  /**
   * 执行动作列表
   */
  private async executeActions(state: AgentState, actions: ActionCall[], intention: string): Promise<{ success: boolean; feedback: string }> {
    const feedbacks: string[] = [];
    let allSuccess = true;

    this.logger.info(`📋 准备执行 ${actions.length} 个动作`);

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      this.logger.info(`🎬 执行动作 ${i + 1}/${actions.length}: ${action.actionType}`);

      try {
        const result = await state.context.executor.execute(action.actionType as ActionId, action.params);

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
}
