/**
 * 结构化输出管理器
 *
 * 负责处理 LLM 的结构化输出，支持两种模式：
 * 1. JSON Schema 模式（OpenAI Structured Outputs）- 最可靠
 * 2. 降级模式（手动解析JSON）- 兼容性方案
 */

import { getLogger } from '@/utils/Logger';
import type { LLMManager } from '@/llm/LLMManager';
import {
  ACTION_RESPONSE_SCHEMA,
  CHEST_OPERATION_SCHEMA,
  FURNACE_OPERATION_SCHEMA,
  StructuredLLMResponse,
  StructuredAction,
  ExperienceSummaryResponse,
} from './ActionSchema';

const logger = getLogger('StructuredOutputManager');

export interface StructuredOutputOptions {
  useStructuredOutput?: boolean; // 是否使用原生结构化输出
  maxRetries?: number; // 解析失败时的重试次数
}

/**
 * 结构化输出管理器类
 */
export class StructuredOutputManager {
  private llmManager: LLMManager;
  private useStructuredOutput: boolean;

  /**
   * 测试JSON解析功能（用于调试）
   */
  static testJsonParsing(jsonString: string): ExperienceSummaryResponse | null {
    try {
      const parsed = JSON.parse(jsonString);
      const manager = new StructuredOutputManager(null as any, { useStructuredOutput: true });
      return manager.validateExperienceResponse(parsed);
    } catch (error) {
      logger.error('测试JSON解析失败', undefined, error as Error);
      return null;
    }
  }

  constructor(llmManager: LLMManager, options: StructuredOutputOptions = {}) {
    this.llmManager = llmManager;
    // 检查 LLM 提供商是否支持结构化输出
    // 默认启用，但可以通过选项禁用
    this.useStructuredOutput = options.useStructuredOutput ?? true;
  }

  /**
   * 请求主模式动作决策（结构化输出）
   */
  async requestMainActions(prompt: string, systemPrompt?: string): Promise<StructuredLLMResponse | null> {
    try {
      if (this.useStructuredOutput) {
        // 使用原生结构化输出（OpenAI JSON Schema）
        return await this.requestWithStructuredOutput(prompt, systemPrompt, ACTION_RESPONSE_SCHEMA);
      } else {
        // 降级到手动解析
        return await this.requestWithManualParsing(prompt, systemPrompt);
      }
    } catch (error) {
      logger.error('请求主模式动作失败', undefined, error as Error);
      return null;
    }
  }

  /**
   * 请求箱子操作（结构化输出）
   */
  async requestChestOperations(prompt: string, systemPrompt?: string): Promise<StructuredLLMResponse | null> {
    try {
      if (this.useStructuredOutput) {
        return await this.requestWithStructuredOutput(prompt, systemPrompt, CHEST_OPERATION_SCHEMA);
      } else {
        return await this.requestWithManualParsing(prompt, systemPrompt);
      }
    } catch (error) {
      logger.error('请求箱子操作失败', undefined, error as Error);
      return null;
    }
  }

  /**
   * 请求熔炉操作（结构化输出）
   */
  async requestFurnaceOperations(prompt: string, systemPrompt?: string): Promise<StructuredLLMResponse | null> {
    try {
      if (this.useStructuredOutput) {
        return await this.requestWithStructuredOutput(prompt, systemPrompt, FURNACE_OPERATION_SCHEMA);
      } else {
        return await this.requestWithManualParsing(prompt, systemPrompt);
      }
    } catch (error) {
      logger.error('请求熔炉操作失败', undefined, error as Error);
      return null;
    }
  }

  /**
   * 请求经验总结（结构化输出）
   */
  async requestExperienceSummary(prompt: string, systemPrompt?: string): Promise<ExperienceSummaryResponse | null> {
    try {
      logger.debug('开始请求经验总结', {
        useStructuredOutput: this.useStructuredOutput,
        promptLength: prompt.length,
        systemPromptLength: systemPrompt?.length || 0,
      });

      if (this.useStructuredOutput) {
        return await this.requestExperienceWithStructuredOutput(prompt, systemPrompt);
      } else {
        return await this.requestExperienceWithManualParsing(prompt, systemPrompt);
      }
    } catch (error) {
      logger.error('请求经验总结失败', undefined, error as Error);
      return null;
    }
  }

