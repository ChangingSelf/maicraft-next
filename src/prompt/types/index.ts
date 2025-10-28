/**
 * 提示词管理系统核心类型定义
 *
 * 本文件定义了提示词管理系统的所有核心接口和类型，
 * 包括模板定义、变量定义、版本信息、使用记录等。
 */

import { z } from 'zod'

// ==================== 基础类型定义 ====================

/**
 * 变量类型枚举
 */
export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array'
}

/**
 * 提示词错误类型枚举
 */
export enum PromptErrorType {
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VARIABLE_VALIDATION_FAILED = 'VARIABLE_VALIDATION_FAILED',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  RENDER_ERROR = 'RENDER_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED'
}

// ==================== 接口定义 ====================

/**
 * 提示词变量定义
 */
export interface IPromptVariable {
  /** 变量名称 */
  name: string
  /** 变量类型 */
  type: VariableType
  /** 是否必需 */
  required: boolean
  /** 默认值 */
  defaultValue?: any
  /** 变量描述 */
  description: string
  /** 验证规则 */
  validation?: VariableValidation
}

/**
 * 变量验证规则
 */
export interface VariableValidation {
  /** 正则表达式模式 */
  pattern?: string
  /** 最小值（数字）或最小长度（字符串） */
  min?: number
  /** 最大值（数字）或最大长度（字符串） */
  max?: number
  /** 枚举值选项 */
  options?: any[]
  /** 自定义验证函数 */
  custom?: (value: any) => boolean | string
}

/**
 * 提示词模板接口
 */
export interface IPromptTemplate {
  /** 模板唯一标识 */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 模板分类 */
  category: string
  /** 标签列表 */
  tags: string[]
  /** 模板内容 */
  template: string
  /** 变量定义列表 */
  variables: IPromptVariable[]
  /** 当前版本 */
  version: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
  /** 创建者 */
  createdBy?: string
  /** 是否启用 */
  enabled: boolean
  /** 元数据 */
  metadata: Record<string, any>
}

/**
 * 版本信息接口
 */
export interface IPromptVersion {
  /** 模板ID */
  templateId: string
  /** 版本号 */
  version: string
  /** 模板内容 */
  template: string
  /** 变量定义 */
  variables: IPromptVariable[]
  /** 变更日志 */
  changelog: string
  /** 创建时间 */
  createdAt: Date
  /** 创建者 */
  createdBy: string
  /** 是否为当前版本 */
  isCurrent?: boolean
}

/**
 * 使用记录接口
 */
export interface IUsageRecord {
  /** 记录唯一标识 */
  id: string
  /** 模板ID */
  templateId: string
  /** 使用的版本 */
  version: string
  /** 使用时间戳 */
  timestamp: Date
  /** 注入的变量 */
  variables: Record<string, any>
  /** 渲染后的提示词 */
  renderedPrompt: string
  /** 渲染耗时（毫秒） */
  renderTime: number
  /** 使用的Token数量 */
  tokensUsed?: number
  /** 成本（美元） */
  cost?: number
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  errorMessage?: string
  /** 用户ID */
  userId?: string
  /** 会话ID */
  sessionId?: string
  /** 上下文信息 */
  context?: Record<string, any>
}

/**
 * 分类信息接口
 */
export interface ICategory {
  /** 分类ID */
  id: string
  /** 分类名称 */
  name: string
  /** 分类描述 */
  description: string
  /** 父分类ID */
  parentId?: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
  /** 模板数量 */
  templateCount?: number
  /** 是否启用 */
  enabled: boolean
}

// ==================== DTO类型定义 ====================

/**
 * 创建提示词模板DTO
 */
export interface CreatePromptTemplateDto {
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 模板分类 */
  category: string
  /** 标签列表 */
  tags?: string[]
  /** 模板内容 */
  template: string
  /** 变量定义列表 */
  variables?: IPromptVariable[]
  /** 创建者 */
  createdBy?: string
  /** 元数据 */
  metadata?: Record<string, any>
}

