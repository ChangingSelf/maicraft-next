/**
 * 提示词管理系统错误处理模块
 *
 * 提供统一的错误类型定义、错误处理机制和错误恢复策略。
 */

import { PromptErrorType, ValidationError, ValidationResult } from '../types'

// 重新导出以便外部使用
export { PromptErrorType }

/**
 * 增强的提示词错误类
 * 扩展基础错误类，添加更多错误上下文信息
 */
export class EnhancedPromptError extends Error {
  public readonly type: PromptErrorType
  public readonly code: string
  public readonly details: any
  public readonly timestamp: Date
  public readonly context: Record<string, any>
  public readonly cause?: Error

  constructor(
    type: PromptErrorType,
    message: string,
    code?: string,
    details?: any,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message)
    this.name = 'EnhancedPromptError'
    this.type = type
    this.code = code || type
    this.details = details || {}
    this.timestamp = new Date()
    this.context = context || {}
    this.cause = cause

    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedPromptError)
    }
  }

  /**
   * 转换为JSON格式，便于日志记录和序列化
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.message,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } : undefined
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.type) {
      case PromptErrorType.TEMPLATE_NOT_FOUND:
        return `找不到指定的模板。请检查模板ID是否正确。`

      case PromptErrorType.INVALID_TEMPLATE:
        return `模板格式无效。${this.details.suggestion || '请检查模板语法。'}`

      case PromptErrorType.VARIABLE_VALIDATION_FAILED:
        const errors = this.details.errors as ValidationError[] || []
        if (errors.length === 1) {
          return `变量验证失败：${errors[0].message}`
        }
        return `变量验证失败，发现 ${errors.length} 个错误。`

      case PromptErrorType.VERSION_NOT_FOUND:
        return `找不到指定的模板版本。请检查版本号是否正确。`

      case PromptErrorType.RENDER_ERROR:
        return `模板渲染失败。${this.details.suggestion || '请检查模板语法和变量值。'}`

      case PromptErrorType.STORAGE_ERROR:
        return `存储操作失败。请检查文件权限和磁盘空间。`

      case PromptErrorType.CACHE_ERROR:
        return `缓存操作失败。系统可能运行缓慢，但可以继续使用。`

      case PromptErrorType.CATEGORY_NOT_FOUND:
        return `找不到指定的分类。请检查分类ID是否正确。`

      case PromptErrorType.PERMISSION_DENIED:
        return `权限不足，无法执行此操作。`

      default:
        return this.message
    }
  }

  /**
   * 获取错误严重程度
   */
  getSeverity(): 'low' | 'medium' | 'high' | 'critical' {
    switch (this.type) {
      case PromptErrorType.CACHE_ERROR:
        return 'low'

      case PromptErrorType.VARIABLE_VALIDATION_FAILED:
      case PromptErrorType.CATEGORY_NOT_FOUND:
        return 'medium'

      case PromptErrorType.TEMPLATE_NOT_FOUND:
      case PromptErrorType.VERSION_NOT_FOUND:
      case PromptErrorType.INVALID_TEMPLATE:
      case PromptErrorType.RENDER_ERROR:
        return 'high'

      case PromptErrorType.STORAGE_ERROR:
      case PromptErrorType.PERMISSION_DENIED:
        return 'critical'

      default:
        return 'medium'
    }
  }

  /**
   * 判断是否可以重试
   */
  isRetryable(): boolean {
    switch (this.type) {
      case PromptErrorType.STORAGE_ERROR:
      case PromptErrorType.CACHE_ERROR:
        return true

      case PromptErrorType.RENDER_ERROR:
        return this.details.retryable === true

      default:
        return false
    }
  }

  /**
   * 获取建议的重试延迟（毫秒）
   */
  getRetryDelay(attempt: number): number {
    if (!this.isRetryable()) {
      return 0
    }

    // 指数退避策略
    const baseDelay = 1000 // 1秒
    const maxDelay = 30000 // 30秒
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)

    // 添加随机抖动，避免雷群效应
    const jitter = Math.random() * 0.1 * delay
    return delay + jitter
  }
}

/**
 * 错误工厂类
 * 提供创建各种类型错误的便捷方法
 */
