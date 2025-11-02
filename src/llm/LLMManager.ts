/**
 * LLM客户端 - 参考原maicraft项目的LLMClient设计
 *
 * 提供简洁的LLM调用接口，正确使用system/user角色
 */

import { Logger, getLogger } from '../utils/Logger.js';
import {
  LLMConfig,
  LLMResponse,
  LLMRequestConfig,
  LLMError,
  LLMProvider,
  ChatMessage,
  MessageRole,
  TokenUsage,
  ToolCall,
  UsageStats
} from './types.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { UsageTracker } from './usage/UsageTracker.js';
import { ILLMProvider } from './providers/OpenAIProvider.js';

/**
 * LLM客户端响应接口 - 参考原maicraft项目设计
 */
export interface LLMClientResponse {
  success: boolean;
  content: string | null;
  model: string;
  usage: TokenUsage;
  finish_reason: string;
  error?: string;
  tool_calls?: ToolCall[];
}

/**
 * LLM客户端类 - 参考原maicraft项目的LLMClient
 */
export class LLMManager {
  private logger: Logger;
  private config: LLMConfig;
  private providers: Map<LLMProvider, ILLMProvider> = new Map();
  private usageTracker: UsageTracker;
  private activeProvider?: ILLMProvider;
  private isActive = true;

  constructor(config: LLMConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || getLogger('LLMManager');

    this.logger.info('LLM客户端初始化', {
      default_provider: config.default_provider,
    });

    // 初始化用量追踪器
    this.usageTracker = new UsageTracker(config, this.logger);

    // 初始化提供商
    this.initializeProviders();

    // 设置默认提供商
    this.setActiveProvider(config.default_provider);
  }

  /**
   * 简化的聊天接口 - 参考原maicraft的simple_chat
   */
  async simpleChat(
    prompt: string,
    systemMessage?: string,
    options?: Partial<LLMRequestConfig>
  ): Promise<string> {
    const result = await this.chatCompletion(prompt, systemMessage, options);

    if (result.success) {
      return result.content || '';
    } else {
      return result.error || '错误：未知错误';
    }
  }

