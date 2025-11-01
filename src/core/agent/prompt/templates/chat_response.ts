/**
 * 聊天响应模板
 * 
 * 对应 maicraft 的聊天相关模板
 */

import { PromptTemplate, promptManager } from '../prompt_manager';

/**
 * 注册聊天响应模板
 */
export function initChatResponseTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'chat_response',
      `你是一个 Minecraft AI Agent，名字是 {player_name}。

【最近对话】
{recent_conversations}

【当前活动】
{current_activity}

【当前位置】
{position}

请回复最近的聊天消息。要求：
1. 回复要自然、友好
2. 如果有人问你在做什么，简要说明当前活动
3. 如果有人需要帮助，给出建议或表示愿意协助
4. 保持简洁，不要过长

【输出格式】
直接输出你的回复内容，不需要JSON格式。
`,
      '聊天响应',
      ['player_name', 'recent_conversations', 'current_activity', 'position'],
    ),
  );
}

