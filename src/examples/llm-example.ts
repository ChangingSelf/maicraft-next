/**
 * LLM模块使用示例
 *
 * 展示如何使用LLM管理器进行聊天请求和用量追踪
 */

import { ConfigManager } from '../utils/Config.js';
import { LLMManager } from '../llm/LLMManager.js';
import { MessageRole } from '../llm/types.js';

async function main() {
  console.log('=== LLM模块使用示例 ===\n');

  try {
    // 1. 加载配置
    console.log('1. 加载配置...');
    const configManager = new ConfigManager('./config.toml', './config-template.toml');
    await configManager.loadConfig();
    const config = configManager.getConfig();

    // 2. 创建LLM管理器
    console.log('2. 创建LLM管理器...');
    const llmManager = new LLMManager(config.llm);

    // 3. 健康检查
    console.log('3. 执行健康检查...');
    const healthStatus = await llmManager.healthCheck();
    console.log('健康检查结果:', healthStatus);

    // 4. 获取模型列表
    console.log('\n4. 获取可用模型...');
    try {
      const models = await llmManager.getModels();
      console.log('可用模型:', models);
    } catch (error) {
      console.log('获取模型列表失败:', (error as Error).message);
    }

    // 5. 计算token数
    console.log('\n5. 计算token数...');
    const testMessages = [
      { role: MessageRole.SYSTEM, content: '你是一个Minecraft助手。' },
      { role: MessageRole.USER, content: '告诉我如何制作一把钻石剑？' }
    ];
    const tokenCount = llmManager.countTokens(testMessages);
    console.log('估算token数:', tokenCount);

    // 6. 发送聊天请求
    console.log('\n6. 发送聊天请求...');
    if (llmManager.getActiveProvider()) {
      try {
        const response = await llmManager.chat(testMessages, {
          max_tokens: 500,
          temperature: 0.7
        });

        console.log('聊天响应:');
        console.log('- ID:', response.id);
        console.log('- 模型:', response.model);
        console.log('- 内容:', response.choices[0].message.content);
        console.log('- Token使用:', response.usage);
      } catch (error) {
        console.log('聊天请求失败:', (error as Error).message);
      }
    } else {
      console.log('没有可用的LLM提供商');
    }

    // 7. 查看用量统计
    console.log('\n7. 用量统计...');
    const usageStats = llmManager.getUsageStats();
    console.log('总请求数:', usageStats.total_requests);
    console.log('总token数:', usageStats.total_tokens);
    console.log('总费用:', usageStats.total_cost.toFixed(4), 'USD');

    const todayUsage = llmManager.getTodayUsage();
    if (todayUsage) {
      console.log('今日用量:');
      console.log('- 请求数:', todayUsage.requests);
      console.log('- Token数:', todayUsage.total_tokens);
      console.log('- 费用:', todayUsage.cost.toFixed(4), 'USD');
    }

    // 8. 设置月度预算
    console.log('\n8. 设置月度预算...');
    const currentMonth = new Date().toISOString().substring(0, 7);
    llmManager.setMonthlyBudget(currentMonth, 50); // 50 USD

    // 9. 监听事件
    console.log('\n9. 监听LLM事件...');
    llmManager.on('chat_complete', (data) => {
      console.log('聊天完成事件:', {
        provider: data.provider,
        model: data.response.model,
        tokens_used: data.response.usage.total_tokens
      });
    });

    llmManager.on('provider_changed', (data) => {
      console.log('提供商切换事件:', data);
    });

    // 10. 清理资源
    console.log('\n10. 清理资源...');
    llmManager.close();
    configManager.close();

    console.log('\n✅ 示例执行完成！');

  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export { main };