export class PromptErrorFactory {
  /**
   * 创建模板未找到错误
   */
  static templateNotFound(id: string, context?: Record<string, any>): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.TEMPLATE_NOT_FOUND,
      `Template with ID '${id}' not found`,
      'TEMPLATE_NOT_FOUND',
      { templateId: id },
      context
    )
  }

  /**
   * 创建无效模板错误
   */
  static invalidTemplate(
    message: string,
    position?: { line: number; column: number },
    suggestion?: string,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.INVALID_TEMPLATE,
      `Invalid template: ${message}`,
      'INVALID_TEMPLATE',
      { position, suggestion },
      context
    )
  }

  /**
   * 创建变量验证失败错误
   */
  static variableValidationFailed(
    errors: ValidationError[],
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.VARIABLE_VALIDATION_FAILED,
      `Variable validation failed: ${errors.map(e => e.message).join(', ')}`,
      'VARIABLE_VALIDATION_FAILED',
      { errors, errorCount: errors.length },
      context
    )
  }

  /**
   * 创建版本未找到错误
   */
  static versionNotFound(
    templateId: string,
    version: string,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.VERSION_NOT_FOUND,
      `Version '${version}' not found for template '${templateId}'`,
      'VERSION_NOT_FOUND',
      { templateId, version },
      context
    )
  }

  /**
   * 创建渲染错误
   */
  static renderError(
    message: string,
    templateId?: string,
    variables?: Record<string, any>,
    cause?: Error,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.RENDER_ERROR,
      `Template render error: ${message}`,
      'RENDER_ERROR',
      { templateId, variables, retryable: true },
      context,
      cause
    )
  }

  /**
   * 创建存储错误
   */
  static storageError(
    message: string,
    operation?: string,
    path?: string,
    cause?: Error,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.STORAGE_ERROR,
      `Storage error: ${message}`,
      'STORAGE_ERROR',
      { operation, path },
      context,
      cause
    )
  }

  /**
   * 创建缓存错误
   */
  static cacheError(
    message: string,
    operation?: string,
    key?: string,
    cause?: Error,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.CACHE_ERROR,
      `Cache error: ${message}`,
      'CACHE_ERROR',
      { operation, key, retryable: true },
      context,
      cause
    )
  }

  /**
   * 创建分类未找到错误
   */
  static categoryNotFound(
    id: string,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.CATEGORY_NOT_FOUND,
      `Category with ID '${id}' not found`,
      'CATEGORY_NOT_FOUND',
      { categoryId: id },
      context
    )
  }

  /**
   * 创建权限拒绝错误
   */
  static permissionDenied(
    action: string,
    userId?: string,
    resourceId?: string,
    context?: Record<string, any>
  ): EnhancedPromptError {
    return new EnhancedPromptError(
      PromptErrorType.PERMISSION_DENIED,
      `Permission denied for action: ${action}`,
      'PERMISSION_DENIED',
      { action, userId, resourceId },
      context
    )
  }
}

/**
 * 错误处理器接口
 */
export interface IErrorHandler {
  /**
   * 处理错误
   */
  handle(error: Error, context?: Record<string, any>): Promise<void>

  /**
   * 判断是否可以处理指定类型的错误
   */
  canHandle(error: Error): boolean

  /**
   * 获取处理器优先级
   */
  getPriority(): number
}

/**
 * 错误恢复策略接口
 */
export interface IErrorRecoveryStrategy {
  /**
   * 尝试恢复
   */
  recover(error: EnhancedPromptError, context?: Record<string, any>): Promise<boolean>

  /**
   * 判断是否可以尝试恢复
   */
  canRecover(error: EnhancedPromptError): boolean
}

/**
 * 控制台日志错误处理器
 */
export class ConsoleLogErrorHandler implements IErrorHandler {
  constructor(private logger: any) {}

  async handle(error: Error, context?: Record<string, any>): Promise<void> {
    const enhancedError = error instanceof EnhancedPromptError
      ? error
      : new EnhancedPromptError(
          PromptErrorType.RENDER_ERROR,
          error.message,
          'UNKNOWN_ERROR',
          { originalError: error },
          context
        )

    if (enhancedError.getSeverity() === 'low') {
      this.logger?.debug?.(enhancedError.toJSON()) || console.debug(enhancedError.toJSON())
    } else if (enhancedError.getSeverity() === 'medium') {
      this.logger?.info?.(enhancedError.toJSON()) || console.info(enhancedError.toJSON())
    } else if (enhancedError.getSeverity() === 'high') {
      this.logger?.warn?.(enhancedError.toJSON()) || console.warn(enhancedError.toJSON())
    } else {
      this.logger?.error?.(enhancedError.toJSON()) || console.error(enhancedError.toJSON())
    }
  }

