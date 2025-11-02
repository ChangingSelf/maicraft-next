/**
 * LLM管理器
 *
 * 统一管理所有LLM提供商，提供简化的接口和自动故障转移
 */

import { EventEmitter } from 'events';
import { Logger, getLogger } from '../utils/Logger.js';
import { ConfigManager } from '../utils/Config.js';
import { LLMConfig, LLMResponse, LLMRequestConfig, LLMError, LLMProvider as ProviderType, ChatMessage, UsageStats, MessageRole } from './types.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { UsageTracker } from './usage/UsageTracker.js';
import { ILLMProvider } from './providers/OpenAIProvider.js';

/**
 * LLM管理器类
 */
export class LLMManager extends EventEmitter {
  private logger: Logger;
  private config: LLMConfig;
  private providers: Map<ProviderType, ILLMProvider> = new Map();
  private usageTracker: UsageTracker;
  private activeProvider?: ILLMProvider;
  private isActive = true;

  constructor(config: LLMConfig, logger?: Logger) {
    super();

    this.config = config;
    this.logger = logger || getLogger('LLMManager');

    this.logger.info('LLM管理器初始化', {
      default_provider: config.default_provider,
    });

    // 初始化用量追踪器
    this.usageTracker = new UsageTracker(config, this.logger);

    // 初始化提供商
    this.initializeProviders();

    // 设置默认提供商
    this.setActiveProvider(config.default_provider);

    // 监听配置变化
    this.setupConfigListeners();
  }

  /**
   * 发送聊天请求
   */
  async chat(messages: ChatMessage[], options?: Partial<LLMRequestConfig>): Promise<LLMResponse> {
    if (!this.isActive) {
      throw new LLMError('LLM manager is not active', 'MANAGER_INACTIVE');
    }

    const requestConfig: LLMRequestConfig = {
      model: this.getActiveProviderConfig().model,
      messages,
      max_tokens: this.getActiveProviderConfig().max_tokens,
      temperature: this.getActiveProviderConfig().temperature,
      ...options,
    };

    this.logger.debug('发送聊天请求', {
      provider: this.activeProvider?.provider,
      model: requestConfig.model,
      message_count: messages.length,
      estimated_tokens: this.activeProvider?.countTokens(messages),
    });

    try {
      // 发送请求
      const response = await this.activeProvider!.chat(requestConfig);

      // 记录用量
      this.usageTracker.recordUsage(this.activeProvider!.provider, response.model, response.usage);

      // 发送事件
      this.emit('chat_complete', {
        provider: this.activeProvider!.provider,
        response,
        request: requestConfig,
      });

      this.logger.debug('聊天请求成功', {
        provider: response.provider,
        response_id: response.id,
        usage: response.usage,
      });

      return response;
    } catch (error) {
      // 如果是当前提供商失败，尝试故障转移
      if (error instanceof LLMError && this.shouldFailover(error)) {
        return this.handleFailover(requestConfig, error);
      }

      throw error;
    }
  }

