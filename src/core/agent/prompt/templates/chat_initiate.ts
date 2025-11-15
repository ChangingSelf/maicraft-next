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
      `你是一个 Minecraft AI Agent，名字是 {player_name}。

【最近对话】
{recent_conversations}

【当前活动】
{current_activity}

【当前位置】
{position}

现在你想主动发起一个话题或分享一些信息。要求：
1. 可以分享你当前在做什么
2. 可以询问玩家的近况
3. 可以分享一些有趣的发现
4. 保持简洁自然

【输出格式】
直接输出你想说的内容，不需要JSON格式。
`,
      '主动聊天',
      ['player_name', 'recent_conversations', 'current_activity', 'position'],
    ),
  );
}
