/**
 * Prompt 管理器
 * 生成各种情况下的 LLM 提示词
 */

export class PromptManager {
  /**
   * 生成主思考提示词
   */
  generateMainThinkingPrompt(data: Record<string, any>): string {
    return `你是一个 Minecraft AI Agent。

【当前状态】
玩家: ${data.playerName}
位置: ${data.position}
生命值: ${data.health}
饥饿值: ${data.food}
背包: ${data.inventory}
附近实体: ${data.nearbyEntities}

【目标和任务】
${data.planningStatus || '暂无目标'}

【记忆上下文】
${data.memoryContext || '无'}

【当前模式】
${data.currentMode}

请思考接下来应该做什么，并输出格式如下：

【思考】
你的思考过程

【动作】
JSON 格式的动作列表，例如:
{
  "action_type": "move",
  "x": 100,
  "y": 64,
  "z": 200
}
`;
  }

  /**
   * 生成任务评估提示词
   */
  generateTaskEvaluationPrompt(data: Record<string, any>): string {
    return `评估当前任务进度：

【目标和任务】
${data.planningStatus || '暂无目标'}

【当前状态】
${data.inventory}

请评估任务完成情况并提出建议。`;
  }

  /**
   * 生成聊天响应提示词
   */
  generateChatResponsePrompt(data: Record<string, any>): string {
    return `你是一个 Minecraft AI Agent。

【最近对话】
${data.memoryContext}

【当前活动】
${data.currentActivity}

【位置】
${data.position}

请回复最近的聊天消息。输出格式：

【回复】
你的回复内容
`;
  }

  /**
   * 生成主动聊天提示词
   */
  generateChatInitiatePrompt(data: Record<string, any>): string {
    return `你是一个 Minecraft AI Agent，想要主动和玩家聊天。

【当前活动】
${data.currentActivity}

【位置】
${data.position}

请生成一句自然的聊天内容。输出格式：

【回复】
你要说的话
`;
  }
}
