/**
 * LLM模块类型定义
 *
 * 这个文件定义了LLM模块所需的所有接口和类型
 */

import { z } from 'zod';

/**
 * LLM提供商类型
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
}

/**
 * 消息角色
 */
export enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string; // 可选的消息名称
}

/**
 * LLM响应接口
 */
export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
    logprobs?: Record<string, unknown>;
  }>;
  usage: TokenUsage;
  provider?: LLMProvider; // 添加提供商标识
}

/**
 * Token使用情况
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * LLM请求配置
 */
export interface LLMRequestConfig {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  timeout?: number;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  max_attempts: number;
  initial_delay: number; // 毫秒
  max_delay: number; // 毫秒
  backoff_multiplier: number;
}

/**
 * 用量统计信息
 */
export interface UsageStats {
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost: number; // USD
  daily_stats: Record<string, DailyUsage>;
  monthly_stats: Record<string, MonthlyUsage>;
  provider_stats: Record<LLMProvider, ProviderUsage>;
  last_updated: string; // ISO 8601 timestamp
}

/**
 * 每日使用情况
 */
export interface DailyUsage {
  date: string; // YYYY-MM-DD
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

/**
 * 每月使用情况
 */
export interface MonthlyUsage {
  month: string; // YYYY-MM
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  budget_limit?: number;
}

/**
 * 提供商使用情况
 */
export interface ProviderUsage {
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  model_usage: Record<string, ModelUsage>;
}

/**
 * 模型使用情况
 */
export interface ModelUsage {
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

/**
 * OpenAI配置
 */
export interface OpenAIConfig {
  enabled: boolean;
  api_key: string;
  base_url?: string;
  model: string;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
}

/**
 * Azure OpenAI配置
 */
export interface AzureConfig {
  enabled: boolean;
  api_key: string;
  endpoint: string;
  deployment_name: string;
  api_version: string;
  model: string;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
}

/**
 * Anthropic配置
 */
export interface AnthropicConfig {
  enabled: boolean;
  api_key: string;
  model: string;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
}

/**
 * 定价配置
 */
export interface PricingConfig {
  openai: {
    gpt_4_input: number;
    gpt_4_output: number;
    gpt_35_turbo_input: number;
    gpt_35_turbo_output: number;
    gpt_4_turbo_input: number;
    gpt_4_turbo_output: number;
  };
  anthropic: {
    claude_3_opus_input: number;
    claude_3_opus_output: number;
    claude_3_sonnet_input: number;
    claude_3_sonnet_output: number;
    claude_3_haiku_input: number;
    claude_3_haiku_output: number;
  };
  azure: {
    gpt_4_input: number;
    gpt_4_output: number;
    gpt_35_turbo_input: number;
    gpt_35_turbo_output: number;
  };
}

/**
 * LLM配置
 */
export interface LLMConfig {
  default_provider: LLMProvider;
  openai: OpenAIConfig;
  azure: AzureConfig;
  anthropic: AnthropicConfig;
  retry: RetryConfig;
  usage_tracking: {
    enabled: boolean;
    persist_interval: number;
    stats_file: string;
    daily_limit_warning: number;
    monthly_budget_warning: number;
  };
  pricing: PricingConfig;
}

/**
 * LLM错误类型
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: LLMProvider,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * 配置验证Schemas
 */

// OpenAI配置Schema
const OpenAIConfigSchema = z.object({
  enabled: z.boolean().default(true),
  api_key: z.string().default(''),
  base_url: z.string().url().optional().default('https://api.openai.com/v1'),
  model: z.string().default('gpt-4'),
  max_tokens: z.number().int().positive().max(128000).optional().default(4096),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  timeout: z.number().int().positive().optional().default(30000),
});

// Azure配置Schema
const AzureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  api_key: z.string().default(''),
  endpoint: z
    .string()
    .refine(val => val === '' || z.string().url().safeParse(val).success, {
      message: 'endpoint must be a valid URL or empty string',
    })
    .default(''),
  deployment_name: z.string().default(''),
  api_version: z.string().default('2023-12-01-preview'),
  model: z.string().default('gpt-4'),
  max_tokens: z.number().int().positive().max(128000).optional().default(4096),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  timeout: z.number().int().positive().optional().default(30000),
});

// Anthropic配置Schema
const AnthropicConfigSchema = z.object({
  enabled: z.boolean().default(false),
  api_key: z.string().default(''),
  model: z.string().default('claude-3-sonnet-20240229'),
  max_tokens: z.number().int().positive().max(200000).optional().default(4096),
  temperature: z.number().min(0).max(1).optional().default(0.7),
  timeout: z.number().int().positive().optional().default(30000),
});

// 重试配置Schema
const RetryConfigSchema = z.object({
  max_attempts: z.number().int().positive().max(10).default(3),
  initial_delay: z.number().int().positive().default(1000),
  max_delay: z.number().int().positive().default(30000),
  backoff_multiplier: z.number().positive().default(2),
});

// 用量追踪配置Schema
const UsageTrackingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  persist_interval: z.number().int().positive().default(60000),
  stats_file: z.string().default('./data/usage_stats.json'),
  daily_limit_warning: z.number().min(0).max(1).default(0.8),
  monthly_budget_warning: z.number().min(0).max(1).default(0.8),
});

// 定价配置Schema
const PricingConfigSchema = z.object({
  openai: z.object({
    gpt_4_input: z.number().positive().default(0.03),
    gpt_4_output: z.number().positive().default(0.06),
    gpt_35_turbo_input: z.number().positive().default(0.0015),
    gpt_35_turbo_output: z.number().positive().default(0.002),
    gpt_4_turbo_input: z.number().positive().default(0.01),
    gpt_4_turbo_output: z.number().positive().default(0.03),
  }),
  anthropic: z.object({
    claude_3_opus_input: z.number().positive().default(0.015),
    claude_3_opus_output: z.number().positive().default(0.075),
    claude_3_sonnet_input: z.number().positive().default(0.003),
    claude_3_sonnet_output: z.number().positive().default(0.015),
    claude_3_haiku_input: z.number().positive().default(0.00025),
    claude_3_haiku_output: z.number().positive().default(0.00125),
  }),
  azure: z.object({
    gpt_4_input: z.number().positive().default(0.03),
    gpt_4_output: z.number().positive().default(0.06),
    gpt_35_turbo_input: z.number().positive().default(0.0015),
    gpt_35_turbo_output: z.number().positive().default(0.002),
  }),
});

// LLM配置Schema
export const LLMConfigSchema = z.object({
  default_provider: z.nativeEnum(LLMProvider).default(LLMProvider.OPENAI),
  openai: OpenAIConfigSchema,
  azure: AzureConfigSchema,
  anthropic: AnthropicConfigSchema,
  retry: RetryConfigSchema,
  usage_tracking: UsageTrackingConfigSchema,
  pricing: PricingConfigSchema,
});

// 消息Schema
export const ChatMessageSchema = z.object({
  role: z.nativeEnum(MessageRole),
  content: z.string(),
  name: z.string().optional(),
});

// 请求配置Schema
export const LLMRequestConfigSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  max_tokens: z.number().int().positive().max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional().default(false),
  timeout: z.number().int().positive().optional(),
});

// 导出类型
export type ValidatedLLMConfig = z.infer<typeof LLMConfigSchema>;
export type ValidatedChatMessage = z.infer<typeof ChatMessageSchema>;
export type ValidatedLLMRequestConfig = z.infer<typeof LLMRequestConfigSchema>;
