/**
 * 提示词管理器
 *
 * 统一管理提示词的存储、渲染、使用等功能
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../utils/Config.js';
import { LLMManager } from '../llm/LLMManager.js';
import { PromptStorage } from './storage/PromptStorage.js';
import { TemplateEngine } from './engine/TemplateEngine.js';
import {
  PromptTemplate,
  TemplateRenderRequest,
  TemplateRenderResult,
  PromptUsageStats,
  SearchFilter,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  LLMIntegrationConfig,
  TemplateCategory,
  MessageRole,
  ChatMessage
} from './types/index.js';
import { PromptError, PromptErrorFactory } from './errors/PromptError.js';

/**
 * 提示词管理器
 */
export class PromptManager extends EventEmitter {
  private logger: Logger;
  private storage: PromptStorage;
  private engine: TemplateEngine;
  private llmManager?: LLMManager;
  private config: LLMIntegrationConfig;
  private usageStats: Map<string, PromptUsageStats> = new Map();
  private isMonitoring = false;

  constructor(
    storage: PromptStorage,
    engine: TemplateEngine,
    config?: Partial<LLMIntegrationConfig>,
    logger?: Logger
  ) {
    super();

    this.storage = storage;
    this.engine = engine;
    this.logger = logger || new Logger({
      level: 2, // INFO
      console: true,
      file: false,
    }).child('PromptManager');

    // 默认配置
    this.config = {
      auto_render: true,
      validate_variables: true,
      cache_enabled: true,
      cache_ttl: 5 * 60 * 1000, // 5分钟
      usage_tracking: true,
      auto_record_usage: true,
      ...config,
    };

    this.logger.info('提示词管理器初始化', {
      storage_dir: this.storage['storageDir'],
      config: this.config,
    });

    // 启用使用统计
    if (this.config.usage_tracking) {
      this.startUsageMonitoring();
    }
  }

  /**
   * 设置LLM管理器
   */
  setLLMManager(llmManager: LLMManager): void {
    this.llmManager = llmManager;
    this.logger.info('LLM管理器已设置');

    // 监听LLM事件
    this.setupLLMEventListeners();
  }

  /**
   * 创建提示词模板
   */
  async createTemplate(request: CreateTemplateRequest): Promise<PromptTemplate> {
    this.logger.debug('创建提示词模板', { name: request.name });

    // 验证模板内容
    if (this.config.validate_variables) {
      const validation = this.engine.validateTemplate(request.content);
      if (!validation.valid) {
        throw new PromptError(
          `Template validation failed: ${validation.errors.join(', ')}`,
          'TEMPLATE_VALIDATION_ERROR',
          { validation }
        );
      }
    }

    const template = await this.storage.createTemplate(request);

    // 发送事件
    this.emit('template_created', { template });

    this.logger.info('提示词模板创建成功', {
      id: template.id,
      name: template.name,
      variables: template.variables,
    });

    return template;
  }

  /**
   * 获取提示词模板
   */
  async getTemplate(id: string): Promise<PromptTemplate> {
    this.logger.debug('获取提示词模板', { id });

    const template = await this.storage.getTemplate(id);

    // 发送事件
    this.emit('template_accessed', { template });

    return template;
  }

  /**
   * 更新提示词模板
   */
  async updateTemplate(id: string, request: UpdateTemplateRequest): Promise<PromptTemplate> {
    this.logger.debug('更新提示词模板', { id });

    // 验证模板内容
    if (request.content && this.config.validate_variables) {
      const validation = this.engine.validateTemplate(request.content);
      if (!validation.valid) {
        throw new PromptError(
          `Template validation failed: ${validation.errors.join(', ')}`,
          'TEMPLATE_VALIDATION_ERROR',
          { validation }
        );
      }
    }

    const template = await this.storage.updateTemplate(id, request);

    // 清除相关缓存
    this.clearTemplateCache(id);

    // 发送事件
    this.emit('template_updated', { template });

    this.logger.info('提示词模板更新成功', {
      id: template.id,
      version: template.version,
    });

    return template;
  }

  /**
   * 删除提示词模板
   */
  async deleteTemplate(id: string): Promise<void> {
    this.logger.debug('删除提示词模板', { id });

    await this.storage.deleteTemplate(id);

    // 清除相关缓存
    this.clearTemplateCache(id);

    // 发送事件
    this.emit('template_deleted', { template_id: id });

    this.logger.info('提示词模板删除成功', { id });
  }

