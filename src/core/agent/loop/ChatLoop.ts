/**
 * 聊天循环
 */

import type { AgentState } from '../types';
import type { ConversationEntry } from '../memory/types';
import { LLMManager } from '@/llm/LLMManager';
import type { LLMResponse } from '@/llm/types';
import { PromptManager } from '../prompt/PromptManager';
import { ActionIds } from '@/core/actions/ActionIds';
import { BaseLoop } from './BaseLoop';

export class ChatLoop extends BaseLoop<AgentState> {
  private llmManager: any; // LLMManager type
  private promptManager: PromptManager;

  private activeValue: number = 5;
  private selfTriggered: boolean = false;

  constructor(state: AgentState, llmManager?: any) {
    super(state, 'ChatLoop');

    // 使用传入的 llmManager 或创建新实例
    this.llmManager = llmManager || new LLMManager(state.config.llm, this.logger);
    this.promptManager = new PromptManager();

    // 监听聊天事件
    this.setupChatListener();
  }

  /**
   * 设置聊天监听器
   */
  private setupChatListener(): void {
    this.state.context.events.on('chat', (data: any) => {
      // 记录到记忆系统
      this.state.memory.recordConversation('player', data.message, {
        username: data.username,
      });

      // 检查是否被呼叫
      const botName = this.state.config.bot?.name || 'bot';
      if (data.message.includes(botName)) {
        this.activeValue += 3;
      }
    });
  }

  /**
   * 执行一次循环迭代
   */
  protected async runLoopIteration(): Promise<void> {
    await this.sleep(500);

    // 获取最近的对话
    const recentConversations = this.state.memory.conversation.getRecent(1);

    if (recentConversations.length === 0) {
      return;
    }

    const lastConversation = recentConversations[0];

    // 检查是否应该响应
    if (this.shouldRespond(lastConversation)) {
      await this.respondToChat();
      this.activeValue -= 1;
    } else if (Math.random() < 0.02 && !this.selfTriggered) {
      // 随机自发聊天
      await this.initiateChat();
      this.selfTriggered = true;
    }
  }

  /**
   * 是否应该响应
   */
  private shouldRespond(conversation: ConversationEntry): boolean {
    if (conversation.speaker === 'ai') {
      return false; // 不响应自己的消息
    }

    const botName = this.state.config.bot?.name || 'bot';
    if (conversation.message.includes(botName)) {
      return true; // 被呼叫，一定响应
    }

    return this.activeValue > 0 && Math.random() < 0.3;
  }

  /**
   * 响应聊天
   */
  private async respondToChat(): Promise<void> {
    try {
      const memoryContext = this.state.memory.buildContextSummary({
        includeThoughts: 2,
        includeConversations: 10,
        includeDecisions: 3,
      });

      const environmentData = {
        position: this.state.context.gameState.getPositionDescription?.() || '未知位置',
        currentActivity: this.state.planningManager.getCurrentTask()?.title || '空闲中',
        memoryContext,
      };

      const prompt = this.promptManager.generateChatResponsePrompt(environmentData);

      // 将字符串提示词转换为 ChatMessage 格式
      const messages = [
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llmManager.chat(messages);

      const message = this.parseChatResponse(response);

      if (message) {
        await this.state.context.executor.execute(ActionIds.CHAT, { message });
        this.state.memory.recordConversation('ai', message);
        this.logger.info(`💬 发送聊天: ${message}`);
      }
    } catch (error) {
      this.logger.error('❌ 响应聊天失败', undefined, error as Error);
    }
  }

  /**
   * 主动发起聊天
   */
  private async initiateChat(): Promise<void> {
    try {
      const memoryContext = this.state.memory.buildContextSummary({
        includeThoughts: 2,
        includeConversations: 5,
        includeDecisions: 3,
      });

      const environmentData = {
        position: this.state.context.gameState.getPositionDescription?.() || '未知位置',
        currentActivity: this.state.planningManager.getCurrentTask()?.title || '空闲中',
        memoryContext,
      };

      const prompt = this.promptManager.generateChatInitiatePrompt(environmentData);

      // 将字符串提示词转换为 ChatMessage 格式
      const messages = [
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llmManager.chat(messages);

      const message = this.parseChatResponse(response);

      if (message) {
        await this.state.context.executor.execute(ActionIds.CHAT, { message });
        this.state.memory.recordConversation('ai', message);
        this.logger.info(`💬 主动聊天: ${message}`);
      }
    } catch (error) {
      this.logger.error('❌ 主动聊天失败:', error);
    }
  }

  /**
   * 解析聊天响应
   */
  private parseChatResponse(response: LLMResponse): string | null {
    // 从 LLMResponse 中提取文本内容
    const content = response.choices[0]?.message?.content || '';

    if (!content) {
      return null;
    }

    // 尝试提取【回复】标签中的内容
    const messageMatch = content.match(/【回复】([\s\S]*?)$/);
    if (messageMatch) {
      return messageMatch[1].trim();
    }

    // 尝试 JSON 格式
    try {
      const json = JSON.parse(content);
      return json.message || null;
    } catch {
      // 如果都不是，直接返回原文
      return content.trim();
    }
  }
}
