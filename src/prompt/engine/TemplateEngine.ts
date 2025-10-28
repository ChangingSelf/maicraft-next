/**
 * 模板引擎
 *
 * 整合词法分析器、语法分析器、编译器和渲染器
 * 提供统一的模板处理接口
 */

import { Token, TokenType, Lexer, DEFAULT_LEXER_CONFIG } from './Lexer'
import { Parser, DEFAULT_PARSER_CONFIG } from './Parser'
import { Compiler, DEFAULT_COMPILE_OPTIONS } from './Compiler'
import { Renderer, DEFAULT_RENDER_OPTIONS, RenderResult, RenderOptions } from './Renderer'
import { TemplateAST, TemplateFilterFunction, TemplateFunction, CompiledTemplate } from '../types'
import { PromptErrorFactory, PromptErrorType } from '../errors/PromptError'

/**
 * 模板引擎配置
 */
export interface TemplateEngineConfig {
  /** 词法分析器配置 */
  lexer: Partial<typeof DEFAULT_LEXER_CONFIG>
  /** 语法分析器配置 */
  parser: Partial<typeof DEFAULT_PARSER_CONFIG>
  /** 编译器配置 */
  compiler: Partial<typeof DEFAULT_COMPILE_OPTIONS>
  /** 渲染器配置 */
  renderer: Partial<typeof DEFAULT_RENDER_OPTIONS>
}

/**
 * 默认模板引擎配置
 */
export const DEFAULT_TEMPLATE_ENGINE_CONFIG: TemplateEngineConfig = {
  lexer: {},
  parser: {},
  compiler: {},
  renderer: {}
}

/**
 * 模板处理结果
 */
export interface ProcessResult {
  /** 编译后的模板 */
  compiledTemplate: CompiledTemplate
  /** 处理统计信息 */
  statistics: {
    /** 词法分析耗时 */
    lexTime: number
    /** 语法分析耗时 */
    parseTime: number
    /** 编译耗时 */
    compileTime: number
    /** 总耗时 */
    totalTime: number
    /** Token数量 */
    tokenCount: number
    /** AST节点数量 */
    nodeCount: number
    /** 依赖变量数量 */
    dependencyCount: number
  }
}

/**
 * 模板引擎
 */
export class TemplateEngine {
  private config: TemplateEngineConfig
  private lexer: Lexer
  private parser: Parser
  private compiler: Compiler
  private renderer: Renderer

  // 内置过滤器
  private filters: Record<string, TemplateFilterFunction> = {}
  // 内置函数
  private functions: Record<string, TemplateFunction> = {}
  // 编译缓存
  private cache: Map<string, CompiledTemplate> = new Map()

  constructor(config: Partial<TemplateEngineConfig> = {}) {
    this.config = {
      lexer: { ...DEFAULT_LEXER_CONFIG, ...config.lexer },
      parser: { ...DEFAULT_PARSER_CONFIG, ...config.parser },
      compiler: { ...DEFAULT_COMPILE_OPTIONS, ...config.compiler },
      renderer: { ...DEFAULT_RENDER_OPTIONS, ...config.renderer }
    }

    this.lexer = new Lexer(this.config.lexer)
    this.parser = new Parser(this.config.parser)
    this.compiler = new Compiler(this.config.compiler)
    this.renderer = new Renderer(this.config.renderer)

    this.initializeBuiltins()
  }

