/**
 * 主决策循环
 * 不再持有 Agent 引用，只访问共享状态
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { AgentState, ActionCall } from '../types';
import type { ActionId } from '@/core/actions/ActionIds';
import { LLMManager } from '@/llm/LLMManager';
import type { LLMResponse } from '@/llm/types';
import { PromptManager } from '../prompt/PromptManager';

export class MainDecisionLoop {
  private state: AgentState;
  private isRunning: boolean = false;
  private loopTask: Promise<void> | null = null;
  private logger: Logger;

  private llmManager: any; // LLMManager type
  private promptManager: PromptManager;

  private evaluationCounter: number = 0;

  constructor(state: AgentState, llmManager?: any) {
    this.state = state;
    this.logger = getLogger('MainDecisionLoop');

    // 使用传入的 llmManager 或创建新实例
    this.llmManager = llmManager || new LLMManager(state.config.llm, this.logger);
    this.promptManager = new PromptManager();
  }

  /**
   * 启动循环
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('决策循环已在运行');
      return;
    }

    this.isRunning = true;
    this.loopTask = this.runLoop();
    this.logger.info('🚀 主决策循环已启动');
  }

  /**
   * 停止循环
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('🛑 主决策循环已停止');
  }

  /**
   * 主循环
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning && this.state.isRunning) {
      try {
        // 检查中断
        if (this.state.interrupt.isInterrupted()) {
          const reason = this.state.interrupt.getReason();
          this.state.interrupt.clear();
          this.logger.warn(`⚠️ 决策循环被中断: ${reason}`);
          await this.sleep(1000);
          continue;
        }

        // 检查是否允许 LLM 决策
        if (!this.state.modeManager.canUseLLMDecision()) {
          const autoSwitched = await this.state.modeManager.checkAutoTransitions();
          if (!autoSwitched) {
            await this.sleep(1000);
          }
          continue;
        }

        // 执行决策
        await this.executeDecisionCycle();

        // 定期评估
        this.evaluationCounter++;
        if (this.evaluationCounter % 5 === 0) {
          await this.evaluateTask();
        }
      } catch (error) {
        this.logger.error('❌ 决策循环异常', undefined, error as Error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * 执行一次决策周期
   */
  private async executeDecisionCycle(): Promise<void> {
    // 1. 收集环境信息
    const environmentData = this.collectEnvironmentData();

    // 2. 构建记忆上下文
    const memoryContext = this.state.memory.buildContextSummary({
      includeThoughts: 3,
      includeConversations: 5,
      includeDecisions: 8,
    });

    // 3. 生成提示词
    const prompt = this.promptManager.generateMainThinkingPrompt({
      ...environmentData,
      memoryContext,
    });

    this.logger.info('💭 生成提示词完成');

    // 4. 调用 LLM
    // 将字符串提示词转换为 ChatMessage 格式
    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    const response = await this.llmManager.chat(messages);

    this.logger.info('🤖 LLM 响应完成');

    // 5. 解析响应
    const { thinking, actions } = this.parseResponse(response);

    if (!actions || actions.length === 0) {
      this.logger.warn('⚠️ 无有效动作');
      return;
    }

    // 6. 记录思考
    if (thinking) {
      this.state.memory.recordThought(thinking);
    }

    // 7. 执行动作
    const result = await this.executeActions(actions, thinking || '未知意图');

    // 8. 记录决策
    this.state.memory.recordDecision(thinking || '未知意图', actions, result.success ? 'success' : 'failed', result.feedback);
  }

  /**
   * 收集环境数据
   */
  private collectEnvironmentData(): Record<string, any> {
    const { gameState } = this.state.context;
    const { planningManager } = this.state;

    return {
      playerName: gameState.playerName || 'unknown',
      position: gameState.getPositionDescription?.() || '未知位置',
      health: `${gameState.health || 0}/${gameState.healthMax || 20}`,
      food: `${gameState.food || 0}/${gameState.foodMax || 20}`,
      inventory: gameState.getInventoryDescription?.() || '空',
      nearbyEntities: gameState.getNearbyEntitiesDescription?.() || '无',
      goal: this.state.goal,
      planningStatus: planningManager.generateStatusSummary(),
      currentMode: this.state.modeManager.getCurrentMode(),
    };
  }

  /**
   * 解析响应
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

    // 提取思考
    const thinkingMatch = content.match(/【思考】([\s\S]*?)【动作】/);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;

    // 提取动作
    const jsonRegex = /\{[\s\S]*?"action_type"[\s\S]*?\}/g;
    const jsonMatches = content.match(jsonRegex);

    const actions: ActionCall[] = [];
    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const actionData = JSON.parse(jsonStr);
          actions.push({
            actionType: actionData.action_type,
            params: actionData,
          });
        } catch (error) {
          this.logger.warn(`⚠️ 解析动作失败: ${jsonStr}`);
        }
      }
    }

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
        this.logger.error(`❌ 动作执行异常:`, error);
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
   */
  private async evaluateTask(): Promise<void> {
    try {
      const environmentData = this.collectEnvironmentData();

      const prompt = this.promptManager.generateTaskEvaluationPrompt(environmentData);

      // 将字符串提示词转换为 ChatMessage 格式
      const messages = [
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llmManager.chat(messages);
      const evaluation = response.choices[0]?.message?.content;

      if (evaluation) {
        this.state.memory.recordThought(`[任务评估] ${evaluation}`);
      }
    } catch (error) {
      this.logger.error('❌ 任务评估异常', undefined, error as Error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
