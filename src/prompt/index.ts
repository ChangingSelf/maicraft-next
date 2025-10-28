/**
 * 提示词管理系统主入口文件
 *
 * 提供统一的API接口，导出所有核心功能
 */

// 核心类型定义
export * from './types'

// 错误处理
export * from './errors/PromptError'

// 模板引擎
export { TemplateEngine } from './engine/TemplateEngine'
export { Lexer, Token, TokenType } from './engine/Lexer'
export { Parser } from './engine/Parser'
export { Compiler } from './engine/Compiler'
export { Renderer } from './engine/Renderer'

// 版本信息
export const PROMPT_SYSTEM_VERSION = '1.0.0'

/**
 * 提示词管理系统主要功能概览
 *
 * 本系统提供完整的提示词模板管理功能，包括：
 *
 * 1. 模板引擎 - 支持变量替换、条件渲染、循环等
 * 2. 类型安全 - 完整的TypeScript类型定义和Zod验证
 * 3. 错误处理 - 统一的错误类型和处理机制
 * 4. 扩展性 - 支持自定义过滤器和函数
 * 5. 缓存优化 - 智能编译缓存提升性能
 *
 * 基本用法：
 * ```typescript
 * import { TemplateEngine } from './prompt'
 *
 * const engine = new TemplateEngine()
 * const result = engine.render('Hello, ${name}!', { name: 'World' })
 * console.log(result.result) // "Hello, World!"
 * ```
 */