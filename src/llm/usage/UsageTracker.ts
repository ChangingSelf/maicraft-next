/**
 * LLM用量追踪器
 *
 * 负责追踪和统计LLM API的使用情况，包括token计数、费用计算等
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { Logger } from '../../utils/Logger.js';
import { UsageStats, DailyUsage, MonthlyUsage, ProviderUsage, ModelUsage, LLMProvider, TokenUsage, LLMConfig } from '../types.js';
import { z } from 'zod';

/**
 * 用量追踪器类
 */
export class UsageTracker {
  private logger: Logger;
  private config: LLMConfig;
  private stats: UsageStats;
  private persistTimer?: NodeJS.Timeout;
  private isDirty = false;

  constructor(config: LLMConfig, logger?: Logger) {
    this.config = config;
    this.logger =
      logger ||
      new Logger({
        level: (globalThis as any).logLevel || 2, // INFO
        console: true,
        file: false,
      }).child('UsageTracker');

    this.stats = this.initializeStats();

    // 确保数据目录存在
    this.ensureDataDirectory();

    // 加载已有统计数据
    this.loadStats();

    // 启动持久化定时器
    if (config.usage_tracking.enabled) {
      this.startPersistTimer();
    }
  }

  /**
   * 记录一次LLM调用
   */
  recordUsage(provider: LLMProvider, model: string, tokenUsage: TokenUsage, cost?: number): void {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const month = date.substring(0, 7); // YYYY-MM

    // 更新总体统计
    this.stats.total_requests += 1;
    this.stats.total_prompt_tokens += tokenUsage.prompt_tokens;
    this.stats.total_completion_tokens += tokenUsage.completion_tokens;
    this.stats.total_tokens += tokenUsage.total_tokens;

    const actualCost = cost || this.calculateCost(provider, model, tokenUsage);
    this.stats.total_cost += actualCost;

    // 更新每日统计
    if (!this.stats.daily_stats[date]) {
      this.stats.daily_stats[date] = this.createDailyUsage(date);
    }
    this.stats.daily_stats[date].requests += 1;
    this.stats.daily_stats[date].prompt_tokens += tokenUsage.prompt_tokens;
    this.stats.daily_stats[date].completion_tokens += tokenUsage.completion_tokens;
    this.stats.daily_stats[date].total_tokens += tokenUsage.total_tokens;
    this.stats.daily_stats[date].cost += actualCost;

    // 更新月度统计
    if (!this.stats.monthly_stats[month]) {
      this.stats.monthly_stats[month] = this.createMonthlyUsage(month);
    }
    this.stats.monthly_stats[month].requests += 1;
    this.stats.monthly_stats[month].prompt_tokens += tokenUsage.prompt_tokens;
    this.stats.monthly_stats[month].completion_tokens += tokenUsage.completion_tokens;
    this.stats.monthly_stats[month].total_tokens += tokenUsage.total_tokens;
    this.stats.monthly_stats[month].cost += actualCost;

    // 更新提供商统计
    if (!this.stats.provider_stats[provider]) {
      this.stats.provider_stats[provider] = this.createProviderUsage();
    }
    const providerStats = this.stats.provider_stats[provider];
    providerStats.requests += 1;
    providerStats.prompt_tokens += tokenUsage.prompt_tokens;
    providerStats.completion_tokens += tokenUsage.completion_tokens;
    providerStats.total_tokens += tokenUsage.total_tokens;
    providerStats.cost += actualCost;

    // 更新模型统计
    if (!providerStats.model_usage[model]) {
      providerStats.model_usage[model] = this.createModelUsage();
    }
    const modelStats = providerStats.model_usage[model];
    modelStats.requests += 1;
    modelStats.prompt_tokens += tokenUsage.prompt_tokens;
    modelStats.completion_tokens += tokenUsage.completion_tokens;
    modelStats.total_tokens += tokenUsage.total_tokens;
    modelStats.cost += actualCost;

    // 更新时间戳
    this.stats.last_updated = now.toISOString();

    // 标记为需要持久化
    this.isDirty = true;

    // 检查用量限制
    this.checkUsageLimits(date, month);

    this.logger.debug('记录LLM用量', {
      provider,
      model,
      tokenUsage,
      cost: actualCost,
      total_requests: this.stats.total_requests,
      total_cost: this.stats.total_cost,
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): UsageStats {
    return { ...this.stats };
  }

  /**
   * 获取指定日期的用量
   */
  getDailyUsage(date: string): DailyUsage | null {
    return this.stats.daily_stats[date] || null;
  }

  /**
   * 获取指定月份的用量
   */
  getMonthlyUsage(month: string): MonthlyUsage | null {
    return this.stats.monthly_stats[month] || null;
  }

  /**
   * 获取提供商用量
   */
  getProviderUsage(provider: LLMProvider): ProviderUsage | null {
    return this.stats.provider_stats[provider] || null;
  }

  /**
   * 获取模型用量
   */
  getModelUsage(provider: LLMProvider, model: string): ModelUsage | null {
    const providerStats = this.stats.provider_stats[provider];
    if (!providerStats) return null;
    return providerStats.model_usage[model] || null;
  }

  /**
   * 获取今日用量
   */
  getTodayUsage(): DailyUsage | null {
    const today = new Date().toISOString().split('T')[0];
    return this.getDailyUsage(today);
  }

  /**
   * 获取本月用量
   */
  getCurrentMonthUsage(): MonthlyUsage | null {
    const month = new Date().toISOString().substring(0, 7);
    return this.getMonthlyUsage(month);
  }

  /**
   * 设置月度预算限制
   */
  setMonthlyBudget(month: string, budget: number): void {
    if (!this.stats.monthly_stats[month]) {
      this.stats.monthly_stats[month] = this.createMonthlyUsage(month);
    }
    this.stats.monthly_stats[month].budget_limit = budget;
    this.isDirty = true;
    this.persistStats();

    this.logger.info('设置月度预算限制', { month, budget });
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.isDirty = true;
    this.persistStats();

    this.logger.info('重置用量统计数据');
  }

  /**
   * 清理旧数据
   */
  cleanupOldData(daysToKeep: number = 365): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    // 清理日统计数据
    for (const date in this.stats.daily_stats) {
      if (date < cutoff) {
        delete this.stats.daily_stats[date];
        this.isDirty = true;
      }
    }

    // 清理月统计数据（保留最近24个月）
    const cutoffMonth = new Date();
    cutoffMonth.setMonth(cutoffMonth.getMonth() - 24);
    const monthCutoff = cutoffMonth.toISOString().substring(0, 7);

    for (const month in this.stats.monthly_stats) {
      if (month < monthCutoff) {
        delete this.stats.monthly_stats[month];
        this.isDirty = true;
      }
    }

    if (this.isDirty) {
      this.persistStats();
      this.logger.info('清理旧用量数据', { daysToKeep });
    }
  }

  /**
   * 关闭用量追踪器
   */
  close(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    // 强制持久化最后一次数据
    if (this.isDirty) {
      this.persistStatsSync();
    }

    this.logger.info('用量追踪器已关闭');
  }

  /**
   * 初始化统计对象
   */
  private initializeStats(): UsageStats {
    return {
      total_requests: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      daily_stats: {},
      monthly_stats: {},
      provider_stats: {
        [LLMProvider.OPENAI]: this.createProviderUsage(),
        [LLMProvider.ANTHROPIC]: this.createProviderUsage(),
        [LLMProvider.AZURE]: this.createProviderUsage(),
      },
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * 创建每日用量对象
   */
  private createDailyUsage(date: string): DailyUsage {
    return {
      date,
      requests: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };
  }

  /**
   * 创建月度用量对象
   */
  private createMonthlyUsage(month: string): MonthlyUsage {
    return {
      month,
      requests: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };
  }

  /**
   * 创建提供商用量对象
   */
  private createProviderUsage(): ProviderUsage {
    return {
      requests: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
      model_usage: {},
    };
  }

  /**
   * 创建模型用量对象
   */
  private createModelUsage(): ModelUsage {
    return {
      requests: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };
  }

  /**
   * 计算费用
   */
  private calculateCost(provider: LLMProvider, model: string, tokenUsage: TokenUsage): number {
    const pricing = this.config.pricing;
    let inputPricePer1K = 0;
    let outputPricePer1K = 0;

    switch (provider) {
      case LLMProvider.OPENAI:
        if (model.includes('gpt-4')) {
          if (model.includes('turbo')) {
            inputPricePer1K = pricing.openai.gpt_4_turbo_input;
            outputPricePer1K = pricing.openai.gpt_4_turbo_output;
          } else {
            inputPricePer1K = pricing.openai.gpt_4_input;
            outputPricePer1K = pricing.openai.gpt_4_output;
          }
        } else if (model.includes('gpt-3.5-turbo')) {
          inputPricePer1K = pricing.openai.gpt_35_turbo_input;
          outputPricePer1K = pricing.openai.gpt_35_turbo_output;
        }
        break;

      case LLMProvider.AZURE:
        if (model.includes('gpt-4')) {
          inputPricePer1K = pricing.azure.gpt_4_input;
          outputPricePer1K = pricing.azure.gpt_4_output;
        } else if (model.includes('gpt-3.5-turbo')) {
          inputPricePer1K = pricing.azure.gpt_35_turbo_input;
          outputPricePer1K = pricing.azure.gpt_35_turbo_output;
        }
        break;

      case LLMProvider.ANTHROPIC:
        if (model.includes('opus')) {
          inputPricePer1K = pricing.anthropic.claude_3_opus_input;
          outputPricePer1K = pricing.anthropic.claude_3_opus_output;
        } else if (model.includes('sonnet')) {
          inputPricePer1K = pricing.anthropic.claude_3_sonnet_input;
          outputPricePer1K = pricing.anthropic.claude_3_sonnet_output;
        } else if (model.includes('haiku')) {
          inputPricePer1K = pricing.anthropic.claude_3_haiku_input;
          outputPricePer1K = pricing.anthropic.claude_3_haiku_output;
        }
        break;
    }

    const inputCost = (tokenUsage.prompt_tokens / 1000) * inputPricePer1K;
    const outputCost = (tokenUsage.completion_tokens / 1000) * outputPricePer1K;

    return inputCost + outputCost;
  }

  /**
   * 检查用量限制
   */
  private checkUsageLimits(date: string, month: string): void {
    const dailyUsage = this.stats.daily_stats[date];
    const monthlyUsage = this.stats.monthly_stats[month];
    const { daily_limit_warning, monthly_budget_warning } = this.config.usage_tracking;

    // 检查日用量警告
    if (dailyUsage) {
      // 这里可以添加日用量限制检查
      // 暂时只发出警告
    }

    // 检查月度预算警告
    if (monthlyUsage && monthlyUsage.budget_limit) {
      const budgetUsage = monthlyUsage.cost / monthlyUsage.budget_limit;
      if (budgetUsage >= monthly_budget_warning && budgetUsage < 1) {
        this.logger.warn('月度预算使用即将达到限制', {
          month,
          used: monthlyUsage.cost,
          budget: monthlyUsage.budget_limit,
          usage_percentage: budgetUsage,
        });
      } else if (budgetUsage >= 1) {
        this.logger.error('月度预算已超支', {
          month,
          used: monthlyUsage.cost,
          budget: monthlyUsage.budget_limit,
          usage_percentage: budgetUsage,
        });
      }
    }
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDirectory(): void {
    const statsFile = this.config.usage_tracking.stats_file;
    const dir = dirname(statsFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 加载统计数据
   */
  private loadStats(): void {
    try {
      const statsFile = this.config.usage_tracking.stats_file;
      if (existsSync(statsFile)) {
        const data = readFileSync(statsFile, 'utf8');
        const loadedStats = JSON.parse(data);

        // 合并加载的数据，保持初始化的默认结构
        this.stats = {
          ...this.stats,
          ...loadedStats,
          provider_stats: {
            ...this.stats.provider_stats,
            ...loadedStats.provider_stats,
          },
        };

        this.logger.info('加载用量统计数据成功', {
          total_requests: this.stats.total_requests,
          total_cost: this.stats.total_cost,
        });
      }
    } catch (error) {
      this.logger.error('加载用量统计数据失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 启动持久化定时器
   */
  private startPersistTimer(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setInterval(() => {
      this.persistStats();
    }, this.config.usage_tracking.persist_interval);

    this.logger.debug('启动用量统计持久化定时器', {
      interval: this.config.usage_tracking.persist_interval,
    });
  }

  /**
   * 持久化统计数据
   */
  private persistStats(): void {
    if (!this.isDirty) return;

    try {
      this.persistStatsSync();
      this.isDirty = false;
    } catch (error) {
      this.logger.error('持久化用量统计数据失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 同步持久化统计数据
   */
  private persistStatsSync(): void {
    const statsFile = this.config.usage_tracking.stats_file;
    const tempFile = `${statsFile}.tmp`;

    try {
      // 先写入临时文件
      writeFileSync(tempFile, JSON.stringify(this.stats, null, 2), 'utf8');

      // 重命名为正式文件（原子操作）
      unlinkSync(statsFile);
      writeFileSync(statsFile, JSON.stringify(this.stats, null, 2), 'utf8');

      this.logger.debug('用量统计数据持久化成功', { file: statsFile });
    } catch (error) {
      // 如果重命名失败，尝试直接写入
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
      writeFileSync(statsFile, JSON.stringify(this.stats, null, 2), 'utf8');

      this.logger.debug('用量统计数据持久化成功（直接写入）', { file: statsFile });
    }
  }
}
