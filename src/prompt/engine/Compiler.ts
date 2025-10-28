/**
 * 模板编译器
 *
 * 负责将抽象语法树（AST）编译为可执行的渲染函数
 * 生成高效的JavaScript代码用于模板渲染
 */

import { TemplateAST, CompiledTemplate } from '../types'
import { PromptErrorFactory, PromptErrorType } from '../errors/PromptError'

/**
 * 编译选项
 */
export interface CompileOptions {
  /** 是否启用调试模式 */
  debug: boolean
  /** 是否启用缓存 */
  cache: boolean
  /** 是否启用安全模式（过滤XSS等） */
  safe: boolean
  /** 自定义过滤器 */
  filters: Record<string, Function>
  /** 自定义函数 */
  functions: Record<string, Function>
}

/**
 * 默认编译选项
 */
export const DEFAULT_COMPILE_OPTIONS: CompileOptions = {
  debug: false,
  cache: true,
  safe: false,
  filters: {},
  functions: {}
}

/**
 * 编译器内部编译结果
 */
interface InternalCompiledTemplate {
  /** 渲染函数 */
  render: (variables: Record<string, any>) => string
  /** 依赖的变量列表 */
  dependencies: string[]
  /** 编译时间 */
  compileTime: number
  /** 源码（调试用） */
  source?: string
}

/**
 * 编译上下文
 */
interface CompileContext {
  /** 变量名计数器 */
  varCounter: number
  /** 依赖的变量集合 */
  dependencies: Set<string>
  /** 代码片段数组 */
  code: string[]
  /** 当前缩进级别 */
  indent: number
}

/**
 * 模板编译器
 */
export class Compiler {
  private options: CompileOptions

  constructor(options: Partial<CompileOptions> = {}) {
    this.options = { ...DEFAULT_COMPILE_OPTIONS, ...options }
  }

