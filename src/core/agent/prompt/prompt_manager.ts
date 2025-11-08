/**
 * Prompt Manager - 智能提示词模板管理器
 *
 * 完全照搬原版 maicraft 的实现，提供模板注册、参数格式化和提示词生成功能
 */

import { getLogger, type Logger } from '@/utils/Logger';

/**
 * 提示词模板类
 *
 * 对应 maicraft 的 PromptTemplate
 */
export class PromptTemplate {
  name: string;
  template: string;
  description: string;
  parameters: string[];

  constructor(name: string, template: string, description: string = '', parameters: string[] = []) {
    this.name = name;
    this.template = template;
    this.description = description;
    this.parameters = parameters.length > 0 ? parameters : this.extractParameters();
  }

  /**
   * 从模板中提取参数名
   *
   * 对应 Python 的 _extract_parameters()
   */
  private extractParameters(): string[] {
    // 匹配 {param} 或 {param:format} 格式
    const paramPattern = /\{([^}:]+)(?::[^}]+)?\}/g;
    const params = new Set<string>();
    let match;

    while ((match = paramPattern.exec(this.template)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }

  /**
   * 验证提供的参数是否完整
   *
   * 对应 Python 的 validate_parameters()
   */
  validateParameters(params: Record<string, any>): string[] {
    const missingParams: string[] = [];

    for (const param of this.parameters) {
      if (!(param in params)) {
        missingParams.push(param);
      }
    }

    return missingParams;
  }

  /**
   * 格式化模板
   *
   * 对应 Python 的 format(**kwargs)
   */
  format(params: Record<string, any>): string {
    try {
      let result = this.template;

      // 替换所有 {param} 格式的占位符
      for (const [key, value] of Object.entries(params)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        result = result.replace(regex, String(value ?? ''));
      }

      return result;
    } catch (error) {
      throw new Error(`模板格式化失败: ${error}`);
    }
  }
}

/**
 * 提示词管理器
 *
 * 对应 maicraft 的 PromptManager
 */