  /**
   * 搜索提示词模板
   */
  async searchTemplates(filter: SearchFilter = {}): Promise<PromptTemplate[]> {
    this.logger.debug('搜索提示词模板', { filter });

    const templates = await this.storage.searchTemplates(filter);

    // 发送事件
    this.emit('templates_searched', {
      filter,
      count: templates.length,
    });

    return templates;
  }

  /**
   * 渲染提示词模板
   */
  async renderTemplate(request: TemplateRenderRequest): Promise<TemplateRenderResult> {
    this.logger.debug('渲染提示词模板', {
      template_id: request.template_id,
      variables: Object.keys(request.variables || {}),
    });

    const startTime = Date.now();

    try {
      // 获取模板
      let template: PromptTemplate;
      if ('id' in request) {
        template = await this.storage.getTemplate(request.template_id);
      } else {
        // 支持直接渲染内容
        template = {
          id: 'inline',
          name: 'inline-template',
          content: request.template_id,
          category: 'inline',
          tags: [],
          variables: this.engine.extractVariables(request.template_id),
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'user',
          version: 1,
          metadata: {},
          usage_count: 0,
        };
      }

      // 渲染模板
      const renderResult = await this.engine.render({
        template: template.content,
        data: request.variables || {},
        options: {
          strict: request.strict ?? this.config.validate_variables,
          filters: request.filters,
          functions: request.functions,
          ...request.options,
        },
      });

      // 计算token数
      let tokenCount = 0;
      if (this.llmManager) {
        tokenCount = this.llmManager.countTokens(renderResult.content);
      }

      const renderTime = Date.now() - startTime;

      const result: TemplateRenderResult = {
        template_id: template.id,
        template_name: template.name,
        rendered_content: renderResult.content,
        variables_used: renderResult.variables_used,
        token_count: tokenCount,
        render_time_ms: renderTime,
        warnings: renderResult.warnings,
        errors: renderResult.errors,
        metadata: {
          template_version: template.version,
          render_engine: 'maicraft-prompt-engine',
          timestamp: new Date().toISOString(),
        },
      };

      // 记录使用
      if (this.config.auto_record_usage && 'id' in request) {
        await this.storage.recordUsage(request.template_id, {
          variables: Object.keys(request.variables || {}),
          render_time: renderTime,
          token_count: tokenCount,
          warnings: result.warnings.length,
          errors: result.errors.length,
        });
      }

      // 更新使用统计
      this.updateUsageStats(template.id, {
        render_count: 1,
        total_render_time: renderTime,
        total_token_count: tokenCount,
        error_count: result.errors.length,
      });

      // 发送事件
      this.emit('template_rendered', { result, template });

      this.logger.debug('提示词渲染完成', {
        template_id: result.template_id,
        token_count: tokenCount,
        render_time: renderTime,
      });

      return result;
    } catch (error) {
      const renderTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: TemplateRenderResult = {
        template_id: request.template_id,
        template_name: '',
        rendered_content: '',
        variables_used: [],
        token_count: 0,
        render_time_ms: renderTime,
        warnings: [],
        errors: [errorMessage],
        metadata: {
          render_engine: 'maicraft-prompt-engine',
          timestamp: new Date().toISOString(),
          error: errorMessage,
        },
      };

      // 更新错误统计
      if ('id' in request) {
        this.updateUsageStats(request.template_id, {
          error_count: 1,
          render_time: renderTime,
        });
      }

      // 发送错误事件
      this.emit('template_render_error', {
        result,
        error,
        request,
      });

      throw error;
    }
  }

