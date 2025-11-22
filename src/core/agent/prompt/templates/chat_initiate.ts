/**
 * 主动聊天模板
 *
 * 对应 maicraft 的主动聊天模板
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册主动聊天模板
 */
export function initChatInitiateTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'chat_initiate',
      `# 最近对话
{recent_conversations}

# 当前活动
{current_activity}

# 当前位置
{position}

现在你想主动发起一个话题或分享一些信息。`,
      '主动聊天',
      ['player_name', 'recent_conversations', 'current_activity', 'position'],
    ),
  );
}
