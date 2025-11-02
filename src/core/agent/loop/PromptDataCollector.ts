/**
 * 提示词数据收集器
 * 专门负责收集和格式化 LLM 提示词所需数据
 */

import { getLogger, type Logger } from '@/utils/Logger';
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
  private logger: Logger;

  constructor(
    private state: AgentState,
    private actionPromptGenerator: ActionPromptGenerator,
  ) {
    this.logger = getLogger('PromptDataCollector');
  }

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
    try {
      const { gameState } = this.state.context;
      const nearbyBlocks = gameState.getNearbyBlocks?.(16) || [];

      // 调试日志
      this.logger.debug(`🔍 获取周围方块: 找到 ${nearbyBlocks.length} 个方块`);
      if (nearbyBlocks.length > 0) {
        this.logger.debug(`📍 方块列表: ${nearbyBlocks.slice(0, 5).map(b => b.name).join(', ')}${nearbyBlocks.length > 5 ? '...' : ''}`);
      }

      if (nearbyBlocks.length === 0) {
        return '附近没有重要方块';
      }

      // 过滤重要方块并按距离排序
      const importantPatterns = [
        'chest', 'furnace', 'crafting_table', 'bed', 'door', 'torch', 'workbench',
        'ore', 'log', 'wood', 'sapling', 'diamond', 'emerald', 'gold', 'iron',
        'coal', 'stone', 'planks', 'brick', 'glass', 'wool', 'bookshelf'
      ];

      const importantBlocks = nearbyBlocks.filter(block =>
        importantPatterns.some(pattern => block.name.includes(pattern))
      );

      if (importantBlocks.length === 0) {
        return '附近没有发现重要方块';
      }

      // 计算距离并排序，显示最近的方块
      const botPosition = this.state.context.gameState.blockPosition;
      importantBlocks.sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.position.x - botPosition.x, 2) +
          Math.pow(a.position.y - botPosition.y, 2) +
          Math.pow(a.position.z - botPosition.z, 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.position.x - botPosition.x, 2) +
          Math.pow(b.position.y - botPosition.y, 2) +
          Math.pow(b.position.z - botPosition.z, 2)
        );
        return distA - distB;
      });

      // 生成详细信息，包含坐标
      const blockLines: string[] = [];

      // 显示每个重要方块的详细信息
      for (const block of importantBlocks.slice(0, 15)) { // 最多显示15个方块
        const pos = block.position;
        const distance = Math.sqrt(
          Math.pow(pos.x - botPosition.x, 2) +
          Math.pow(pos.y - botPosition.y, 2) +
          Math.pow(pos.z - botPosition.z, 2)
        );

        let line = `  ${block.name} at (${pos.x}, ${pos.y}, ${pos.z})`;
        line += ` [距离: ${distance.toFixed(1)}格]`;

        // 添加特殊方块的状态信息
        if (block.state && Object.keys(block.state).length > 0) {
          const stateStr = Object.entries(block.state)
            .map(([key, value]) => `${key}:${value}`)
            .join(', ');
          line += ` [${stateStr}]`;
        }

        blockLines.push(line);
      }

      return `附近重要方块 (${importantBlocks.length}个):\n${blockLines.join('\n')}`;
    } catch (error) {
      return '获取附近方块信息失败';
    }
  }

  private getContainerCacheInfo(): string {
    try {
      const { gameState } = this.state.context;
      const nearbyContainers = gameState.getNearbyContainers?.(32) || [];

      // 调试日志
      this.logger.debug(`📦 获取容器信息: 找到 ${nearbyContainers.length} 个容器`);
      if (nearbyContainers.length > 0) {
        this.logger.debug(`📦 容器列表: ${nearbyContainers.slice(0, 3).map(c => c.type).join(', ')}${nearbyContainers.length > 3 ? '...' : ''}`);
      }

      if (nearbyContainers.length === 0) {
        return '附近没有已知的容器';
      }

      // 按距离排序容器
      nearbyContainers.sort((a, b) => {
        const distA = a.position.distanceTo(gameState.blockPosition);
        const distB = b.position.distanceTo(gameState.blockPosition);
        return distA - distB;
      });

      const containerLines: string[] = [];

      for (const container of nearbyContainers.slice(0, 8)) { // 最多显示8个容器
        const pos = container.position;
        const distance = pos.distanceTo(gameState.blockPosition);

        let line = `  ${container.type}: ${container.name || '未命名容器'}`;
        line += ` at (${pos.x}, ${pos.y}, ${pos.z})`;
        line += ` [距离: ${distance.toFixed(1)}格]`;

        containerLines.push(line);

        // 显示物品信息
        if (container.items && container.items.length > 0) {
          // 显示前几种重要物品
          const importantItems = container.items
            .filter(item =>
              item.name.includes('diamond') ||
              item.name.includes('iron') ||
              item.name.includes('gold') ||
              item.name.includes('emerald') ||
              item.name.includes('tool') ||
              item.name.includes('sword') ||
              item.count >= 16
            )
            .slice(0, 5);

          if (importantItems.length > 0) {
            const itemDetails = importantItems.map(item => `${item.name}×${item.count}`).join(', ');
            containerLines.push(`    物品: ${itemDetails}`);
          } else {
            containerLines.push(`    物品: ${container.items.length}种 (共${container.items.reduce((sum, item) => sum + item.count, 0)}个)`);
          }
        } else {
          containerLines.push(`    物品: 空`);
        }

        // 显示容器状态（如熔炉燃料、进度等）
        if (container.state && Object.keys(container.state).length > 0) {
          const stateDetails = Object.entries(container.state)
            .filter(([key, value]) => key !== 'items') // 避免重复显示物品
            .map(([key, value]) => `${key}:${value}`)
            .join(', ');
          if (stateDetails) {
            containerLines.push(`    状态: ${stateDetails}`);
          }
        }
      }

      return `附近容器 (${nearbyContainers.length}个):\n${containerLines.join('\n')}`;
    } catch (error) {
      return '获取容器信息失败';
    }
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