/**
 * 更新提示词模板DTO
 */
export interface UpdatePromptTemplateDto {
  /** 模板名称 */
  name?: string
  /** 模板描述 */
  description?: string
  /** 模板分类 */
  category?: string
  /** 标签列表 */
  tags?: string[]
  /** 模板内容 */
  template?: string
  /** 变量定义列表 */
  variables?: IPromptVariable[]
  /** 是否启用 */
  enabled?: boolean
  /** 元数据 */
  metadata?: Record<string, any>
}

/**
 * 渲染选项
 */
export interface RenderOptions {
  /** 版本号，不指定则使用最新版本 */
  version?: string
  /** 是否启用缓存 */
  enableCache?: boolean
  /** 是否验证变量 */
  validateVariables?: boolean
  /** 是否记录使用统计 */
  trackUsage?: boolean
  /** 用户ID */
  userId?: string
  /** 会话ID */
  sessionId?: string
  /** 上下文信息 */
  context?: Record<string, any>
}

/**
 * 版本变更信息
 */
export interface VersionChanges {
  /** 新的模板内容 */
  template?: string
  /** 新的变量定义 */
  variables?: IPromptVariable[]
  /** 变更日志 */
  changelog: string
  /** 创建者 */
  createdBy: string
}

/**
 * 使用记录DTO
 */
export interface UsageRecordDto extends Omit<IUsageRecord, 'id' | 'timestamp'> {
  /** 记录时间戳，可选，不提供则使用当前时间 */
  timestamp?: Date
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean
  /** 错误信息列表 */
  errors: ValidationError[]
  /** 警告信息列表 */
  warnings: ValidationWarning[]
}

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误路径 */
  path: string
  /** 错误消息 */
  message: string
  /** 错误代码 */
  code: string
  /** 错误值 */
  value?: any
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  /** 警告路径 */
  path: string
  /** 警告消息 */
  message: string
  /** 警告代码 */
  code: string
  /** 警告值 */
  value?: any
}

// ==================== 过滤和查询类型 ====================

/**
 * 模板过滤器
 */
export interface TemplateQueryFilter {
  /** 分类ID */
  categoryId?: string
  /** 标签列表 */
  tags?: string[]
  /** 是否启用 */
  enabled?: boolean
  /** 创建者 */
  createdBy?: string
  /** 搜索关键词 */
  search?: string
  /** 创建时间范围 */
  createdAtRange?: {
    start?: Date
    end?: Date
  }
  /** 更新时间范围 */
  updatedAtRange?: {
    start?: Date
    end?: Date
  }
  /** 分页参数 */
  pagination?: {
    page: number
    limit: number
  }
  /** 排序参数 */
  sort?: {
    field: keyof IPromptTemplate
    order: 'asc' | 'desc'
  }
}

/**
 * 使用记录过滤器
 */
export interface UsageFilter {
  /** 模板ID */
  templateId?: string
  /** 版本号 */
  version?: string
  /** 用户ID */
  userId?: string
  /** 会话ID */
  sessionId?: string
  /** 是否成功 */
  success?: boolean
  /** 时间范围 */
  timestampRange?: {
    start: Date
    end: Date
  }
  /** 分页参数 */
  pagination?: {
    page: number
    limit: number
  }
  /** 排序参数 */
  sort?: {
    field: keyof IUsageRecord
    order: 'asc' | 'desc'
  }
}

/**
 * 使用统计数据
 */
export interface UsageStatistics {
  /** 总使用次数 */
  totalUsage: number
  /** 成功次数 */
  successCount: number
  /** 失败次数 */
  failureCount: number
  /** 成功率 */
  successRate: number
  /** 总Token使用量 */
  totalTokens: number
  /** 总成本 */
  totalCost: number
  /** 平均渲染时间 */
  averageRenderTime: number
  /** 按模板统计 */
  templateStats: TemplateUsageStats[]
  /** 按日期统计 */
  dailyStats: DailyUsageStats[]
  /** 按用户统计 */
  userStats: UserUsageStats[]
}