  /**
   * 使用结构化输出请求经验总结
   */
  private async requestExperienceWithStructuredOutput(prompt: string, systemPrompt: string | undefined): Promise<ExperienceSummaryResponse | null> {
    try {
      const fullSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\n你必须返回一个有效的JSON对象，包含analysis（可选）和lessons（必需）字段。`
        : '你必须返回一个有效的JSON对象，包含analysis（可选）和lessons（必需）字段。';

      logger.debug('调用LLM进行结构化经验总结', {
        fullSystemPromptLength: fullSystemPrompt.length,
        promptPreview: prompt.substring(0, 100) + '...',
      });

      const response = await this.llmManager.chatCompletion(prompt, fullSystemPrompt, {
        response_format: {
          type: 'json_object',
        },
      });

      if (!response.success || !response.content) {
        logger.error('经验总结LLM调用失败', { error: response.error });
        return null;
      }

      logger.debug('LLM返回内容预览', {
        contentLength: response.content.length,
        contentPreview: response.content.substring(0, 200),
      });

      try {
        const parsed = JSON.parse(response.content);
        logger.debug('JSON解析成功，开始验证响应格式');
        const validated = this.validateExperienceResponse(parsed);
        if (validated) {
          logger.debug('经验总结响应验证通过', { lessonsCount: validated.lessons.length });
        } else {
          logger.warn('经验总结响应验证失败');
        }
        return validated;
      } catch (parseError) {
        logger.error('经验总结JSON解析失败', {
          error: parseError.message,
          contentPreview: response.content.substring(0, 200),
        });
        logger.debug('尝试手动提取经验总结响应');
        return await this.extractExperienceResponse(response.content);
      }
    } catch (error) {
      logger.error('结构化经验总结请求失败', undefined, error as Error);
      logger.debug('降级到手动解析模式');
      return await this.requestExperienceWithManualParsing(prompt, systemPrompt);
    }
  }

  /**
   * 手动解析经验总结
   */
  private async requestExperienceWithManualParsing(prompt: string, systemPrompt: string | undefined): Promise<ExperienceSummaryResponse | null> {
    try {
      const manualPrompt = `${prompt}\n\n请返回一个JSON对象，格式如下：
{
  "analysis": "简短的总体分析（可选）",
  "lessons": [
    {
      "lesson": "经验内容，用一句话简短描述",
      "context": "经验的来源或适用场景",
      "confidence": 0.0到1.0之间的数字
    }
  ]
}

只返回JSON对象，不要有任何其他内容！`;

      logger.debug('使用手动解析模式调用LLM', {
        manualPromptLength: manualPrompt.length,
        systemPromptLength: systemPrompt?.length || 0,
      });

      const response = await this.llmManager.chatCompletion(manualPrompt, systemPrompt);

      if (!response.success || !response.content) {
        logger.error('经验总结手动解析LLM调用失败', { error: response.error });
        return null;
      }

      logger.debug('手动解析模式LLM返回内容预览', {
        contentLength: response.content.length,
        contentPreview: response.content.substring(0, 200),
      });

      const parsed = this.extractExperienceResponse(response.content);

      if (!parsed) {
        logger.warn('无法从响应中提取经验总结', { content: response.content.substring(0, 200) });
        return null;
      }

      const validated = this.validateExperienceResponse(parsed);
      if (validated) {
        logger.debug('手动解析模式验证通过', { lessonsCount: validated.lessons.length });
      } else {
        logger.warn('手动解析模式验证失败');
      }

      return validated;
    } catch (error) {
      logger.error('手动解析经验总结失败', undefined, error as Error);
      return null;
    }
  }

  /**
   * 从文本中提取经验总结响应
   */
  private extractExperienceResponse(text: string): ExperienceSummaryResponse | null {
    logger.debug('开始手动提取经验总结响应', { textLength: text.length });

    // 首先尝试直接解析整个文本
    try {
      const parsed = JSON.parse(text);
      if (this.isValidExperienceResponse(parsed)) {
        logger.debug('直接解析整个文本成功');
        return parsed;
      } else {
        logger.debug('直接解析的JSON不满足经验总结格式要求');
      }
    } catch (error) {
      logger.debug('直接解析整个文本失败', { error: error.message });
    }

    // 尝试找到被 ```json 包裹的内容
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (this.isValidExperienceResponse(parsed)) {
          logger.debug('解析```json代码块成功');
          return parsed;
        } else {
          logger.debug('```json代码块中的JSON不满足经验总结格式要求');
        }
      } catch (error) {
        logger.debug('解析```json代码块失败', { error: error.message });
      }
    } else {
      logger.debug('未找到```json代码块');
    }

