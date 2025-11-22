/**
 * 提示词数据收集器
 * 专门负责收集和格式化 LLM 提示词所需数据
 */

import { getLogger, type Logger } from '@/utils/Logger';
import type { AgentState } from '@/core/agent/types';
import type { ActionPromptGenerator } from '@/core/actions/ActionPromptGenerator';
import { promptManager } from '@/core/agent/prompt';
import type { EntityInfo, GameState } from '@/core/state/GameState';

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
  // 嵌套模板（会自动生成）
  role_description: string;
  basic_info: string;

  // 动作相关
  available_actions: string;
  eat_action: string;
  kill_mob_action: string;

  // 记忆和历史
  failed_hint: string;
  thinking_list: string;
  judge_guidance: string;

  // 基础信息（用于嵌套模板）
  bot_name: string;
  player_name: string;
  goal: string;
  to_do_list: string;
  self_status_info: string;
  inventory_info: string;
  nearby_block_info: string;
  position: string;
  container_cache_info: string;
  nearby_entities_info: string;
  chat_str: string;
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
   *
   * 优化：利用自动嵌套模板引用，无需手动生成子模板
   * 提示词系统会自动识别并生成 role_description 和 basic_info
   */
  collectAllData(): MainThinkingData {
    const basicInfo = this.collectBasicInfo();
    const dynamicActions = this.collectDynamicActions();
    const memoryData = this.collectMemoryData();

    return {
      // 嵌套模板（会自动生成，无需提供值）
      role_description: '',
      basic_info: '',

      // 动作相关
      available_actions: this.actionPromptGenerator.generatePrompt(),
      ...dynamicActions,

      // 记忆和历史
      ...memoryData,
      judge_guidance: this.getJudgeGuidance(),

      // 基础参数（用于自动生成嵌套模板）
      bot_name: basicInfo.bot_name,
      player_name: basicInfo.player_name,
      goal: basicInfo.goal,
      to_do_list: basicInfo.to_do_list,
      self_status_info: basicInfo.self_status_info,
      inventory_info: basicInfo.inventory_info,
      nearby_block_info: basicInfo.nearby_block_info,
      position: basicInfo.position,
      container_cache_info: basicInfo.container_cache_info,
      nearby_entities_info: basicInfo.nearby_entities_info,
      chat_str: basicInfo.chat_str,
    };
  }

  /**
   * 生成完整的 main_thinking 数据（包含格式化的 basic_info）
   * @deprecated 使用 collectAllData() 代替
   */
  collectMainThinkingData(): MainThinkingData {
    return this.collectAllData();
  }

  // 私有辅助方法

  private formatSelfInfo(gameState: GameState): string {
    return `生命值: ${gameState.health}/${gameState.healthMax}, 饥饿值: ${gameState.food}/${gameState.foodMax}`;
  }

  private formatStatusInfo(gameState: GameState): string {
    return `生命值: ${gameState.health}/${gameState.healthMax}, 饥饿值: ${gameState.food}/${gameState.foodMax}, 等级: ${gameState.level}`;
  }

  private formatPosition(pos: any): string {
    return `位置: (${pos.x}, ${pos.y}, ${pos.z})`;
  }

  private shouldShowEatAction(gameState: GameState): boolean {
    return gameState.food / gameState.foodMax < 0.8;
  }

  private shouldShowKillMobAction(gameState: GameState): boolean {
    const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch'];
    return gameState.nearbyEntities.some((e: EntityInfo) => hostileMobs.includes(e.name.toLowerCase()));
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
      const { gameState, bot } = this.state.context;

      // 使用实时的玩家位置，而不是可能过时的gameState.blockPosition
      // gameState.blockPosition只在玩家移动时更新，静止时是过时的
      let currentPosition;
      if (bot?.entity?.position) {
        currentPosition = bot.entity.position.floored();
      } else {
        currentPosition = gameState.blockPosition;
      }

      if (!currentPosition) {
        return '位置信息不可用';
      }

      // 使用 NearbyBlockManager 获取格式化的方块信息
      const nearbyBlockManager = gameState.getNearbyBlockManager?.();
      if (nearbyBlockManager) {
        const blockInfo = nearbyBlockManager.getVisibleBlocksInfo(
          {
            x: currentPosition.x,
            y: currentPosition.y,
            z: currentPosition.z,
          },
          50,
        );

        this.logger.debug(`🔍 获取周围方块信息完成，使用实时位置 (${currentPosition.x}, ${currentPosition.y}, ${currentPosition.z})`);
        return blockInfo;
      }

      // 降级方案：使用旧的方式
      const nearbyBlocks = gameState.getNearbyBlocks?.(16) || [];
      this.logger.debug(`🔍 获取周围方块: 找到 ${nearbyBlocks.length} 个方块`);

      if (nearbyBlocks.length === 0) {
        return '附近没有方块信息';
      }

      // 不再过滤方块，显示所有方块（除了普通空气）
      const validBlocks = nearbyBlocks.filter(block => block.name !== 'air');

      if (validBlocks.length === 0) {
        return '附近都是空气方块';
      }

      // 按距离排序
      const botPosition = gameState.blockPosition;
      validBlocks.sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.position.x - botPosition.x, 2) + Math.pow(a.position.y - botPosition.y, 2) + Math.pow(a.position.z - botPosition.z, 2),
        );
        const distB = Math.sqrt(
          Math.pow(b.position.x - botPosition.x, 2) + Math.pow(b.position.y - botPosition.y, 2) + Math.pow(b.position.z - botPosition.z, 2),
        );
        return distA - distB;
      });

      // 按类型分组显示
      const groupedBlocks = new Map<string, Array<{ position: any; distance: number }>>();
      for (const block of validBlocks) {
        const pos = block.position;
        const distance = Math.sqrt(Math.pow(pos.x - botPosition.x, 2) + Math.pow(pos.y - botPosition.y, 2) + Math.pow(pos.z - botPosition.z, 2));

        if (!groupedBlocks.has(block.name)) {
          groupedBlocks.set(block.name, []);
        }
        groupedBlocks.get(block.name)!.push({ position: pos, distance });
      }

      // 生成详细信息
      const blockLines: string[] = [];
      for (const [blockName, positions] of groupedBlocks) {
        const count = positions.length;
        const nearest = positions[0]; // 已排序，第一个是最近的
        blockLines.push(
          `  ${blockName} (${count}个) 最近: (${nearest.position.x}, ${nearest.position.y}, ${nearest.position.z}) [${nearest.distance.toFixed(1)}格]`,
        );
      }

      return `附近方块 (${validBlocks.length}个):\n${blockLines.join('\n')}`;
    } catch (error) {
      this.logger.error('获取附近方块信息失败', undefined, error as Error);
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
        this.logger.debug(
          `📦 容器列表: ${nearbyContainers
            .slice(0, 3)
            .map(c => c.type)
            .join(', ')}${nearbyContainers.length > 3 ? '...' : ''}`,
        );
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

      for (const container of nearbyContainers.slice(0, 8)) {
        // 最多显示8个容器
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
            .filter(
              item =>
                item.name.includes('diamond') ||
                item.name.includes('iron') ||
                item.name.includes('gold') ||
                item.name.includes('emerald') ||
                item.name.includes('tool') ||
                item.name.includes('sword') ||
                item.count >= 16,
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
