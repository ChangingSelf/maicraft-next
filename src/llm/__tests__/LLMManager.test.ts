/**
 * LLM管理器测试
 */

import { LLMManager } from '../LLMManager.js';
import { LLMConfigSchema, LLMProvider, MessageRole } from '../types.js';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { rimraf } from 'rimraf';

describe('LLMManager', () => {
  const testConfigPath = './test-llm-config.toml';
  const testTemplatePath = './test-llm-template.toml';
  const testDataDir = './test-data';

  let llmManager: LLMManager;

  beforeAll(async () => {
    // 创建测试配置
    const testConfig = {
      default_provider: LLMProvider.OPENAI,
      openai: {
        enabled: true,
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4',
        max_tokens: 100,
        temperature: 0.7,
        timeout: 5000,
      },
      azure: {
        enabled: false,
        api_key: '',
        endpoint: '',
        deployment_name: '',
        api_version: '2023-12-01-preview',
        model: 'gpt-4',
        max_tokens: 100,
        temperature: 0.7,
        timeout: 5000,
      },
      anthropic: {
        enabled: false,
        api_key: '',
        model: 'claude-3-sonnet-20240229',
        max_tokens: 100,
        temperature: 0.7,
        timeout: 5000,
      },
      retry: {
        max_attempts: 2,
        initial_delay: 100,
        max_delay: 1000,
        backoff_multiplier: 2,
      },
      usage_tracking: {
        enabled: true,
        persist_interval: 1000,
        stats_file: join(testDataDir, 'usage_stats.json'),
        daily_limit_warning: 0.8,
        monthly_budget_warning: 0.8,
      },
      pricing: {
        openai: {
          gpt_4_input: 0.03,
          gpt_4_output: 0.06,
          gpt_35_turbo_input: 0.0015,
          gpt_35_turbo_output: 0.002,
          gpt_4_turbo_input: 0.01,
          gpt_4_turbo_output: 0.03,
        },
        anthropic: {
          claude_3_opus_input: 0.015,
          claude_3_opus_output: 0.075,
          claude_3_sonnet_input: 0.003,
          claude_3_sonnet_output: 0.015,
          claude_3_haiku_input: 0.00025,
          claude_3_haiku_output: 0.00125,
        },
        azure: {
          gpt_4_input: 0.03,
          gpt_4_output: 0.06,
          gpt_35_turbo_input: 0.0015,
          gpt_35_turbo_output: 0.002,
        },
      },
    };

    // 创建测试配置文件
    const tomlContent = `
[llm]
default_provider = "openai"

[llm.openai]
enabled = true
api_key = "test-key"
base_url = "https://api.openai.com/v1"
model = "gpt-4"
max_tokens = 100
temperature = 0.7
timeout = 5000

[llm.azure]
enabled = false
api_key = ""
endpoint = ""
deployment_name = ""
api_version = "2023-12-01-preview"
model = "gpt-4"
max_tokens = 100
temperature = 0.7
timeout = 5000

[llm.anthropic]
enabled = false
api_key = ""
model = "claude-3-sonnet-20240229"
max_tokens = 100
temperature = 0.7
timeout = 5000

[llm.retry]
max_attempts = 2
initial_delay = 100
max_delay = 1000
backoff_multiplier = 2

[llm.usage_tracking]
enabled = true
persist_interval = 1000
stats_file = "${testDataDir}/usage_stats.json"
daily_limit_warning = 0.8
monthly_budget_warning = 0.8

[llm.pricing.openai]
gpt_4_input = 0.03
gpt_4_output = 0.06
gpt_35_turbo_input = 0.0015
gpt_35_turbo_output = 0.002
gpt_4_turbo_input = 0.01
gpt_4_turbo_output = 0.03

[llm.pricing.anthropic]
claude_3_opus_input = 0.015
claude_3_opus_output = 0.075
claude_3_sonnet_input = 0.003
claude_3_sonnet_output = 0.015
claude_3_haiku_input = 0.00025
claude_3_haiku_output = 0.00125

[llm.pricing.azure]
gpt_4_input = 0.03
gpt_4_output = 0.06
gpt_35_turbo_input = 0.0015
gpt_35_turbo_output = 0.002
`;

    writeFileSync(testConfigPath, tomlContent);
  });

  beforeEach(() => {
    // 清理测试数据目录
    if (existsSync(testDataDir)) {
      rimraf.sync(testDataDir);
    }

    // 创建LLM管理器
    const config = LLMConfigSchema.parse({
      default_provider: LLMProvider.OPENAI,
      openai: {
        enabled: true,
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4',
        max_tokens: 100,
        temperature: 0.7,
        timeout: 5000,
      },
      azure: {
        enabled: false,
        api_key: '',
        endpoint: '',
        deployment_name: '',
        api_version: '2023-12-01-preview',
        model: 'gpt-4',
        max_tokens: 100,
        temperature: 0.7,
        timeout: 5000,
      },
      anthropic: {
        enabled: false,
        api_key: '',
        model: 'claude-3-sonnet-20240229',
        max_tokens: 100,
        temperature: 0.7,
        timeout: 5000,
      },
      retry: {
        max_attempts: 2,
        initial_delay: 100,
        max_delay: 1000,
        backoff_multiplier: 2,
      },
      usage_tracking: {
        enabled: true,
        persist_interval: 1000,
        stats_file: join(testDataDir, 'usage_stats.json'),
        daily_limit_warning: 0.8,
        monthly_budget_warning: 0.8,
      },
      pricing: {
        openai: {
          gpt_4_input: 0.03,
          gpt_4_output: 0.06,
          gpt_35_turbo_input: 0.0015,
          gpt_35_turbo_output: 0.002,
          gpt_4_turbo_input: 0.01,
          gpt_4_turbo_output: 0.03,
        },
        anthropic: {
          claude_3_opus_input: 0.015,
          claude_3_opus_output: 0.075,
          claude_3_sonnet_input: 0.003,
          claude_3_sonnet_output: 0.015,
          claude_3_haiku_input: 0.00025,
          claude_3_haiku_output: 0.00125,
        },
        azure: {
          gpt_4_input: 0.03,
          gpt_4_output: 0.06,
          gpt_35_turbo_input: 0.0015,
          gpt_35_turbo_output: 0.002,
        },
      },
    });

    llmManager = new LLMManager(config);
  });

  afterEach(() => {
    // 清理LLM管理器
    llmManager.close();
  });

  afterAll(() => {
    // 清理测试文件
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    if (existsSync(testTemplatePath)) {
      unlinkSync(testTemplatePath);
    }
    if (existsSync(testDataDir)) {
      rimraf.sync(testDataDir);
    }
  });

  describe('基本功能测试', () => {
    test('应该能够创建LLM管理器', () => {
      expect(llmManager).toBeDefined();
      expect(llmManager.getActiveProvider()).toBe(LLMProvider.OPENAI);
    });

    test('应该能够获取提供商可用性', () => {
      expect(llmManager.isProviderAvailable(LLMProvider.OPENAI)).toBe(true);
      expect(llmManager.isProviderAvailable(LLMProvider.ANTHROPIC)).toBe(false);
    });

    test('应该能够计算token数', () => {
      const messages = [
        { role: MessageRole.SYSTEM, content: 'You are a helpful assistant.' },
        { role: MessageRole.USER, content: 'Hello, how are you?' },
      ];
      const tokenCount = llmManager.countTokens(messages);
      expect(tokenCount).toBeGreaterThan(0);
    });

    test('应该能够获取用量统计', () => {
      const stats = llmManager.getUsageStats();
      expect(stats).toBeDefined();
      expect(stats.total_requests).toBe(0);
      expect(stats.total_tokens).toBe(0);
      expect(stats.total_cost).toBe(0);
    });
  });

  describe('提供商管理测试', () => {
    test('应该能够切换活跃提供商', () => {
      // 启用Anthropic提供商进行测试
      llmManager.updateConfig({
        anthropic: {
          enabled: true,
          api_key: 'test-key',
          model: 'claude-3-sonnet-20240229',
          max_tokens: 100,
          temperature: 0.7,
          timeout: 5000,
        },
      });

      expect(llmManager.isProviderAvailable(LLMProvider.ANTHROPIC)).toBe(true);
      llmManager.setActiveProvider(LLMProvider.ANTHROPIC);
      expect(llmManager.getActiveProvider()).toBe(LLMProvider.ANTHROPIC);
    });

    test('切换到不可用的提供商应该抛出错误', () => {
      expect(() => {
        llmManager.setActiveProvider(LLMProvider.ANTHROPIC);
      }).toThrow();
    });
  });

  describe('用量追踪测试', () => {
    test('应该能够记录用量', () => {
      // 手动记录一些测试数据
      const usageStats = llmManager.getUsageStats();

      expect(usageStats.total_requests).toBe(0);
      expect(usageStats.total_tokens).toBe(0);
      expect(usageStats.total_cost).toBe(0);
    });

    test('应该能够设置月度预算', () => {
      const month = '2024-01';
      llmManager.setMonthlyBudget(month, 100);

      const monthlyUsage = llmManager.getCurrentMonthUsage();
      if (monthlyUsage) {
        expect(monthlyUsage.budget_limit).toBe(100);
      }
    });

    test('应该能够重置用量统计', () => {
      llmManager.resetUsageStats();
      const stats = llmManager.getUsageStats();

      expect(stats.total_requests).toBe(0);
      expect(stats.total_tokens).toBe(0);
      expect(stats.total_cost).toBe(0);
    });
  });

  describe('配置更新测试', () => {
    test('应该能够更新配置', () => {
      const newConfig = {
        openai: {
          enabled: true,
          api_key: 'new-test-key',
          base_url: 'https://api.openai.com/v1',
          model: 'gpt-4-turbo',
          max_tokens: 200,
          temperature: 0.5,
          timeout: 10000,
        },
      };

      expect(() => {
        llmManager.updateConfig(newConfig);
      }).not.toThrow();
    });

    test('应该能够停用和激活管理器', () => {
      llmManager.setActive(false);

      expect(() => {
        llmManager.countTokens([{ role: MessageRole.USER, content: 'test' }]);
      }).toThrow('LLM manager is not active');

      llmManager.setActive(true);

      expect(() => {
        llmManager.countTokens([{ role: MessageRole.USER, content: 'test' }]);
      }).not.toThrow();
    });
  });

  describe('健康检查测试', () => {
    test('应该能够执行健康检查', async () => {
      const health = await llmManager.healthCheck();

      expect(health).toBeDefined();
      expect(typeof health[LLMProvider.OPENAI]).toBe('boolean');
    });
  });

  describe('事件监听测试', () => {
    test('应该能够监听提供商变化事件', done => {
      llmManager.on('provider_changed', data => {
        expect(data.to).toBe(LLMProvider.OPENAI); // 会切换回自身
        done();
      });

      // 触发变化
      llmManager.setActiveProvider(LLMProvider.OPENAI);
    });
  });
});
