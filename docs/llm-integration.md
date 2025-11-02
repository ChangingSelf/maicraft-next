# LLM 集成 (LLM Integration)

> 本文档介绍 Maicraft-Next 的 LLM 管理和调用系统

---

## 🎯 设计理念

### 统一的 LLM 管理

Maicraft-Next 提供了 `LLMManager` 来统一管理所有 LLM 提供商的调用，支持：

- ✅ 多提供商支持（OpenAI、Azure、Claude 等）
- ✅ 自动故障转移
- ✅ 用量统计和费用追踪
- ✅ 重试机制和错误处理
- ✅ 流式响应支持

---

## 📦 核心组件

### LLMManager

统一的 LLM 管理器，负责：

- 管理多个 LLM 提供商
- 路由请求到合适的提供商
- 统计用量和费用
- 处理错误和重试

### 支持的提供商

| 提供商               | 状态      | 支持模型                          |
| -------------------- | --------- | --------------------------------- |
| **OpenAI**           | ✅ 已实现 | gpt-4, gpt-3.5-turbo, gpt-4-turbo |
| **Azure OpenAI**     | 🚧 开发中 | gpt-4, gpt-35-turbo               |
| **Anthropic Claude** | 🚧 开发中 | claude-3-opus, claude-3-sonnet    |

---

## 💻 基本使用

### 初始化

```typescript
import { LLMManager } from '@/llm/LLMManager';
import { getLogger } from '@/utils/Logger';

// 从配置创建
const llmConfig = {
  default_provider: 'openai',
  openai: {
    enabled: true,
    api_key: 'sk-...',
    model: 'gpt-4',
    temperature: 0.7,
    max_tokens: 2000,
  },
};

const llmManager = new LLMManager(llmConfig, getLogger('LLM'));
```

### 发送聊天请求

```typescript
// 简单聊天
const response = await llmManager.chat([
  { role: 'system', content: '你是一个 Minecraft AI 代理' },
  { role: 'user', content: '我应该做什么？' },
]);

console.log(response.content);
console.log(`用量: ${response.usage.total_tokens} tokens`);
console.log(`费用: $${response.cost}`);
```

### 使用工具调用

```typescript
// 带工具的聊天
const response = await llmManager.chat(messages, {
  tools: [
    {
      name: 'move',
      description: '移动到指定坐标',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
        },
        required: ['x', 'y', 'z'],
      },
    },
  ],
  tool_choice: 'auto',
});

if (response.tool_calls) {
  for (const toolCall of response.tool_calls) {
    console.log(`调用工具: ${toolCall.name}`);
    console.log(`参数:`, toolCall.arguments);
  }
}
```

### 流式响应

```typescript
const stream = await llmManager.chatStream(messages);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

---

## 📊 用量统计

### 获取统计信息

```typescript
// 获取总用量
const stats = llmManager.getUsageStats();
console.log(`总请求: ${stats.totalRequests}`);
console.log(`总 tokens: ${stats.totalTokens}`);
console.log(`总费用: $${stats.totalCost}`);

// 按提供商统计
console.log('OpenAI:', stats.providers.openai);

// 按模型统计
console.log('GPT-4:', stats.models['gpt-4']);
```

### 持久化统计

```typescript
// 自动保存到 data/usage_stats.json
await llmManager.saveUsageStats();

// 加载历史统计
await llmManager.loadUsageStats();
```

---

## 🔄 与 Maicraft Python 的对比

| 方面           | Maicraft Python    | Maicraft-Next        |
| -------------- | ------------------ | -------------------- |
| **LLM 调用**   | openai_client 模块 | LLMManager 统一管理  |
| **提供商管理** | 单一提供商         | 多提供商支持         |
| **用量统计**   | 无                 | 完整的统计系统       |
| **错误处理**   | 基础重试           | 完善的错误处理和重试 |
| **流式响应**   | 支持               | 支持                 |
| **工具调用**   | 支持               | 支持                 |

---

## 🚀 高级特性

### 1. 自动故障转移

```typescript
const llmConfig = {
  default_provider: 'openai',
  fallback_providers: ['azure', 'anthropic'],
  // ...
};

// 如果 OpenAI 失败，自动尝试 Azure
const response = await llmManager.chat(messages);
```

### 2. 请求重试

```typescript
const llmConfig = {
  openai: {
    // ...
    retry_attempts: 3,
    retry_delay: 1000,
    retry_exponential: true,
  },
};
```

### 3. 速率限制

```typescript
const llmConfig = {
  openai: {
    // ...
    rate_limit: {
      requests_per_minute: 60,
      tokens_per_minute: 90000,
    },
  },
};
```

---

## 📚 在 Agent 中使用

### 在决策循环中

```typescript
// MainDecisionLoop.ts
export class MainDecisionLoop {
  constructor(
    private state: AgentState,
    private llmManager: LLMManager,
  ) {}

  async think(): Promise<void> {
    // 1. 生成 prompt
    const messages = [
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: this.getUserPrompt() },
    ];

    // 2. 调用 LLM
    const response = await this.llmManager.chat(messages, {
      tools: this.getAvailableTools(),
      temperature: 0.7,
      max_tokens: 2000,
    });

    // 3. 处理响应
    if (response.tool_calls) {
      await this.executeTools(response.tool_calls);
    }
  }
}
```

---

## 🚀 最佳实践

### 1. 合理设置温度

```typescript
// 创造性任务：高温度
const creativeResponse = await llmManager.chat(messages, {
  temperature: 0.9,
});

// 精确任务：低温度
const preciseResponse = await llmManager.chat(messages, {
  temperature: 0.3,
});
```

### 2. 控制 token 用量

```typescript
// 限制响应长度
const response = await llmManager.chat(messages, {
  max_tokens: 500, // 控制费用
});

// 截断历史消息
const recentMessages = messages.slice(-10); // 只保留最近 10 条
```

### 3. 使用流式响应提升体验

```typescript
// 对于长响应，使用流式
const stream = await llmManager.chatStream(messages);

for await (const chunk of stream) {
  // 实时显示 LLM 输出
  console.log(chunk.content);
}
```

### 4. 监控用量和费用

```typescript
// 定期检查费用
const stats = llmManager.getUsageStats();
if (stats.totalCost > 10) {
  console.warn('费用已超过 $10');
}

// 保存统计
await llmManager.saveUsageStats();
```

---

## 📚 相关文档

- [代理系统](agent-system.md) - 了解 LLM 如何在 Agent 中使用
- [提示词系统](prompt-system.md) - 了解如何生成高质量的 prompt

---

_最后更新: 2025-11-01_
