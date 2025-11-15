/**
 * 聊天响应模板
 *
 * 对应 maicraft 的聊天相关模板
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册聊天响应模板
 */
export function initChatResponseTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'chat_response',
      `【最近对话】
{recent_conversations}

【当前活动】
{current_activity}

【当前位置】
{position}

请回复最近的聊天消息。`,
      '聊天响应',
      ['player_name', 'recent_conversations', 'current_activity', 'position'],
    ),
  );
}
