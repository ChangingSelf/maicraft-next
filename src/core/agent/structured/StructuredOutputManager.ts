/**
 * 结构化输出管理器
 *
 * 负责处理 LLM 的结构化输出，支持两种模式：
 * 1. JSON Schema 模式（OpenAI Structured Outputs）- 最可靠
 * 2. 降级模式（手动解析JSON）- 兼容性方案
 */

import { getLogger } from '@/utils/Logger';
import type { LLMManager } from '@/llm/LLMManager';
import { ACTION_RESPONSE_SCHEMA, CHEST_OPERATION_SCHEMA, FURNACE_OPERATION_SCHEMA, StructuredLLMResponse, StructuredAction } from './ActionSchema';

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
