/**
 * 基础信息模板
 * 
 * 对应 maicraft 的 basic_info 模板
 */

import { PromptTemplate, promptManager } from '../prompt_manager';

/**
 * 注册 basic_info 模板
 */
export function initBasicInfoTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'basic_info',
      `你是{bot_name}，游戏名叫{player_name},你正在游玩1.18.5以上版本的Minecraft。
{self_info}

**当前目标和任务列表**：
目标：{goal}
任务列表：
{to_do_list}

**当前状态**
{self_status_info}

**物品栏和工具**
{inventory_info}

**位置信息**
{position}

**周围方块的信息**
{nearby_block_info}

**周围箱子信息**
{container_cache_info}

**周围实体信息**
{nearby_entities_info}

**玩家聊天记录**
{chat_str}
`,
      '基础信息',
      [
        'nearby_entities_info',
        'self_info',
        'mode',
        'goal',
        'task',
        'nearby_block_info',
        'position',
        'chat_str',
        'to_do_list',
        'container_cache_info',
        'inventory_info',
        'self_status_info',
        'player_name',
        'bot_name',
      ],
    ),
  );
}