  /**
   * 使用提示词与LLM交互
   */
  async useWithLLM(request: TemplateRenderRequest & {
    llm_options?: any; // LLM请求选项
  }): Promise<{
    render_result: TemplateRenderResult;
    llm_response?: any; // LLM响应
  }> {
    this.logger.debug('使用提示词与LLM交互', {
      template_id: request.template_id,
    });

    if (!this.llmManager) {
      throw new PromptError(
        'LLM manager not configured',
        'LLM_NOT_CONFIGURED'
      );
    }

    // 1. 渲染提示词
    const renderResult = await this.renderTemplate(request);

    // 2. 转换为LLM消息格式
    const messages = this.convertToLLMMessages(renderResult.rendered_content);

    // 3. 发送LLM请求
    let llmResponse: any;
    try {
      llmResponse = await this.llmManager.chat(messages, request.llm_options);

      // 发送事件
      this.emit('llm_interaction_complete', {
        render_result: renderResult,
        llm_response: llmResponse,
      });

      this.logger.debug('LLM交互完成', {
        template_id: request.template_id,
        response_id: llmResponse.id,
        total_tokens: llmResponse.usage.total_tokens,
      });
    } catch (error) {
      // 发送错误事件
      this.emit('llm_interaction_error', {
        render_result: renderResult,
        error,
        request,
      });

      throw error;
    }

    return {
      render_result: renderResult,
      llm_response: llmResponse,
    };
  }

  /**
   * 获取使用统计
   */
  getUsageStats(templateId?: string): PromptUsageStats | Map<string, PromptUsageStats> {
    if (templateId) {
      return this.usageStats.get(templateId) || this.createEmptyUsageStats();
    }
    return new Map(this.usageStats);
  }

  /**
   * 重置使用统计
   */
  resetUsageStats(templateId?: string): void {
    if (templateId) {
      this.usageStats.set(templateId, this.createEmptyUsageStats());
    } else {
      this.usageStats.clear();
    }

    this.logger.info('使用统计已重置', { template_id: templateId });
  }

  /**
   * 获取模板版本历史
   */
  async getTemplateVersions(templateId: string) {
    return this.storage.getTemplateVersions(templateId);
  }

  /**
   * 获取特定版本
   */
  async getTemplateVersion(templateId: string, version: number) {
    return this.storage.getTemplateVersion(templateId, version);
  }

  /**
   * 获取所有分类
   */
  async getCategories(): Promise<string[]> {
    return this.storage.getCategories();
  }

  /**
   * 获取所有标签
   */
  async getTags(): Promise<string[]> {
    return this.storage.getTags();
  }

  /**
   * 获取存储统计
   */
  async getStorageStats() {
    return this.storage.getStorageStats();
  }

  /**
   * 清理缓存
   */
  async cleanup(): Promise<void> {
    // 清理模板缓存
    this.clearAllCache();

    // 清理使用统计缓存
    this.usageStats.clear();

    // 发送事件
    this.emit('cleanup_complete');

    this.logger.info('提示词管理器清理完成');
  }

  /**
   * 关闭管理器
   */
  async close(): Promise<void> {
    // 停止监控
    this.stopUsageMonitoring();

    // 清理资源
    await this.cleanup();

    // 移除所有事件监听器
    this.removeAllListeners();

    this.logger.info('提示词管理器已关闭');
  }

  /**
   * 转换提示词内容为LLM消息格式
   */
  private convertToLLMMessages(content: string): ChatMessage[] {
    // 检测是否包含多条消息
    const messageSections = this.parseMessageSections(content);

    if (messageSections.length === 1) {
      // 单条消息，默认为用户消息
      return [{
        role: MessageRole.USER,
        content: messageSections[0].content,
      }];
    }

    // 多条消息，转换为数组
    return messageSections.map(section => ({
      role: section.role,
      content: section.content,
    }));
  }

  /**
   * 解析消息分段
   */
  private parseMessageSections(content: string): Array<{ role: MessageRole; content: string }> {
    const sections: Array<{ role: MessageRole; content: string }> = [];
    const lines = content.split('\n');
    let currentRole = MessageRole.USER;
    let currentContent: string[] = [];

    const roleRegex = /^(system|user|assistant):\s*/i;

    for (const line of lines) {
      const roleMatch = line.match(roleRegex);
      if (roleMatch) {
        // 保存当前消息
        if (currentContent.length > 0) {
          sections.push({
            role: currentRole,
            content: currentContent.join('\n').trim(),
          });
          currentContent = [];
        }

        // 开始新消息
        currentRole = roleMatch[1].toLowerCase() as MessageRole;
      } else {
        currentContent.push(line);
      }
    }

    // 添加最后一条消息
    if (currentContent.length > 0) {
      sections.push({
        role: currentRole,
        content: currentContent.join('\n').trim(),
      });
    }

    return sections;
  }

