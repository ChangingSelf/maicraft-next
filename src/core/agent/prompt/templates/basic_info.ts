/**
 * 基础信息模板
 *
 * 对应 maicraft 的 basic_info 模板
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册 basic_info 模板（动态部分）
 */
export function initBasicInfoTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'basic_info',
      `# 当前目标和任务规划
目标：{goal}

{to_do_list}

# 当前状态
{self_status_info}

# 物品栏
{inventory_info}

# 位置信息
{position}

# 周围{block_search_distance}格内方块
{nearby_block_info}

# 周围{container_search_distance}格内箱子
{container_cache_info}

# 周围{entity_search_distance}格内实体
{nearby_entities_info}

# 玩家聊天记录
{chat_str}
`,
      '基础信息（动态部分）',
      [
        'goal',
        'to_do_list',
        'self_status_info',
        'inventory_info',
        'position',
        'block_search_distance',
        'nearby_block_info',
        'container_search_distance',
        'container_cache_info',
        'entity_search_distance',
        'nearby_entities_info',
        'chat_str',
      ],
    ),
  );

  // 注册角色描述模板（静态部分）
  promptManager.registerTemplate(
    new PromptTemplate(
      'role_description',
      `你是{bot_name}，游戏名叫{player_name},你正在游玩1.18.5以上版本的Minecraft。

# 任务系统说明
任务系统会自动追踪你的进度，完成后会自动切换到下一个任务。你只需要专注执行动作来完成当前任务的目标。
`,
      '角色描述和任务系统说明',
      ['bot_name', 'player_name'],
    ),
  );
}