  /**
   * 聊天完成接口 - 参考原maicraft的chat_completion
   */
  async chatCompletion(
    prompt: string,
    systemMessage?: string,
    options?: Partial<LLMRequestConfig>
  ): Promise<LLMClientResponse> {
    if (!this.isActive) {
      return {
        success: false,
        content: null,
        model: '',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        finish_reason: '',
        error: 'LLM客户端未激活'
      };
    }

    try {
      // 构建消息列表 - 正确使用system/user角色
      const messages: ChatMessage[] = [];

      if (systemMessage) {
        messages.push({
          role: MessageRole.SYSTEM,
          content: systemMessage
        });
      }

      messages.push({
        role: MessageRole.USER,
        content: prompt
      });

      // 构建请求参数
      const requestConfig: LLMRequestConfig = {
        model: this.getActiveProviderConfig().model,
        messages,
        max_tokens: this.getActiveProviderConfig().max_tokens,
        temperature: this.getActiveProviderConfig().temperature,
        ...options,
      };

      this.logger.debug('发送LLM请求', {
        provider: this.activeProvider?.provider,
        model: requestConfig.model,
        message_count: messages.length,
        has_system_message: !!systemMessage,
      });

      // 发送请求
      const response = await this.activeProvider!.chat(requestConfig);

      // 记录用量
      this.usageTracker.recordUsage(this.activeProvider!.provider, response.model, response.usage);

      // 转换为原maicraft格式的响应
      const result: LLMClientResponse = {
        success: true,
        content: response.choices[0]?.message?.content || '',
        model: response.model,
        usage: response.usage,
        finish_reason: response.choices[0]?.finish_reason || ''
      };

      // 处理工具调用
      if (response.choices[0]?.message?.tool_calls) {
        result.tool_calls = response.choices[0].message.tool_calls;
      }

      this.logger.debug('聊天请求成功', {
        provider: response.provider,
        response_id: response.id,
        usage: response.usage,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('LLM请求失败', { error: errorMessage });

      return {
        success: false,
        content: null,
        model: '',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        finish_reason: '',
        error: errorMessage
      };
    }
  }

  /**
   * 工具调用接口 - 参考原maicraft的call_tool
   */
  async callTool(
    prompt: string,
    tools: any[],
    systemMessage?: string,
    options?: Partial<LLMRequestConfig>
  ): Promise<ToolCall[] | null> {
    const response = await this.chatCompletion(prompt, systemMessage, {
      tools,
      tool_choice: 'auto',
      ...options
    });

    if (!response.success) {
      this.logger.error('工具调用失败', { error: response.error });
      return null;
    }

    return response.tool_calls || [];
  }

  /**
   * 设置活跃提供商
   */
  setActiveProvider(provider: LLMProvider): void {
    const instance = this.providers.get(provider);
    if (!instance) {
      throw new LLMError(`Provider ${provider} not initialized or disabled`, 'PROVIDER_NOT_FOUND');
    }

    const previousProvider = this.activeProvider;
    this.activeProvider = instance;

    this.logger.info('切换LLM提供商', {
      from: previousProvider?.provider,
      to: provider,
    });
  }

  /**
   * 获取活跃提供商
   */
  getActiveProvider(): LLMProvider | null {
    return this.activeProvider?.provider || null;
  }

  /**
   * 获取用量统计
   */
  getUsageStats(): UsageStats {
    return this.usageTracker.getStats();
  }

  /**
   * 获取今日用量
   */
  getTodayUsage() {
    return this.usageTracker.getTodayUsage();
  }

  /**
   * 获取本月用量
   */
  getCurrentMonthUsage() {
    return this.usageTracker.getCurrentMonthUsage();
  }

  /**
   * 设置月度预算
   */
  setMonthlyBudget(month: string, budget: number): void {
    this.usageTracker.setMonthlyBudget(month, budget);
  }

  /**
   * 重置用量统计
   */
  resetUsageStats(): void {
    this.usageTracker.resetStats();
  }

  /**
   * 清理旧数据
   */
  cleanupUsageData(daysToKeep?: number): void {
    this.usageTracker.cleanupOldData(daysToKeep);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LLMConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    this.logger.info('更新LLM配置', {
      changed_fields: Object.keys(config),
    });

    // 重新初始化需要更新的提供商
    this.reinitializeProvidersIfNeeded(oldConfig, this.config);

    // 如果默认提供商改变了，更新活跃提供商
    if (config.default_provider && config.default_provider !== oldConfig.default_provider) {
      this.setActiveProvider(config.default_provider);
    }

    // 更新用量追踪器配置
    this.usageTracker = new UsageTracker(this.config, this.logger);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<Record<LLMProvider, boolean>> {
    const health: Record<LLMProvider, boolean> = {} as any;

    for (const [provider, instance] of this.providers) {
      try {
        // 尝试获取模型列表作为健康检查
        const models = await instance.getModels();
        health[provider] = models.length > 0;
      } catch (error) {
        health[provider] = false;
        this.logger.warn('健康检查失败', {
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return health;
  }

  /**
   * 激活/停用管理器
   */
  setActive(active: boolean): void {
    this.isActive = active;
    this.logger.info('LLM客户端状态变更', { active });
  }

  /**
   * 关闭管理器
   */
  close(): void {
    this.isActive = false;

    // 关闭所有提供商
    for (const provider of this.providers.values()) {
      try {
        provider.close();
      } catch (error) {
        this.logger.error('关闭提供商失败', {
          provider: provider.provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 关闭用量追踪器
    this.usageTracker.close();

    this.logger.info('LLM客户端已关闭');
  }

  /**
   * 获取配置信息 - 参考原maicraft的get_config_info
   */
  getConfigInfo(): Record<string, any> {
    return {
      provider: this.getActiveProvider(),
      model: this.getActiveProviderConfig().model,
      base_url: this.getActiveProviderConfig().base_url,
      temperature: this.getActiveProviderConfig().temperature,
      max_tokens: this.getActiveProviderConfig().max_tokens,
      api_key_set: !!this.getActiveProviderConfig().api_key
    };
  }

  /**
   * 获取token使用量摘要 - 参考原maicraft的get_token_usage_summary
   */
  getTokenUsageSummary(provider?: LLMProvider): string {
    const stats = this.getUsageStats();
    return `Token使用统计:
总请求数: ${stats.total_requests}
总Prompt Tokens: ${stats.total_prompt_tokens}
总Completion Tokens: ${stats.total_completion_tokens}
总Tokens: ${stats.total_tokens}
总费用: $${stats.total_cost.toFixed(4)}`;
  }

  /**
   * 初始化所有提供商
   */
  private initializeProviders(): void {
    // OpenAI
    if (this.config.openai.enabled && this.config.openai.api_key) {
      try {
        const openaiProvider = new OpenAIProvider(this.config.openai, this.config.retry, this.logger);
        this.providers.set(LLMProvider.OPENAI, openaiProvider);
        this.logger.info('OpenAI提供商初始化成功');
      } catch (error) {
        this.logger.error('OpenAI提供商初始化失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.logger.info('OpenAI提供商已禁用或缺少API密钥');
    }

    // 其他提供商待实现...

    this.logger.info('LLM提供商初始化完成', {
      available_providers: Array.from(this.providers.keys()),
    });
  }

  /**
   * 获取活跃提供商配置
   */
  private getActiveProviderConfig() {
    if (!this.activeProvider) {
      throw new LLMError('No active provider', 'NO_ACTIVE_PROVIDER');
    }
    return this.getProviderConfig(this.activeProvider.provider);
  }

  /**
   * 获取提供商配置
   */
  private getProviderConfig(provider: LLMProvider) {
    switch (provider) {
      case LLMProvider.OPENAI:
        return this.config.openai;
      case LLMProvider.AZURE:
        return this.config.azure;
      case LLMProvider.ANTHROPIC:
        return this.config.anthropic;
      default:
        throw new LLMError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER');
    }
  }

  /**
   * 根据需要重新初始化提供商
   */
  private reinitializeProvidersIfNeeded(oldConfig: LLMConfig, newConfig: LLMConfig): void {
    // 检查OpenAI配置是否变化
    if (JSON.stringify(oldConfig.openai) !== JSON.stringify(newConfig.openai)) {
      this.providers.delete(LLMProvider.OPENAI);
      if (newConfig.openai.enabled && newConfig.openai.api_key) {
        try {
          const openaiProvider = new OpenAIProvider(newConfig.openai, newConfig.retry, this.logger);
          this.providers.set(LLMProvider.OPENAI, openaiProvider);
          this.logger.info('OpenAI提供商重新初始化成功');
        } catch (error) {
          this.logger.error('OpenAI提供商重新初始化失败', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // 类似的逻辑可以应用于其他提供商
  }
}

/**
 * 便捷函数：创建全局LLM客户端实例
 */
let globalLLMManager: LLMManager | null = null;

/**
 * LLMManager 工厂 - 确保单例
 */
export class LLMManagerFactory {
  private static instance: LLMManager | null = null;

  /**
   * 创建 LLMManager 实例（确保单例）
   */
  static create(config: LLMConfig, logger?: Logger): LLMManager {
    if (this.instance) {
      throw new LLMError('LLMManager already exists. Use getInstance() to get existing instance.', 'MANAGER_ALREADY_EXISTS');
    }
    this.instance = new LLMManager(config, logger);
    return this.instance;
  }

  /**
   * 获取已创建的 LLMManager 实例
   */
  static getInstance(): LLMManager {
    if (!this.instance) {
      throw new LLMError('LLMManager not initialized. Call create() first.', 'MANAGER_NOT_INITIALIZED');
    }
    return this.instance;
  }

  /**
   * 重置工厂（主要用于测试）
   */
  static reset(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }

  /**
   * 检查是否已创建实例
   */
  static hasInstance(): boolean {
    return this.instance !== null;
  }
}