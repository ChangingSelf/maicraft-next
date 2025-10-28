/**
 * 模板渲染器
 *
 * 负责执行编译后的模板函数，处理变量替换和模板渲染
 * 提供安全的渲染环境和错误处理
 */

import { CompiledTemplate } from '../types'
import { PromptErrorFactory, PromptErrorType } from '../errors/PromptError'

/**
 * 渲染选项
 */
export interface RenderOptions {
  /** 是否启用严格模式（未定义变量会抛出错误） */
  strict: boolean
  /** 最大渲染时间（毫秒） */
  maxRenderTime: number
  /** 是否自动转义HTML */
  autoEscape: boolean
  /** 默认变量值 */
  defaultValues: Record<string, any>
  /** 自定义变量处理器 */
  variableHandlers: Record<string, (value: any) => any>
}

/**
 * 默认渲染选项
 */
export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  strict: false,
  maxRenderTime: 5000,
  autoEscape: false,
  defaultValues: {},
  variableHandlers: {}
}

/**
 * 渲染结果
 */
export interface RenderResult {
  /** 渲染结果 */
  result: string
  /** 渲染耗时（毫秒） */
  renderTime: number
  /** 使用的变量列表 */
  usedVariables: string[]
  /** 缺失的变量列表 */
  missingVariables: string[]
  /** 错误信息（如果有） */
  error?: string
}

/**
 * 模板渲染器
 */
export class Renderer {
  private options: RenderOptions

  constructor(options: Partial<RenderOptions> = {}) {
    this.options = { ...DEFAULT_RENDER_OPTIONS, ...options }
  }

  /**
   * 渲染模板
   */
  render(
    compiledTemplate: CompiledTemplate,
    variables: Record<string, any> = {}
  ): RenderResult {
    const startTime = Date.now()
    const usedVariables: string[] = []
    const missingVariables: string[] = []

    try {
      // 设置渲染超时
      const timeoutId = this.options.maxRenderTime > 0
        ? setTimeout(() => {
            throw PromptErrorFactory.renderError(
              `Template rendering timeout (${this.options.maxRenderTime}ms)`
            )
          }, this.options.maxRenderTime)
        : null

      // 准备变量
      const processedVariables = this.processVariables(
        variables,
        compiledTemplate.dependencies,
        usedVariables,
        missingVariables
      )

      // 执行渲染
      let result = compiledTemplate.render(processedVariables)

      // 后处理
      result = this.postProcess(result)

      // 清除超时
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      return {
        result,
        renderTime: Date.now() - startTime,
        usedVariables,
        missingVariables
      }
    } catch (error) {
      return {
        result: '',
        renderTime: Date.now() - startTime,
        usedVariables,
        missingVariables,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 处理变量
   */
  private processVariables(
    variables: Record<string, any>,
    dependencies: string[],
    usedVariables: string[],
    missingVariables: string[]
  ): Record<string, any> {
    const processed: Record<string, any> = { ...this.options.defaultValues }

    for (const dependency of dependencies) {
      const value = this.getVariableValue(variables, dependency)
      usedVariables.push(dependency)

      if (value === undefined) {
        missingVariables.push(dependency)
        if (this.options.strict) {
          throw PromptErrorFactory.renderError(
            `Undefined variable: ${dependency}`,
            undefined,
            { variable: dependency }
          )
        }
        processed[dependency] = ''
      } else {
        processed[dependency] = this.applyVariableHandlers(dependency, value)
      }
    }

    return processed
  }

  /**
   * 获取变量值
   */
  private getVariableValue(variables: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, variables)
  }

  /**
   * 应用变量处理器
   */
  private applyVariableHandlers(name: string, value: any): any {
    const handler = this.options.variableHandlers[name]
    if (handler) {
      try {
        return handler(value)
      } catch (error) {
        if (this.options.strict) {
          throw PromptErrorFactory.renderError(
            `Variable handler error for '${name}': ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { variable: name, value }
          )
        }
        return value
      }
    }

    // 应用类型转换
    if (value === null || value === undefined) {
      return ''
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return '[Object]'
      }
    }

    return String(value)
  }

  /**
   * 后处理渲染结果
   */
  private postProcess(result: string): string {
    if (this.options.autoEscape) {
      // 简单的HTML转义
      return result
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
    }

    return result
  }

  /**
   * 批量渲染
   */
  async renderBatch(
    requests: Array<{
      template: CompiledTemplate
      variables: Record<string, any>
      options?: Partial<RenderOptions>
    }>
  ): Promise<RenderResult[]> {
    const results: RenderResult[] = []

    for (const request of requests) {
      const renderer = new Renderer({ ...this.options, ...request.options })
      const result = renderer.render(request.template, request.variables)
      results.push(result)
    }

    return results
  }

  /**
   * 流式渲染（支持大型模板）
   */
  async *renderStream(
    compiledTemplate: CompiledTemplate,
    variables: Record<string, any> = {},
    chunkSize: number = 1024
  ): AsyncGenerator<string, void, unknown> {
    const result = this.render(compiledTemplate, variables)

    if (result.error) {
      throw PromptErrorFactory.renderError(result.error)
    }

    // 将结果分块输出
    for (let i = 0; i < result.result.length; i += chunkSize) {
      yield result.result.slice(i, i + chunkSize)

      // 让出控制权，避免阻塞
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  /**
   * 验证模板依赖
   */
  validateDependencies(
    compiledTemplate: CompiledTemplate,
    availableVariables: string[]
  ): {
    valid: boolean
    missing: string[]
    extra: string[]
  } {
    const missing = compiledTemplate.dependencies.filter(
      dep => !availableVariables.includes(dep)
    )
    const extra = availableVariables.filter(
      variable => !compiledTemplate.dependencies.includes(variable)
    )

    return {
      valid: missing.length === 0,
      missing,
      extra
    }
  }

  /**
   * 获取渲染统计信息
   */
  getRenderStatistics(results: RenderResult[]): {
    totalRenders: number
    successfulRenders: number
    failedRenders: number
    averageRenderTime: number
    totalUsedVariables: string[]
    commonMissingVariables: Array<{ variable: string; count: number }>
  } {
    const successful = results.filter(r => !r.error)
    const failed = results.filter(r => r.error)
    const allUsedVariables = new Set<string>()
    const missingCounts: Record<string, number> = {}

    results.forEach(result => {
      result.usedVariables.forEach(variable => allUsedVariables.add(variable))
      result.missingVariables.forEach(variable => {
        missingCounts[variable] = (missingCounts[variable] || 0) + 1
      })
    })

    const commonMissing = Object.entries(missingCounts)
      .map(([variable, count]) => ({ variable, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalRenders: results.length,
      successfulRenders: successful.length,
      failedRenders: failed.length,
      averageRenderTime: successful.length > 0
        ? successful.reduce((sum, r) => sum + r.renderTime, 0) / successful.length
        : 0,
      totalUsedVariables: Array.from(allUsedVariables),
      commonMissingVariables: commonMissing
    }
  }
}