/**
 * 模板使用统计
 */
export interface TemplateUsageStats {
  /** 模板ID */
  templateId: string
  /** 模板名称 */
  templateName: string
  /** 使用次数 */
  usageCount: number
  /** 成功率 */
  successRate: number
  /** 平均Token使用量 */
  averageTokens: number
  /** 总成本 */
  totalCost: number
}

/**
 * 每日使用统计
 */
export interface DailyUsageStats {
  /** 日期 */
  date: string
  /** 使用次数 */
  usageCount: number
  /** 成功率 */
  successRate: number
  /** 总Token使用量 */
  totalTokens: number
  /** 总成本 */
  totalCost: number
}

/**
 * 用户使用统计
 */
export interface UserUsageStats {
  /** 用户ID */
  userId: string
  /** 使用次数 */
  usageCount: number
  /** 成功率 */
  successRate: number
  /** 总Token使用量 */
  totalTokens: number
  /** 总成本 */
  totalCost: number
}

// ==================== 编译相关类型 ====================

/**
 * 编译后的模板
 */
export interface CompiledTemplate {
  /** 模板ID */
  id: string
  /** 模板版本 */
  version: string
  /** 编译时间 */
  compiledAt: Date
  /** 抽象语法树 */
  ast: TemplateAST
  /** 渲染函数 */
  render: (variables: Record<string, any>) => string
  /** 依赖的变量列表 */
  dependencies: string[]
}

/**
 * 模板抽象语法树节点
 */
export interface TemplateAST {
  /** 节点类型 */
  type: 'root' | 'text' | 'variable' | 'conditional' | 'loop' | 'include'
  /** 节点值 */
  value: any
  /** 子节点 */
  children?: TemplateAST[]
  /** 位置信息 */
  position?: {
    line: number
    column: number
    offset: number
  }
}

/**
 * 模板过滤器函数
 */
export type TemplateFilterFunction = (value: any, ...args: any[]) => any

/**
 * 模板函数
 */
export type TemplateFunction = (...args: any[]) => any

// ==================== 配置类型 ====================

/**
 * 提示词配置接口
 */
export interface IPromptConfig {
  /** 模板存储路径 */
  templatesPath: string
  /** 版本存储路径 */
  versionsPath: string
  /** 使用记录存储路径 */
  usagePath: string
  /** 缓存配置 */
  cache: {
    /** 是否启用缓存 */
    enabled: boolean
    /** 缓存TTL（秒） */
    ttl: number
    /** 最大缓存条目数 */
    maxEntries: number
  }
  /** 使用统计配置 */
  usage: {
    /** 是否启用使用跟踪 */
    enabled: boolean
    /** 数据保留天数 */
    retentionDays: number
    /** 是否自动清理 */
    autoCleanup: boolean
  }
  /** 默认设置 */
  defaults: {
    /** 默认分类 */
    defaultCategory: string
    /** 是否自动创建版本 */
    autoVersion: boolean
    /** 每个模板最大版本数 */
    maxVersionsPerTemplate: number
  }
  /** 性能配置 */
  performance: {
    /** 最大并发渲染数 */
    maxConcurrentRenders: number
    /** 渲染超时时间（毫秒） */
    renderTimeout: number
    /** 是否启用性能监控 */
    enableProfiling: boolean
  }
}

// ==================== 错误类定义 ====================

/**
 * 提示词错误类
 */
export class PromptError extends Error {
  constructor(
    public type: PromptErrorType,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'PromptError'
  }