  /**
   * 获取支持的模型列表
   */
  async getModels(): Promise<Record<ProviderType, string[]>> {
    const models: Record<ProviderType, string[]> = {} as any;

    for (const [provider, instance] of this.providers) {
      try {
        models[provider] = await instance.getModels();
      } catch (error) {
        this.logger.warn('获取模型列表失败', {
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
        models[provider] = [];
      }
    }

    return models;
  }

  /**
   * 计算token数量
   */
  countTokens(messages: ChatMessage, provider?: ProviderType): number {
    const targetProvider = provider ? this.providers.get(provider) : this.activeProvider;

    if (!targetProvider) {
      throw new LLMError(`Provider ${provider || 'default'} not available`, 'PROVIDER_NOT_FOUND');
    }

    const messageArray = Array.isArray(messages) ? messages : [messages];
    return targetProvider.countTokens(messageArray);
  }

  /**
   * 设置活跃提供商
   */
  setActiveProvider(provider: ProviderType): void {
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

    // 更新配置中的默认提供商
    if (provider !== this.config.default_provider) {
      this.config.default_provider = provider;
      // 这里可以触发配置更新事件
    }

    this.emit('provider_changed', {
      from: previousProvider?.provider,
      to: provider,
    });
  }

  /**
   * 获取活跃提供商
   */
  getActiveProvider(): ProviderType | null {
    return this.activeProvider?.provider || null;
  }

  /**
   * 检查提供商是否可用
   */
  isProviderAvailable(provider: ProviderType): boolean {
    return this.providers.has(provider);
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

    this.emit('config_updated', { oldConfig, newConfig: this.config });
  }

  /**
   * 强制故障转移
   */
  async forceFailover(): Promise<LLMResponse | null> {
    if (this.providers.size <= 1) {
      this.logger.warn('没有备用提供商可供故障转移');
      return null;
    }

    // 找到一个可用的备用提供商
    const availableProviders = Array.from(this.providers.keys()).filter(p => p !== this.activeProvider?.provider);

    for (const provider of availableProviders) {
      try {
        // 发送测试请求
        const testResponse = await this.providers.get(provider)!.chat({
          model: this.getProviderConfig(provider).model,
          messages: [{ role: MessageRole.USER, content: 'test' }],
          max_tokens: 1,
        });

        // 切换到这个提供商
        this.setActiveProvider(provider);
        this.logger.info('故障转移成功', { new_provider: provider });

        return testResponse;
      } catch (error) {
        this.logger.debug('故障转移测试失败', {
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.error('所有故障转移尝试都失败');
    throw new LLMError('All failover attempts failed', 'FAILOVER_FAILED');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<Record<ProviderType, boolean>> {
    const health: Record<ProviderType, boolean> = {} as any;

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
    this.logger.info('LLM管理器状态变更', { active });
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

    // 清理事件监听器
    this.removeAllListeners();

    this.logger.info('LLM管理器已关闭');
  }

  /**
   * 初始化所有提供商
   */
  private initializeProviders(): void {
    // OpenAI
    if (this.config.openai.enabled && this.config.openai.api_key) {
      try {
        const openaiProvider = new OpenAIProvider(this.config.openai, this.config.retry, this.logger);
        this.providers.set(ProviderType.OPENAI, openaiProvider);
        this.logger.info('OpenAI提供商初始化成功');
      } catch (error) {
        this.logger.error('OpenAI提供商初始化失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.logger.info('OpenAI提供商已禁用或缺少API密钥');
    }

    // Azure OpenAI（待实现）
    // Anthropic（待实现）

    this.logger.info('LLM提供商初始化完成', {
      available_providers: Array.from(this.providers.keys()),
    });
  }

  /**
   * 设置配置监听器
   */
  private setupConfigListeners(): void {
    // 监听全局配置更新事件
    // 这里假设ConfigManager会触发相关事件
    // 实际实现需要根据ConfigManager的事件系统调整
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
  private getProviderConfig(provider: ProviderType) {
    switch (provider) {
      case ProviderType.OPENAI:
        return this.config.openai;
      case ProviderType.AZURE:
        return this.config.azure;
      case ProviderType.ANTHROPIC:
        return this.config.anthropic;
      default:
        throw new LLMError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER');
    }
  }

  /**
   * 判断是否需要故障转移
   */
  private shouldFailover(error: LLMError): boolean {
    // 如果只有当前一个提供商，无法故障转移
    if (this.providers.size <= 1) {
      return false;
    }

    // 某些错误类型不适合故障转移
    const nonFailoverErrors = ['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'PAYLOAD_TOO_LARGE', 'CONTEXT_LENGTH_EXCEEDED'];

    return !nonFailoverErrors.includes(error.code);
  }

  /**
   * 处理故障转移
   */
  private async handleFailover(requestConfig: LLMRequestConfig, originalError: LLMError): Promise<LLMResponse> {
    this.logger.warn('当前提供商失败，尝试故障转移', {
      provider: this.activeProvider?.provider,
      error: originalError.message,
    });

    // 找到备用提供商
    const availableProviders = Array.from(this.providers.keys()).filter(p => p !== this.activeProvider?.provider);

    let lastError: LLMError | null = null;

    for (const provider of availableProviders) {
      try {
        this.logger.debug('尝试备用提供商', { provider });

        // 调整请求配置以适配备用提供商
        const failoverRequest = {
          ...requestConfig,
          model: this.getProviderConfig(provider).model,
        };

        // 发送请求
        const response = await this.providers.get(provider)!.chat(failoverRequest);

        // 成功，切换到这个提供商
        this.setActiveProvider(provider);

        // 记录用量
        this.usageTracker.recordUsage(provider, response.model, response.usage);

        this.emit('failover_success', {
          from_provider: originalError.provider,
          to_provider: provider,
          original_error: originalError,
          response,
        });

        this.logger.info('故障转移成功', {
          new_provider: provider,
          response_id: response.id,
        });

        return response;
      } catch (error) {
        lastError = error instanceof LLMError ? error : null;
        this.logger.debug('备用提供商失败', {
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 所有备用提供商都失败了
    this.emit('failover_failed', {
      original_error: originalError,
      last_error: lastError,
    });

    this.logger.error('所有故障转移尝试都失败');
    throw originalError;
  }

  /**
   * 根据需要重新初始化提供商
   */
  private reinitializeProvidersIfNeeded(oldConfig: LLMConfig, newConfig: LLMConfig): void {
    // 检查OpenAI配置是否变化
    if (JSON.stringify(oldConfig.openai) !== JSON.stringify(newConfig.openai)) {
      this.providers.delete(ProviderType.OPENAI);
      if (newConfig.openai.enabled && newConfig.openai.api_key) {
        try {
          const openaiProvider = new OpenAIProvider(newConfig.openai, newConfig.retry, this.logger);
          this.providers.set(ProviderType.OPENAI, openaiProvider);
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
 * 便捷函数：创建全局LLM管理器实例
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