  canHandle(error: Error): boolean {
    return true // 可以处理所有类型的错误
  }

  getPriority(): number {
    return 1 // 最低优先级
  }
}

/**
 * 重试恢复策略
 */
export class RetryRecoveryStrategy implements IErrorRecoveryStrategy {
  constructor(
    private maxAttempts: number = 3,
    private baseDelay: number = 1000
  ) {}

  async recover(error: EnhancedPromptError, context?: Record<string, any>): Promise<boolean> {
    if (!error.isRetryable()) {
      return false
    }

    const attempt = context?.attempt || 1
    if (attempt > this.maxAttempts) {
      return false
    }

    const delay = error.getRetryDelay(attempt)
    await new Promise(resolve => setTimeout(resolve, delay))

    return true
  }

  canRecover(error: EnhancedPromptError): boolean {
    return error.isRetryable()
  }
}

/**
 * 错误管理器
 * 统一管理错误处理和恢复策略
 */
export class ErrorManager {
  private handlers: IErrorHandler[] = []
  private recoveryStrategies: IErrorRecoveryStrategy[] = []

  /**
   * 注册错误处理器
   */
  registerHandler(handler: IErrorHandler): void {
    this.handlers.push(handler)
    // 按优先级排序
    this.handlers.sort((a, b) => b.getPriority() - a.getPriority())
  }

  /**
   * 注册恢复策略
   */
  registerRecoveryStrategy(strategy: IErrorRecoveryStrategy): void {
    this.recoveryStrategies.push(strategy)
  }

  /**
   * 处理错误
   */
  async handleError(error: Error, context?: Record<string, any>): Promise<void> {
    const enhancedError = error instanceof EnhancedPromptError
      ? error
      : new EnhancedPromptError(
          PromptErrorType.RENDER_ERROR,
          error.message,
          'UNKNOWN_ERROR',
          { originalError: error },
          context
        )

    // 使用所有可用的处理器处理错误
    for (const handler of this.handlers) {
      if (handler.canHandle(enhancedError)) {
        try {
          await handler.handle(enhancedError, context)
        } catch (handlerError) {
          // 避免处理器本身出错导致无限递归
          console.error('Error in error handler:', handlerError)
        }
      }
    }
  }

  /**
   * 尝试恢复
   */
  async attemptRecovery(
    error: EnhancedPromptError,
    context?: Record<string, any>
  ): Promise<boolean> {
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canRecover(error)) {
        try {
          const recovered = await strategy.recover(error, context)
          if (recovered) {
            return true
          }
        } catch (recoveryError) {
          console.error('Error in recovery strategy:', recoveryError)
        }
      }
    }
    return false
  }

  /**
   * 带重试的操作执行
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    let attempt = 1
    let lastError: Error | null = null

    while (attempt <= this.getMaxRetryAttempts()) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        const enhancedError = error instanceof EnhancedPromptError
          ? error
          : new EnhancedPromptError(
              PromptErrorType.RENDER_ERROR,
              error instanceof Error ? error.message : String(error),
              'UNKNOWN_ERROR',
              { originalError: error },
              context
            )

        await this.handleError(enhancedError, { ...context, attempt })

        if (attempt < this.getMaxRetryAttempts() && enhancedError.isRetryable()) {
          const recovered = await this.attemptRecovery(enhancedError, { ...context, attempt })
          if (recovered) {
            attempt++
            continue
          }
        }

        break
      }
    }

    throw lastError || new Error('Operation failed after all retry attempts')
  }

  private getMaxRetryAttempts(): number {
    // 可以从配置中读取，这里使用默认值
    return 3
  }
}

// 导出单例实例
export const errorManager = new ErrorManager()

// 注册默认处理器
errorManager.registerHandler(new ConsoleLogErrorHandler(console))

// 注册默认恢复策略
errorManager.registerRecoveryStrategy(new RetryRecoveryStrategy())