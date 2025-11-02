# 决策循环 (Decision Loop)

> 本文档介绍 Maicraft-Next 的决策循环机制

---

## 🎯 两种决策循环

### MainDecisionLoop - 主决策循环

负责 Agent 的主要自主决策和行动。

**工作流程**：

1. 收集当前状态和上下文
2. 生成决策 Prompt
3. 调用 LLM 获取决策
4. 解析并执行动作
5. 记录决策和结果
6. 等待下一次循环

### ChatLoop - 聊天循环

处理与玩家的聊天互动。

**触发方式**：

- 玩家发送聊天消息
- 消息包含特定前缀（如 `@bot`）

---

## 💻 基本流程

### MainDecisionLoop

```typescript
export class MainDecisionLoop {
  async run(): Promise<void> {
    while (this.state.isRunning) {
      // 1. 检查中断
      if (this.state.interrupt.isInterrupted()) {
        await this.handleInterrupt();
      }

      // 2. 更新任务进度
      await this.state.planningManager.updateProgress();

      // 3. 生成 Prompt
      const prompt = await this.generatePrompt();

      // 4. 调用 LLM
      const response = await this.llmManager.chat(prompt);

      // 5. 记录思维
      await this.state.memory.thought.record({
        category: 'decision',
        content: response.thinking,
      });

      // 6. 执行动作
      const result = await this.executeAction(response.action, response.params);

      // 7. 记录决策
      await this.state.memory.decision.record({
        action: response.action,
        params: response.params,
        result,
        reasoning: response.thinking,
      });

      // 8. 等待
      await this.sleep(this.config.decision_interval || 5000);
    }
  }
}
```

### ChatLoop

```typescript
export class ChatLoop {
  async handleMessage(username: string, message: string): Promise<void> {
    // 1. 记录对话
    await this.state.memory.conversation.record({
      speaker: username,
      message,
    });

    // 2. 生成回复 Prompt
    const prompt = this.promptManager.generateChatResponse(this.state.context, {
      username,
      message,
      conversationHistory: await this.state.memory.conversation.query({ limit: 10 }),
    });

    // 3. 调用 LLM
    const response = await this.llmManager.chat(prompt);

    // 4. 发送回复
    await this.state.context.executor.execute(ActionIds.CHAT, {
      message: response.content,
    });

    // 5. 记录回复
    await this.state.memory.conversation.record({
      speaker: this.state.context.bot.username,
      message: response.content,
      response_to: username,
    });
  }
}
```

---

## 🔧 配置选项

```toml
[agent]
decision_interval = 5000  # 决策间隔（毫秒）
chat_enabled = true       # 是否启用聊天循环
```

---

## 📚 相关文档

- [代理系统](agent-system.md)
- [LLM 集成](llm-integration.md)
- [提示词系统](prompt-system.md)

---

_最后更新: 2025-11-01_
