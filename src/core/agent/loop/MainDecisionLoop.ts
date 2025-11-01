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

export class MainDecisionLoop extends BaseLoop<AgentState> {
  private llmManager: any; // LLMManager type
  private evaluationCounter: number = 0;
  private promptsInitialized: boolean = false;

  constructor(state: AgentState, llmManager?: any) {
    super(state, 'MainDecisionLoop');

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
    // 1. 收集所有数据（类似 maicraft 的 get_all_data）
    const inputData = this.getAllData();

    // 2. 使用 promptManager.generatePrompt 生成提示词
    // 完全对应 maicraft 的: prompt_manager.generate_prompt("main_thinking", **input_data)
    const prompt = promptManager.generatePrompt('main_thinking', inputData);
    this.logger.info('💭 生成提示词完成');

    // 3. 调用 LLM
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
   * 收集所有数据
   *
   * 对应 maicraft 的 EnvironmentInfo.get_all_data()
   */
  private getAllData(): Record<string, any> {
    const { gameState } = this.state.context;
    const { memory, planningManager } = this.state;

    // 构建 basic_info 需要的数据
    const basicInfoData = {
      bot_name: 'AI Bot',
      player_name: gameState.playerName || 'Bot',
      self_info: `生命值: ${gameState.health}/${gameState.healthMax}, 饥饿值: ${gameState.food}/${gameState.foodMax}`,
      goal: this.state.goal,
      to_do_list: planningManager?.generateStatusSummary() || '暂无任务',
      self_status_info: `生命值: ${gameState.health}/${gameState.healthMax}, 饥饿值: ${gameState.food}/${gameState.foodMax}, 等级: ${gameState.level}`,
      inventory_info: gameState.getInventoryDescription?.() || '空',
      position: `位置: (${gameState.blockPosition.x}, ${gameState.blockPosition.y}, ${gameState.blockPosition.z})`,
      nearby_block_info: this.getNearbyBlocksInfo(),
      container_cache_info: this.getContainerCacheInfo(),
      nearby_entities_info: gameState.getNearbyEntitiesDescription?.() || '无',
      chat_str: this.getChatHistory(),
      mode: this.state.modeManager.getCurrentMode(),
      task: planningManager?.getCurrentTask()?.title || '暂无',
    };

    // 生成 basic_info
    const basicInfo = promptManager.generatePrompt('basic_info', basicInfoData);

    // 动态生成 eat_action
    const needEat = gameState.food / gameState.foodMax < 0.8;
    const eatAction = needEat
      ? `**eat**
食用某样物品回复饱食度
如果背包中没有食物，可以尝试找寻苹果，或寻找附近的动物以获得食物
\`\`\`json
{
    "action_type":"eat",
    "item":"食物名称"
}
\`\`\``
      : '';

    // 动态生成 kill_mob_action
    const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch'];
    const hasHostileMobs = gameState.nearbyEntities.some(e => hostileMobs.includes(e.name.toLowerCase()));
    const killMobAction = hasHostileMobs
      ? `**kill_mob**
杀死某个实体
\`\`\`json
{
    "action_type":"kill_mob",
    "entity":"需要杀死的实体名称",
    "timeout":"杀死实体的超时时间，单位：秒"
}
\`\`\``
      : '';

    // 获取失败提示
    const recentDecisions = memory.decision.getRecent(5);
    const failedDecisions = recentDecisions.filter(d => d.result === 'failed');
    const failedHint =
      failedDecisions.length > 0
        ? failedDecisions.map(d => `之前尝试"${d.intention}"失败了: ${d.feedback || '原因未知'}，请尝试别的方案。`).join('\n')
        : '';

    // 获取思考记录
    const thinkingList = memory.buildContextSummary({
      includeThoughts: 3,
      includeDecisions: 8,
    });

    // 返回 main_thinking 模板需要的所有参数
    return {
      basic_info: basicInfo,
      eat_action: eatAction,
      kill_mob_action: killMobAction,
      failed_hint: failedHint,
      thinking_list: thinkingList,
      nearby_block_info: basicInfoData.nearby_block_info,
      position: basicInfoData.position,
      chat_str: basicInfoData.chat_str,
      judge_guidance: this.getJudgeGuidance(),
    };
  }

  /**
   * 获取附近方块信息
   */
  private getNearbyBlocksInfo(): string {
    // TODO: 需要实现附近方块扫描功能
    // 可以通过 bot.findBlocks 或其他方法获取
    return '附近方块信息需要扫描';
  }

  /**
   * 获取容器缓存信息
   */
  private getContainerCacheInfo(): string {
    // TODO: 如果有容器缓存系统，从这里获取
    // 暂时返回空信息
    return '暂无容器缓存信息';
  }

  /**
   * 获取聊天历史
   */
  private getChatHistory(): string {
    const recentConversations = this.state.memory.conversation.getRecent(5);

    if (recentConversations.length === 0) {
      return '暂无聊天记录';
    }

    return recentConversations.map(c => `[${c.speaker}]: ${c.message}`).join('\n');
  }

  /**
   * 获取评估指导
   */
  private getJudgeGuidance(): string {
    // 从 memory 中获取最近的评估指导
    // 暂时返回空，后续可以实现评估指导存储
    return '';
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
