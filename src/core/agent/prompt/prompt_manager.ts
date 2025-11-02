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
   * 根据模板名称和参数生成提示词
   *
   * 对应 Python 的 generate_prompt(template_name, **kwargs)
   * 这是核心方法！
   */
  generatePrompt(templateName: string, params: Record<string, any>): string {
    const template = this.getTemplate(templateName);

    if (!template) {
      throw new Error(`模板 '${templateName}' 不存在`);
    }

    // 验证参数
    const missingParams = template.validateParameters(params);
    if (missingParams.length > 0) {
      throw new Error(`缺少必需参数: ${missingParams.join(', ')}`);
    }

    // 格式化模板
    try {
      const result = template.format(params);
      this.logger.debug(`成功生成提示词，模板: ${templateName}`);
      return result;
    } catch (error) {
      this.logger.error(`生成提示词失败`, undefined, error as Error);
      throw error;
    }
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
