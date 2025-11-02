/**
 * 提示词数据收集器
 * 专门负责收集和格式化 LLM 提示词所需数据
 */

import type { AgentState } from '../types';
import type { ActionPromptGenerator } from '@/core/actions/ActionPromptGenerator';

export interface BasicInfoData {
  bot_name: string;
  player_name: string;
  self_info: string;
  goal: string;
  to_do_list: string;
  self_status_info: string;
  inventory_info: string;
  position: string;
  nearby_block_info: string;
  container_cache_info: string;
  nearby_entities_info: string;
  chat_str: string;
  mode: string;
  task: string;
  basic_info?: string; // 可选，由外部生成
}

export interface DynamicActionData {
  eat_action: string;
  kill_mob_action: string;
}

export interface MemoryData {
  failed_hint: string;
  thinking_list: string;
}

export interface MainThinkingData {
  basic_info: string;
  available_actions: string;
  eat_action: string;
  kill_mob_action: string;
  failed_hint: string;
  thinking_list: string;
  nearby_block_info: string;
  position: string;
  chat_str: string;
  judge_guidance: string;
}

export class PromptDataCollector {
  constructor(
    private state: AgentState,
    private actionPromptGenerator: ActionPromptGenerator,
  ) {}

  /**
   * 收集基础信息
   */
  collectBasicInfo(): BasicInfoData {
    const { gameState } = this.state.context;
    const { planningManager } = this.state;

    return {
      bot_name: 'AI Bot',
      player_name: gameState.playerName || 'Bot',
      self_info: this.formatSelfInfo(gameState),
      goal: this.state.goal,
      to_do_list: planningManager?.generateStatusSummary() || '暂无任务',
      self_status_info: this.formatStatusInfo(gameState),
      inventory_info: gameState.getInventoryDescription?.() || '空',
      position: this.formatPosition(gameState.blockPosition),
      nearby_block_info: this.getNearbyBlocksInfo(),
      container_cache_info: this.getContainerCacheInfo(),
      nearby_entities_info: gameState.getNearbyEntitiesDescription?.() || '无',
      chat_str: this.getChatHistory(),
      mode: this.state.modeManager.getCurrentMode(),
      task: planningManager?.getCurrentTask()?.title || '暂无',
    };
  }

  /**
   * 收集动态动作提示
   */
  collectDynamicActions(): DynamicActionData {
    const { gameState } = this.state.context;

    return {
      eat_action: this.shouldShowEatAction(gameState) ? this.generateEatActionPrompt() : '',
      kill_mob_action: this.shouldShowKillMobAction(gameState) ? this.generateKillMobActionPrompt() : '',
    };
  }

  /**
   * 收集记忆相关数据
   */
  collectMemoryData(): MemoryData {
    const { memory } = this.state;

    const recentDecisions = memory.decision.getRecent(5);
    const failedDecisions = recentDecisions.filter(d => d.result === 'failed');

    return {
      failed_hint: this.formatFailedHints(failedDecisions),
      thinking_list: memory.buildContextSummary({
        includeThoughts: 3,
        includeDecisions: 8,
      }),
    };
  }

  /**
   * 收集所有数据（用于 main_thinking）
   */
  collectAllData(): MainThinkingData {
    const basicInfo = this.collectBasicInfo();
    const dynamicActions = this.collectDynamicActions();
    const memoryData = this.collectMemoryData();

    return {
      basic_info: basicInfo.basic_info || '', // 需要从外部生成
      available_actions: this.actionPromptGenerator.generatePrompt(),
      ...dynamicActions,
      ...memoryData,
      nearby_block_info: basicInfo.nearby_block_info,
      position: basicInfo.position,
      chat_str: basicInfo.chat_str,
      judge_guidance: this.getJudgeGuidance(),
    };
  }

  /**
   * 生成完整的 main_thinking 数据（包含格式化的 basic_info）
   */
  collectMainThinkingData(): MainThinkingData {
    const basicInfo = this.collectBasicInfo();
    const dynamicActions = this.collectDynamicActions();
    const memoryData = this.collectMemoryData();

    // 这里需要访问 promptManager 来生成 basic_info
    // 由于循环依赖，我们返回基础数据，让调用者处理
    return {
      basic_info: '', // 由调用者设置
      available_actions: this.actionPromptGenerator.generatePrompt(),
      ...dynamicActions,
      ...memoryData,
      nearby_block_info: basicInfo.nearby_block_info,
      position: basicInfo.position,
      chat_str: basicInfo.chat_str,
      judge_guidance: this.getJudgeGuidance(),
    };
  }

  // 私有辅助方法

  private formatSelfInfo(gameState: any): string {
    return `生命值: ${gameState.health}/${gameState.healthMax}, 饥饿值: ${gameState.food}/${gameState.foodMax}`;
  }

  private formatStatusInfo(gameState: any): string {
    return `生命值: ${gameState.health}/${gameState.healthMax}, 饥饿值: ${gameState.food}/${gameState.foodMax}, 等级: ${gameState.level}`;
  }

  private formatPosition(pos: any): string {
    return `位置: (${pos.x}, ${pos.y}, ${pos.z})`;
  }

  private shouldShowEatAction(gameState: any): boolean {
    return gameState.food / gameState.foodMax < 0.8;
  }

  private shouldShowKillMobAction(gameState: any): boolean {
    const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch'];
    return gameState.nearbyEntities.some((e: any) => hostileMobs.includes(e.name.toLowerCase()));
  }

  private generateEatActionPrompt(): string {
    return `**eat**
食用某样物品回复饱食度
如果背包中没有食物，可以尝试找寻苹果，或寻找附近的动物以获得食物
\`\`\`json
{
    "action_type":"eat",
    "item":"食物名称"
}
\`\`\``;
  }

  private generateKillMobActionPrompt(): string {
    return `**kill_mob**
杀死某个实体
\`\`\`json
{
    "action_type":"kill_mob",
    "entity":"需要杀死的实体名称",
    "timeout":"杀死实体的超时时间，单位：秒"
}
\`\`\``;
  }

  private formatFailedHints(failedDecisions: any[]): string {
    if (failedDecisions.length === 0) return '';

    return failedDecisions.map(d => `之前尝试"${d.intention}"失败了: ${d.feedback || '原因未知'}，请尝试别的方案。`).join('\n');
  }

  private getNearbyBlocksInfo(): string {
    // TODO: 实现附近方块扫描功能
    // 可以通过 bot.findBlocks 或其他方法获取
    return '附近方块信息需要扫描';
  }

  private getContainerCacheInfo(): string {
    // TODO: 如果有容器缓存系统，从这里获取
    // 暂时返回空信息
    return '暂无容器缓存信息';
  }

  private getChatHistory(): string {
    const recentConversations = this.state.memory.conversation.getRecent(5);
    if (recentConversations.length === 0) {
      return '暂无聊天记录';
    }
    return recentConversations.map(c => `[${c.speaker}]: ${c.message}`).join('\n');
  }

  private getJudgeGuidance(): string {
    // 从 memory 中获取最近的评估指导
    // 暂时返回空，后续可以实现评估指导存储
    return '';
  }
}