    // 使用栈方法查找第一个完整的JSON对象
    const jsonObj = this.findFirstCompleteJson(text);
    if (jsonObj) {
      try {
        const parsed = JSON.parse(jsonObj);
        if (this.isValidExperienceResponse(parsed)) {
          logger.debug('使用栈方法找到并解析JSON成功');
          return parsed;
        } else {
          logger.debug('栈方法找到的JSON不满足经验总结格式要求');
        }
      } catch (error) {
        logger.debug('栈方法找到的JSON解析失败', { error: error.message, jsonObj: jsonObj.substring(0, 100) });
      }
    } else {
      logger.debug('栈方法未找到完整的JSON对象');
    }

    logger.warn('所有手动解析方法都失败了');
    return null;
  }

  /**
   * 检查是否是有效的经验总结响应
   */
  private isValidExperienceResponse(obj: any): boolean {
    return obj && typeof obj === 'object' && Array.isArray(obj.lessons) && obj.lessons.length > 0;
  }

  /**
   * 验证经验总结响应格式
   */
  private validateExperienceResponse(response: any): ExperienceSummaryResponse | null {
    if (!response || typeof response !== 'object') {
      logger.warn('经验总结响应不是对象');
      return null;
    }

    if (!Array.isArray(response.lessons)) {
      logger.warn('经验总结响应缺少lessons数组');
      return null;
    }

    if (response.lessons.length === 0) {
      logger.warn('经验总结lessons数组为空');
      return null;
    }

    // 验证每条经验
    for (const lesson of response.lessons) {
      if (!lesson.lesson || typeof lesson.lesson !== 'string') {
        logger.warn('经验缺少lesson字段或格式不正确', { lesson });
        return null;
      }
      if (!lesson.context || typeof lesson.context !== 'string') {
        logger.warn('经验缺少context字段或格式不正确', { lesson });
        return null;
      }
      if (typeof lesson.confidence !== 'number' || lesson.confidence < 0 || lesson.confidence > 1) {
        logger.warn('经验的confidence字段无效', { lesson });
        return null;
      }
    }

    return response as ExperienceSummaryResponse;
  }

  /**
   * 使用原生结构化输出（JSON对象格式）
   */
  private async requestWithStructuredOutput(prompt: string, systemPrompt: string | undefined, schema: any): Promise<StructuredLLMResponse | null> {
    try {
      // 构建完整的系统提示词
      const fullSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\n你必须返回一个有效的JSON对象，包含thinking（可选）和actions（必需）字段。`
        : '你必须返回一个有效的JSON对象，包含thinking（可选）和actions（必需）字段。';

      // 尝试使用 json_object 格式（OpenAI标准格式）
      const response = await this.llmManager.chatCompletion(prompt, fullSystemPrompt, {
        response_format: {
          type: 'json_object',
        },
      });

      if (!response.success || !response.content) {
        logger.error('LLM 调用失败', { error: response.error });
        return null;
      }

      // 解析 JSON
      try {
        const parsed = JSON.parse(response.content);
        logger.debug('成功解析结构化输出', { contentLength: response.content.length });
        return this.validateResponse(parsed);
      } catch (parseError) {
        logger.error('JSON 解析失败，内容可能不是纯JSON格式', {
          error: parseError.message,
          contentPreview: response.content.substring(0, 200),
        });

        // 如果是纯JSON失败，尝试降级处理
        logger.info('尝试降级到手动解析模式');
        return await this.extractStructuredResponse(response.content);
      }
    } catch (error) {
      logger.error('结构化输出请求失败，降级到手动解析', undefined, error as Error);

      // 如果结构化输出失败，尝试手动解析
      try {
        return await this.requestWithManualParsing(prompt, systemPrompt);
      } catch (fallbackError) {
        logger.error('手动解析也失败', undefined, fallbackError as Error);
        return null;
      }
    }
  }

  /**
   * 降级方案：手动解析JSON
   * 从 LLM 响应中提取 JSON 对象
   */
  private async requestWithManualParsing(prompt: string, systemPrompt: string | undefined): Promise<StructuredLLMResponse | null> {
    try {
      const fullPrompt = `${prompt}\n\n请以JSON格式返回你的响应。`;

      const response = await this.llmManager.chatCompletion(fullPrompt, systemPrompt);

      if (!response.success || !response.content) {
        logger.error('LLM 调用失败', { error: response.error });
        return null;
      }

      // 使用栈解析提取所有JSON对象
      const parsed = this.extractStructuredResponse(response.content);

      if (!parsed) {
        logger.warn('无法从响应中提取有效的结构化数据', { content: response.content.substring(0, 200) });
        return null;
      }

      return this.validateResponse(parsed);
    } catch (error) {
      logger.error('手动解析失败', undefined, error as Error);
      return null;
    }
  }

  /**
   * 从文本中提取结构化响应
   * 尝试找到完整的JSON对象
   */
  private extractStructuredResponse(text: string): StructuredLLMResponse | null {
    // 首先尝试直接解析整个文本
    try {
      const parsed = JSON.parse(text);
      if (this.isValidStructuredResponse(parsed)) {
        return parsed;
      }
    } catch {
      // 继续尝试其他方法
    }

    // 尝试找到被 ```json 包裹的内容
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (this.isValidStructuredResponse(parsed)) {
          return parsed;
        }
      } catch {
        // 继续尝试
      }
    }

    // 使用栈方法查找第一个完整的JSON对象
    const jsonObj = this.findFirstCompleteJson(text);
    if (jsonObj) {
      try {
        const parsed = JSON.parse(jsonObj);
        if (this.isValidStructuredResponse(parsed)) {
          return parsed;
        }
      } catch {
        // 最后的尝试也失败了
      }
    }

    // 降级：尝试提取thinking和actions数组
    return this.extractThinkingAndActions(text);
  }

  /**
   * 使用栈查找第一个完整的JSON对象
   */
  private findFirstCompleteJson(text: string): string | null {
    const stack: string[] = [];
    let start: number | null = null;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '{') {
        if (stack.length === 0) {
          start = i;
        }
        stack.push('{');
      } else if (char === '}') {
        if (stack.length > 0) {
          stack.pop();
          if (stack.length === 0 && start !== null) {
            return text.substring(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * 降级方案：从文本中提取thinking和多个action JSON
   */
  private extractThinkingAndActions(text: string): StructuredLLMResponse | null {
    const actions: StructuredAction[] = [];

    // 提取thinking（如果有）
    let thinking: string | undefined;
    const thinkingMatch = text.match(/(?:思考|thinking)[：:]\s*(.+?)(?:\n|$)/i);
    if (thinkingMatch) {
      thinking = thinkingMatch[1].trim();
    }

    // 查找所有JSON对象
    const allJsons = this.findAllJsonObjects(text);

    for (const jsonStr of allJsons) {
      try {
        const obj = JSON.parse(jsonStr);
        if (obj.action_type) {
          actions.push(obj);
        }
      } catch {
        // 跳过无法解析的JSON
        logger.debug('跳过无效JSON', { json: jsonStr.substring(0, 100) });
      }
    }

    if (actions.length === 0) {
      return null;
    }

    return { thinking, actions };
  }

  /**
   * 查找所有JSON对象
   */
  private findAllJsonObjects(text: string): string[] {
    const jsons: string[] = [];
    const stack: string[] = [];
    let start: number | null = null;
    let i = 0;

    while (i < text.length) {
      const char = text[i];

      if (char === '{') {
        if (stack.length === 0) {
          start = i;
        }
        stack.push('{');
      } else if (char === '}') {
        if (stack.length > 0) {
          stack.pop();
          if (stack.length === 0 && start !== null) {
            jsons.push(text.substring(start, i + 1));
            start = null;
          }
        }
      }

      i++;
    }

    return jsons;
  }

  /**
   * 检查是否是有效的结构化响应
   */
  private isValidStructuredResponse(obj: any): boolean {
    return obj && typeof obj === 'object' && Array.isArray(obj.actions) && obj.actions.length > 0;
  }

  /**
   * 验证响应格式
   */
  private validateResponse(response: any): StructuredLLMResponse | null {
    if (!response || typeof response !== 'object') {
      logger.warn('响应不是对象');
      return null;
    }

    if (!Array.isArray(response.actions)) {
      logger.warn('响应缺少actions数组');
      return null;
    }

    if (response.actions.length === 0) {
      logger.warn('actions数组为空');
      return null;
    }

    // 验证每个动作
    for (const action of response.actions) {
      if (!action.action_type) {
        logger.warn('动作缺少action_type字段', { action });
        return null;
      }
      // intention 字段现在是可选的，但如果提供了更好
      if (!action.intention) {
        logger.debug('动作缺少intention字段', { action_type: action.action_type });
      }
    }

    return response as StructuredLLMResponse;
  }
}