  /**
   * 设置LLM事件监听器
   */
  private setupLLMEventListeners(): void {
    if (!this.llmManager) return;

    this.llmManager.on('chat_complete', (data) => {
      // 可以在这里记录LLM使用情况
      this.logger.debug('LLM聊天完成', {
        provider: data.provider,
        model: data.response.model,
        tokens_used: data.response.usage.total_tokens,
      });
    });

    this.llmManager.on('provider_changed', (data) => {
      this.logger.info('LLM提供商变更', {
        from: data.from,
        to: data.to,
      });
    });
  }

  /**
   * 启动使用统计监控
   */
  private startUsageMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.logger.debug('使用统计监控已启动');

    // 可以在这里添加定期保存统计数据的逻辑
  }

  /**
   * 停止使用统计监控
   */
  private stopUsageMonitoring(): void {
    this.isMonitoring = false;
    this.logger.debug('使用统计监控已停止');
  }

  /**
   * 更新使用统计
   */
  private updateUsageStats(
    templateId: string,
    stats: Partial<PromptUsageStats>
  ): void {
    const current = this.usageStats.get(templateId) || this.createEmptyUsageStats();

    Object.assign(current, stats);
    current.last_used = new Date().toISOString();

    this.usageStats.set(templateId, current);
  }

  /**
   * 创建空的使用统计
   */
  private createEmptyUsageStats(): PromptUsageStats {
    return {
      render_count: 0,
      error_count: 0,
      total_render_time: 0,
      total_token_count: 0,
      last_used: undefined,
    };
  }

  /**
   * 清除模板缓存
   */
  private clearTemplateCache(templateId: string): void {
    // 如果模板引擎有缓存机制，在这里清除
    this.logger.debug('清除模板缓存', { template_id: templateId });
  }

  /**
   * 清除所有缓存
   */
  private clearAllCache(): void {
    // 清除模板引擎缓存
    if (typeof this.engine.clearCache === 'function') {
      this.engine.clearCache();
    }

    // 清除存储缓存
    if (typeof this.storage.cleanupCache === 'function') {
      this.storage.cleanupCache();
    }

    this.logger.debug('清除所有缓存');
  }
}

/**
 * 便捷函数：创建提示词管理器
 */
export async function createPromptManager(
  storageDir: string,
  config?: Partial<LLMIntegrationConfig>,
  logger?: Logger
): Promise<PromptManager> {
  const storage = new PromptStorage(storageDir, logger);
  const engine = new TemplateEngine(logger);
  return new PromptManager(storage, engine, config, logger);
}

/**
 * 默认提示词模板
 */
export const DEFAULT_PROMPTS = {
  basic_assistant: {
    name: 'basic-assistant',
    description: '基础AI助手提示词',
    category: 'general',
    tags: ['assistant', 'general'],
    content: `You are a helpful AI assistant. Please help the user with their request.

User: ${user_input}

Assistant:`,
  },

  minecraft_helper: {
    name: 'minecraft-helper',
    description: 'Minecraft游戏助手提示词',
    category: 'minecraft',
    tags: ['minecraft', 'helper', 'game'],
    content: `You are a helpful Minecraft assistant. You have knowledge of Minecraft game mechanics, crafting recipes, building techniques, and gameplay strategies.

Current context:
- Game mode: ${game_mode}
- Player health: ${player_health}/20
- Player hunger: ${player_hunger}/20
- Current biome: ${current_biome}
- Nearby players: ${nearby_players}
- Inventory contains: ${inventory_items}

User request: ${user_request}

Please provide a helpful response that takes into account the current game situation. Be specific and practical.`,
  },

  decision_maker: {
    name: 'decision-maker',
    description: 'AI决策系统提示词',
    category: 'ai-agent',
    tags: ['decision', 'agent', 'planning'],
    content: `You are an AI agent making decisions for a Minecraft bot. Your goal is to help the player achieve their objectives efficiently and safely.

Current state:
- Location: ${location}
- Health: ${health}/20
- Hunger: ${hunger}/20
- Inventory: ${inventory}
- Nearby blocks: ${nearby_blocks}
- Nearby entities: ${nearby_entities}

Player objectives: ${objectives}
Available actions: ${available_actions}

Previous actions: ${previous_actions}

Based on the current state and objectives, decide on the best action to take. Consider:
1. Safety (avoid fall damage, mobs, etc.)
2. Efficiency (achieve objectives quickly)
3. Resource management (don't waste items)
4. Long-term planning

Decision:`,
  },
};