  /**
   * 创建模板未找到错误
   */
  static templateNotFound(id: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.TEMPLATE_NOT_FOUND,
      `Template with ID '${id}' not found`,
      details
    )
  }

  /**
   * 创建无效模板错误
   */
  static invalidTemplate(message: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.INVALID_TEMPLATE,
      `Invalid template: ${message}`,
      details
    )
  }

  /**
   * 创建变量验证失败错误
   */
  static variableValidationFailed(errors: ValidationError[], details?: any): PromptError {
    return new PromptError(
      PromptErrorType.VARIABLE_VALIDATION_FAILED,
      `Variable validation failed: ${errors.map(e => e.message).join(', ')}`,
      { errors, ...details }
    )
  }

  /**
   * 创建版本未找到错误
   */
  static versionNotFound(templateId: string, version: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.VERSION_NOT_FOUND,
      `Version '${version}' not found for template '${templateId}'`,
      details
    )
  }

  /**
   * 创建渲染错误
   */
  static renderError(message: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.RENDER_ERROR,
      `Template render error: ${message}`,
      details
    )
  }

  /**
   * 创建存储错误
   */
  static storageError(message: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.STORAGE_ERROR,
      `Storage error: ${message}`,
      details
    )
  }

  /**
   * 创建缓存错误
   */
  static cacheError(message: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.CACHE_ERROR,
      `Cache error: ${message}`,
      details
    )
  }

  /**
   * 创建分类未找到错误
   */
  static categoryNotFound(id: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.CATEGORY_NOT_FOUND,
      `Category with ID '${id}' not found`,
      details
    )
  }

  /**
   * 创建权限拒绝错误
   */
  static permissionDenied(action: string, details?: any): PromptError {
    return new PromptError(
      PromptErrorType.PERMISSION_DENIED,
      `Permission denied for action: ${action}`,
      details
    )
  }
}

// ==================== Zod Schema 定义 ====================

/**
 * 变量验证规则 Schema
 */
export const VariableValidationSchema = z.object({
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.any()).optional(),
  custom: z.function().args(z.any()).returns(z.union([z.boolean(), z.string()])).optional()
})

/**
 * 提示词变量 Schema
 */
export const PromptVariableSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(VariableType),
  required: z.boolean(),
  defaultValue: z.any().optional(),
  description: z.string(),
  validation: VariableValidationSchema.optional()
})

/**
 * 提示词模板 Schema
 */
export const PromptTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  tags: z.array(z.string()),
  template: z.string(),
  variables: z.array(PromptVariableSchema),
  version: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().optional(),
  enabled: z.boolean(),
  metadata: z.record(z.any())
})

/**
 * 创建提示词模板 DTO Schema
 */
export const CreatePromptTemplateDtoSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  template: z.string(),
  variables: z.array(PromptVariableSchema).optional().default([]),
  createdBy: z.string().optional(),
  metadata: z.record(z.any()).optional().default({})
})

/**
 * 版本信息 Schema
 */
export const PromptVersionSchema = z.object({
  templateId: z.string().min(1),
  version: z.string().min(1),
  template: z.string(),
  variables: z.array(PromptVariableSchema),
  changelog: z.string(),
  createdAt: z.date(),
  createdBy: z.string(),
  isCurrent: z.boolean().optional()
})

/**
 * 使用记录 Schema
 */
export const UsageRecordSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.date(),
  variables: z.record(z.any()),
  renderedPrompt: z.string(),
  renderTime: z.number(),
  tokensUsed: z.number().optional(),
  cost: z.number().optional(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.record(z.any()).optional()
})

/**
 * 分类信息 Schema
 */
export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  parentId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  templateCount: z.number().optional(),
  enabled: z.boolean()
})

/**
 * 提示词配置 Schema
 */
export const PromptConfigSchema = z.object({
  templatesPath: z.string(),
  versionsPath: z.string(),
  usagePath: z.string(),
  cache: z.object({
    enabled: z.boolean(),
    ttl: z.number(),
    maxEntries: z.number()
  }),
  usage: z.object({
    enabled: z.boolean(),
    retentionDays: z.number(),
    autoCleanup: z.boolean()
  }),
  defaults: z.object({
    defaultCategory: z.string(),
    autoVersion: z.boolean(),
    maxVersionsPerTemplate: z.number()
  }),
  performance: z.object({
    maxConcurrentRenders: z.number(),
    renderTimeout: z.number(),
    enableProfiling: z.boolean()
  })
})

// 所有类型已通过 interface 和 type 定义直接导出，无需重复导出