  /**
   * 编译AST为可执行函数
   */
  compile(ast: TemplateAST): InternalCompiledTemplate {
    const startTime = Date.now()
    const context: CompileContext = {
      varCounter: 0,
      dependencies: new Set(),
      code: [],
      indent: 0
    }

    // 生成函数头部
    this.addLine(context, 'function render(variables = {}) {')
    context.indent++
    this.addLine(context, 'let result = "";')
    this.addLine(context, '')

    // 编译AST节点
    this.compileNode(ast, context)

    // 生成函数尾部
    this.addLine(context, 'return result;')
    context.indent--
    this.addLine(context, '}')

    const source = context.code.join('\n')
    let renderFn: (variables: Record<string, any>) => string

    try {
      // 创建函数并绑定上下文
      const factory = new Function('filters', 'functions', source)
      renderFn = factory(this.options.filters, this.options.functions).bind(this.createRenderContext())
    } catch (error) {
      throw PromptErrorFactory.renderError(
        `Failed to compile template: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      )
    }

    return {
      render: renderFn,
      dependencies: Array.from(context.dependencies),
      compileTime: Date.now() - startTime,
      source: this.options.debug ? source : undefined
    }
  }

  /**
   * 编译AST节点
   */
  private compileNode(node: TemplateAST, context: CompileContext): void {
    switch (node.type) {
      case 'root':
        this.compileRoot(node, context)
        break
      case 'text':
        this.compileText(node, context)
        break
      case 'variable':
        this.compileVariable(node, context)
        break
      case 'conditional':
        this.compileConditional(node, context)
        break
      case 'loop':
        this.compileLoop(node, context)
        break
      case 'include':
        this.compileInclude(node, context)
        break
      default:
        throw PromptErrorFactory.renderError(
          `Unknown node type: ${(node as any).type}`,
          undefined,
          undefined,
          undefined,
          { nodeType: (node as any).type, position: node.position }
        )
    }
  }

  /**
   * 编译根节点
   */
  private compileRoot(node: TemplateAST, context: CompileContext): void {
    if (node.children) {
      node.children.forEach(child => this.compileNode(child, context))
    }
  }

  /**
   * 编译文本节点
   */
  private compileText(node: TemplateAST, context: CompileContext): void {
    const escapedText = this.escapeString(node.value)
    this.addLine(context, `result += ${escapedText};`)
  }

  /**
   * 编译变量节点
   */
  private compileVariable(node: TemplateAST, context: CompileContext): void {
    const value = node.value.trim()

    // 解析变量路径，支持嵌套属性访问和过滤器
    const parsed = this.parseVariableExpression(value)

    // 添加变量依赖
    context.dependencies.add(parsed.variable)

    // 生成变量访问代码
    const varName = this.getVariableName(context)
    this.addLine(context, `const ${varName} = this.getVariable(variables, ${this.escapeString(parsed.variable)});`)

    // 应用过滤器
    let result = varName
    if (parsed.filters.length > 0) {
      for (const filter of parsed.filters) {
        if (this.options.filters[filter.name]) {
          const args = [result, ...filter.args.map(arg => this.escapeString(arg))].join(', ')
          result = `filters[${this.escapeString(filter.name)}](${args})`
        } else {
          throw PromptErrorFactory.renderError(
            `Unknown filter: ${filter.name}`,
            undefined,
            undefined,
            undefined,
            { filter: filter.name, position: node.position }
          )
        }
      }
    }

    this.addLine(context, `result += String(${result} || '');`)
  }

  /**
   * 编译条件节点
   */
  private compileConditional(node: TemplateAST, context: CompileContext): void {
    const condition = this.parseCondition(node.value)
    const conditionCode = this.generateConditionCode(condition, context)

    // 添加if语句
    this.addLine(context, `if (${conditionCode}) {`)
    context.indent++

    // 编译if分支
    if (node.children) {
      node.children.forEach(child => this.compileNode(child, context))
    }

    context.indent--

    // 编译else分支（如果存在）
    const elseChildren = (node as any).else
    if (elseChildren && elseChildren.length > 0) {
      this.addLine(context, '} else {')
      context.indent++
      elseChildren.forEach((child: TemplateAST) => this.compileNode(child, context))
      context.indent--
    }

    this.addLine(context, '}')
  }

  /**
   * 编译循环节点
   */
  private compileLoop(node: TemplateAST, context: CompileContext): void {
    let loopConfig: { variable: string; collection: string }

    try {
      loopConfig = JSON.parse(node.value)
    } catch (error) {
      throw PromptErrorFactory.renderError(
        `Invalid loop configuration: ${node.value}`,
        undefined,
        undefined,
        undefined,
        { position: node.position }
      )
    }

    const itemVar = this.getVariableName(context)
    const indexVar = this.getVariableName(context)
    const collectionVar = this.getVariableName(context)
    const collectionName = loopConfig.collection

    // 添加依赖
    context.dependencies.add(collectionName)

    // 生成循环代码
    this.addLine(context, `const ${collectionVar} = this.getVariable(variables, ${this.escapeString(collectionName)}) || [];`)
    this.addLine(context, `if (Array.isArray(${collectionVar})) {`)
    context.indent++
    this.addLine(context, `${collectionVar}.forEach((${itemVar}, ${indexVar}) => {`)
    context.indent++

    // 设置循环变量
    this.addLine(context, `variables['${loopConfig.variable}'] = ${itemVar};`)
    this.addLine(context, `variables['${loopConfig.variable}_index'] = ${indexVar};`)
    this.addLine(context, `variables['${loopConfig.variable}_first'] = ${indexVar} === 0;`)
    this.addLine(context, `variables['${loopConfig.variable}_last'] = ${indexVar} === ${collectionVar}.length - 1;`)

    // 编译循环体
    if (node.children) {
      node.children.forEach(child => this.compileNode(child, context))
    }

    context.indent--
    this.addLine(context, '});')
    context.indent--
    this.addLine(context, '}')
  }

  /**
   * 编译包含节点
   */
  private compileInclude(node: TemplateAST, context: CompileContext): void {
    const templateName = node.value
    this.addLine(context, `result += this.includeTemplate(${this.escapeString(templateName)}, variables);`)
  }

  /**
   * 解析变量表达式
   */
  private parseVariableExpression(expression: string): {
    variable: string
    filters: Array<{ name: string; args: string[] }>
  } {
    // 简单实现：支持 variable | filter:arg1:arg2 格式
    const parts = expression.split('|').map(s => s.trim())
    const variable = parts[0]
    const filters: Array<{ name: string; args: string[] }> = []

    for (let i = 1; i < parts.length; i++) {
      const filterParts = parts[i].split(':')
      const name = filterParts[0]
      const args = filterParts.slice(1)
      filters.push({ name, args })
    }

    return { variable, filters }
  }

  /**
   * 解析条件表达式
   */
  private parseCondition(condition: string): any {
    // 简单实现：支持基本的比较运算符
    condition = condition.trim()

    // 处理逻辑运算符
    if (condition.includes('&&')) {
      const parts = condition.split('&&').map(s => s.trim())
      return {
        type: 'and',
        conditions: parts.map(p => this.parseCondition(p))
      }
    }

    if (condition.includes('||')) {
      const parts = condition.split('||').map(s => s.trim())
      return {
        type: 'or',
        conditions: parts.map(p => this.parseCondition(p))
      }
    }

    // 处理比较运算符
    const operators = ['===', '!==', '>=', '<=', '>', '<', '==', '!=']
    for (const op of operators) {
      if (condition.includes(op)) {
        const parts = condition.split(op).map(s => s.trim())
        return {
          type: 'comparison',
          operator: op,
          left: this.parseCondition(parts[0]),
          right: this.parseCondition(parts[1])
        }
      }
    }

    // 处理否定
    if (condition.startsWith('!')) {
      return {
        type: 'not',
        condition: this.parseCondition(condition.slice(1).trim())
      }
    }

    // 简单变量
    return {
      type: 'variable',
      value: condition
    }
  }

  /**
   * 生成条件代码
   */
  private generateConditionCode(condition: any, context: CompileContext): string {
    switch (condition.type) {
      case 'and':
        return condition.conditions.map((c: any) => this.generateConditionCode(c, context)).join(' && ')
      case 'or':
        return condition.conditions.map((c: any) => this.generateConditionCode(c, context)).join(' || ')
      case 'not':
        return `!(${this.generateConditionCode(condition.condition, context)})`
      case 'comparison':
        const left = this.generateConditionCode(condition.left, context)
        const right = this.generateConditionCode(condition.right, context)
        return `${left} ${condition.operator} ${right}`
      case 'variable':
        context.dependencies.add(condition.value)
        return `this.getVariable(variables, ${this.escapeString(condition.value)})`
      default:
        return 'true'
    }
  }

  /**
   * 获取唯一变量名
   */
  private getVariableName(context: CompileContext): string {
    return `__var${context.varCounter++}`
  }

  /**
   * 添加代码行
   */
  private addLine(context: CompileContext, line: string): void {
    const indent = '  '.repeat(context.indent)
    context.code.push(`${indent}${line}`)
  }

  /**
   * 转义字符串
   */
  private escapeString(str: string): string {
    return JSON.stringify(str)
  }

  /**
   * 创建渲染上下文
   */
  private createRenderContext(): any {
    return {
      getVariable: (variables: Record<string, any>, path: string): any => {
        return this.getNestedValue(variables, path)
      },
      includeTemplate: (templateName: string, variables: Record<string, any>): string => {
        // 这里应该从模板管理器获取包含的模板
        // 暂时返回占位符
        return `[Include: ${templateName}]`
      }
    }
  }

  /**
   * 获取嵌套属性值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }
}