  /**
   * 处理模板字符串
   */
  process(template: string, useCache: boolean = true): ProcessResult {
    const startTime = Date.now()

    // 检查缓存
    const cacheKey = this.generateCacheKey(template)
    if (useCache && this.cache.has(cacheKey)) {
      const cachedTemplate = this.cache.get(cacheKey)!
      return {
        compiledTemplate: cachedTemplate,
        statistics: {
          lexTime: 0,
          parseTime: 0,
          compileTime: 0, // 缓存的模板没有重新编译时间
          totalTime: 0,
          tokenCount: 0,
          nodeCount: 0,
          dependencyCount: cachedTemplate.dependencies.length
        }
      }
    }

    try {
      // 词法分析
      const lexStart = Date.now()
      const tokens = this.lexer.tokenize(template)
      const lexTime = Date.now() - lexStart

      // 语法分析
      const parseStart = Date.now()
      const ast = this.parser.parse(tokens)
      const parseTime = Date.now() - parseStart

      // 编译
      const compileStart = Date.now()
      const internalCompiled = this.compiler.compile(ast)
      const compileTime = Date.now() - compileStart

      // 创建完整的CompiledTemplate
      const compiledTemplate: CompiledTemplate = {
        id: cacheKey,
        version: '1.0.0',
        compiledAt: new Date(),
        ast,
        render: internalCompiled.render,
        dependencies: internalCompiled.dependencies
      }

      // 缓存结果
      if (useCache) {
        this.cache.set(cacheKey, compiledTemplate)
      }

      return {
        compiledTemplate,
        statistics: {
          lexTime,
          parseTime,
          compileTime,
          totalTime: Date.now() - startTime,
          tokenCount: tokens.length,
          nodeCount: Parser.getStatistics(ast).totalNodes,
          dependencyCount: compiledTemplate.dependencies.length
        }
      }
    } catch (error) {
      throw PromptErrorFactory.renderError(
        `Template processing failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * 渲染模板
   */
  render(
    template: string,
    variables: Record<string, any> = {},
    options?: Partial<RenderOptions>
  ): RenderResult {
    try {
      const processResult = this.process(template)
      const renderer = options
        ? new Renderer({ ...this.config.renderer, ...options })
        : this.renderer

      return renderer.render(processResult.compiledTemplate, variables)
    } catch (error) {
      return {
        result: '',
        renderTime: 0,
        usedVariables: [],
        missingVariables: [],
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 编译模板（仅编译，不渲染）
   */
  compile(template: string, useCache: boolean = true): CompiledTemplate {
    return this.process(template, useCache).compiledTemplate
  }

  /**
   * 验证模板语法
   */
  validate(template: string): {
    valid: boolean
    errors: string[]
    warnings: string[]
    tokens?: Token[]
    ast?: TemplateAST
  } {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // 词法分析
      const tokens = this.lexer.tokenize(template)

      // 验证词法单元
      const lexerValidation = this.lexer.validate(tokens)
      if (!lexerValidation.valid) {
        errors.push(...lexerValidation.errors)
      }

      // 语法分析
      const ast = this.parser.parse(tokens)

      // 验证AST
      const astValidation = Parser.validate(ast)
      if (!astValidation.valid) {
        errors.push(...astValidation.errors)
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        tokens,
        ast
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return {
        valid: false,
        errors,
        warnings
      }
    }
  }

  /**
   * 添加自定义过滤器
   */
  addFilter(name: string, filter: TemplateFilterFunction): void {
    this.filters[name] = filter
    this.compiler = new Compiler({
      ...this.config.compiler,
      filters: { ...this.filters }
    })
    this.clearCache()
  }

  /**
   * 添加自定义函数
   */
  addFunction(name: string, fn: TemplateFunction): void {
    this.functions[name] = fn
    this.compiler = new Compiler({
      ...this.config.compiler,
      functions: { ...this.functions }
    })
    this.clearCache()
  }

  /**
   * 移除过滤器
   */
  removeFilter(name: string): void {
    delete this.filters[name]
    this.compiler = new Compiler({
      ...this.config.compiler,
      filters: { ...this.filters }
    })
    this.clearCache()
  }

  /**
   * 移除函数
   */
  removeFunction(name: string): void {
    delete this.functions[name]
    this.compiler = new Compiler({
      ...this.config.compiler,
      functions: { ...this.functions }
    })
    this.clearCache()
  }

  /**
   * 获取所有过滤器
   */
  getFilters(): Record<string, TemplateFilterFunction> {
    return { ...this.filters }
  }

  /**
   * 获取所有函数
   */
  getFunctions(): Record<string, TemplateFunction> {
    return { ...this.functions }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStatistics(): {
    size: number
    totalSize: number
    hitRate: number
  } {
    return {
      size: this.cache.size,
      totalSize: this.cache.size,
      hitRate: 0 // TODO: 实现命中率统计
    }
  }

  /**
   * 获取引擎统计信息
   */
  getEngineStatistics(): {
    lexerConfig: typeof DEFAULT_LEXER_CONFIG
    parserConfig: typeof DEFAULT_PARSER_CONFIG
    compilerConfig: typeof DEFAULT_COMPILE_OPTIONS
    rendererConfig: typeof DEFAULT_RENDER_OPTIONS
    filterCount: number
    functionCount: number
    cacheSize: number
  } {
    return {
      lexerConfig: this.config.lexer as typeof DEFAULT_LEXER_CONFIG,
      parserConfig: this.config.parser as typeof DEFAULT_PARSER_CONFIG,
      compilerConfig: this.config.compiler as typeof DEFAULT_COMPILE_OPTIONS,
      rendererConfig: this.config.renderer as typeof DEFAULT_RENDER_OPTIONS,
      filterCount: Object.keys(this.filters).length,
      functionCount: Object.keys(this.functions).length,
      cacheSize: this.cache.size
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(template: string): string {
    // 简单的哈希实现
    let hash = 0
    for (let i = 0; i < template.length; i++) {
      const char = template.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return `template_${Math.abs(hash)}`
  }

  /**
   * 初始化内置过滤器和函数
   */
  private initializeBuiltins(): void {
    // 内置过滤器
    this.addFilter('upper', (value: string) => String(value).toUpperCase())
    this.addFilter('lower', (value: string) => String(value).toLowerCase())
    this.addFilter('capitalize', (value: string) => {
      const str = String(value)
      return str.charAt(0).toUpperCase() + str.slice(1)
    })
    this.addFilter('truncate', (value: string, length: number = 50) => {
      const str = String(value)
      return str.length > length ? str.slice(0, length) + '...' : str
    })
    this.addFilter('default', (value: any, defaultValue: any) => {
      return value !== undefined && value !== null && value !== '' ? value : defaultValue
    })
    this.addFilter('json', (value: any) => JSON.stringify(value, null, 2))
    this.addFilter('date', (value: any, format: string = 'YYYY-MM-DD') => {
      const date = new Date(value)
      if (isNaN(date.getTime())) return String(value)

      // 简单的日期格式化
      return format
        .replace('YYYY', date.getFullYear().toString())
        .replace('MM', (date.getMonth() + 1).toString().padStart(2, '0'))
        .replace('DD', date.getDate().toString().padStart(2, '0'))
        .replace('HH', date.getHours().toString().padStart(2, '0'))
        .replace('mm', date.getMinutes().toString().padStart(2, '0'))
        .replace('ss', date.getSeconds().toString().padStart(2, '0'))
    })

    // 内置函数
    this.addFunction('now', () => new Date())
    this.addFunction('uuid', () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    })
    this.addFunction('random', (min: number = 0, max: number = 100) => {
      return Math.floor(Math.random() * (max - min + 1)) + min
    })
  }
}