export class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || getLogger('PromptManager');
  }

  /**
   * 注册新模板
   *
   * 对应 Python 的 register_template()
   */
  registerTemplate(template: PromptTemplate): boolean {
    try {
      if (this.templates.has(template.name)) {
        this.logger.warn(`模板 '${template.name}' 已存在，将被覆盖`);
      }

      this.templates.set(template.name, template);
      this.logger.info(`成功注册模板: ${template.name}`);
      return true;
    } catch (error) {
      this.logger.error(`注册模板失败`, undefined, error as Error);
      return false;
    }
  }

  /**
   * 从字符串注册模板
   *
   * 对应 Python 的 register_template_from_string()
   */
  registerTemplateFromString(name: string, templateStr: string, description: string = ''): boolean {
    try {
      const template = new PromptTemplate(name, templateStr, description);
      return this.registerTemplate(template);
    } catch (error) {
      this.logger.error(`从字符串注册模板失败`, undefined, error as Error);
      return false;
    }
  }

  /**
   * 获取指定名称的模板
   *
   * 对应 Python 的 get_template()
   */
  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 根据模板名称和参数生成提示词（支持自动嵌套模板引用）
   *
   * 对应 Python 的 generate_prompt(template_name, **kwargs)
   * 这是核心方法！
   *
   * 增强功能：
   * - 自动识别 {template_name} 并替换为对应模板的内容
   * - 支持递归嵌套模板引用
   * - 防止循环引用
   */
  generatePrompt(templateName: string, params: Record<string, any>, visitedTemplates: Set<string> = new Set()): string {
    const template = this.getTemplate(templateName);

    if (!template) {
      throw new Error(`模板 '${templateName}' 不存在`);
    }

    // 检测循环引用
    if (visitedTemplates.has(templateName)) {
      throw new Error(`检测到循环引用: ${Array.from(visitedTemplates).join(' -> ')} -> ${templateName}`);
    }

    // 标记当前模板为已访问
    const newVisited = new Set(visitedTemplates);
    newVisited.add(templateName);

    // 扩展参数：自动解析嵌套模板引用
    const expandedParams = this.expandNestedTemplates(params, newVisited);

    // 格式化模板（使用扩展的参数和 manager 引用）
    try {
      const result = this.formatWithNestedTemplates(template, expandedParams, newVisited);
      this.logger.debug(`成功生成提示词，模板: ${templateName}`);
      return result;
    } catch (error) {
      this.logger.error(`生成提示词失败`, undefined, error as Error);
      throw error;
    }
  }

  /**
   * 格式化模板，支持嵌套模板自动替换
   */
  private formatWithNestedTemplates(template: PromptTemplate, params: Record<string, any>, visitedTemplates: Set<string>): string {
    let result = template.template;

    // 提取所有 {param} 占位符
    // 使用负向后顾断言和负向前瞻断言，避免匹配 {{ 和 }} 包围的内容
    const paramPattern = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)(?::[^}]+)?\}(?!\})/g;
    const placeholders = new Set<string>();
    let match;

    while ((match = paramPattern.exec(template.template)) !== null) {
      placeholders.add(match[1]);
    }

    // 处理每个占位符
    for (const placeholder of placeholders) {
      let value: string;

      // 检查参数是否存在且有值（空字符串也算有值）
      const paramValue = params[placeholder];
      const paramExists = placeholder in params;
      const hasNonEmptyValue = paramValue !== undefined && paramValue !== null && paramValue !== '';
      const hasTemplate = this.templates.has(placeholder);

      // 调试日志
      this.logger.debug(
        `🔍 处理占位符 '${placeholder}': paramExists=${paramExists}, hasTemplate=${hasTemplate}, paramValue=${JSON.stringify(paramValue)}`,
      );

      if (hasTemplate) {
        // ✅ 优先使用同名模板
        if (hasNonEmptyValue) {
          // 存在同名模板但用户也提供了非空值，这是冲突
          this.logger.warn(`⚠️ 参数 '${placeholder}' 的值被忽略，因为存在同名模板。` + `建议从参数中移除该字段，让系统自动生成。`);
        }
        try {
          value = this.generatePrompt(placeholder, params, visitedTemplates);
          this.logger.info(`✅ 自动生成嵌套模板: ${placeholder} (长度: ${value.length} 字符)`);
        } catch (error) {
          // 自动生成失败，抛出更友好的错误
          throw new Error(`无法生成嵌套模板 '${placeholder}': ${error instanceof Error ? error.message : error}`);
        }
      } else if (paramExists) {
        // 没有同名模板，使用参数值（允许空字符串 ''，例如 eat_action: ''）
        this.logger.debug(`📝 使用参数值: ${placeholder} = ${paramValue === '' ? '(空字符串)' : JSON.stringify(paramValue)}`);
        value = String(paramValue ?? '');
      } else {
        // 既没有同名模板，也没有提供参数
        throw new Error(`缺少必需参数: ${placeholder}`);
      }

      // 替换所有该占位符（避免替换 {{ 和 }} 包围的内容）
      const regex = new RegExp(`(?<!\\{)\\{${placeholder}\\}(?!\\})`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * 扩展嵌套模板引用（预处理）
   *
   * 为了性能优化，预先生成一些常用的嵌套模板
   */
  private expandNestedTemplates(params: Record<string, any>, visitedTemplates: Set<string>): Record<string, any> {
    // 直接返回参数，实际的嵌套模板生成在 formatWithNestedTemplates 中动态进行
    return { ...params };
  }

  /**
   * 列出所有模板
   */
  listTemplates(): Array<{ name: string; description: string }> {
    return Array.from(this.templates.values()).map(t => ({
      name: t.name,
      description: t.description,
    }));
  }
}

/**
 * 全局单例 prompt_manager
 * 对应 Python 的 prompt_manager = PromptManager()
 */
export const promptManager = new PromptManager();

/**
 * 创建提示词管理器的便捷函数
 * 对应 Python 的 create_prompt_manager()
 */
export function createPromptManager(logger?: Logger): PromptManager {
  return new PromptManager(logger);
}

/**
 * 快速生成提示词（无需注册模板）
 * 对应 Python 的 quick_generate()
 */
export function quickGenerate(templateStr: string, params: Record<string, any>): string {
  const template = new PromptTemplate('quick', templateStr);
  return template.format(params);
}
