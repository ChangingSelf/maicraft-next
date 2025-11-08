/**
 * 提示词解析工具（降级方案）
 *
 * ⚠️ 注意：这些解析函数现在主要用作降级方案
 * 新代码应该使用 StructuredOutputManager 进行结构化输出
 *
 * 这些函数保留用于：
 * 1. 当 LLM 不支持原生结构化输出时的降级解析
 * 2. 兼容性支持
 * 3. StructuredOutputManager 内部使用
 *
 * 参考原 maicraft 的 utils.py 中的解析函数
 */

import { getLogger } from '@/utils/Logger';

const logger = getLogger('PromptParser');

/**
 * 解析 JSON
 *
 * 对应 maicraft 的 parse_json
 */
export function parseJson(text: string): any | null {
  try {
    // TODO: 可以添加 json-repair 库来修复格式
    return JSON.parse(text);
  } catch (error) {
    logger.warn(`JSON 解析失败: ${text.substring(0, 100)}...`);
    return null;
  }
}

/**
 * 查找第一个 JSON 对象
 *
 * 对应 maicraft 的 find_first_json
 */
function findFirstJson(text: string): {
  jsonStr: string;
  start: number;
  end: number;
} | null {
  const stack: string[] = [];
  let start: number | null = null;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      if (stack.length === 0) {
        start = i;
      }
      stack.push('{');
    } else if (c === '}') {
      if (stack.length > 0) {
        stack.pop();
        if (stack.length === 0 && start !== null) {
          return {
            jsonStr: text.substring(start, i + 1),
            start,
            end: i + 1,
          };
        }
      }
    }
  }

  return null;
}

/**
 * 查找所有 JSON 对象
 *
 * 对应 maicraft 的 find_all_jsons
 */
function findAllJsons(text: string): Array<{
  jsonStr: string;
  start: number;
  end: number;
}> {
  const jsons: Array<{ jsonStr: string; start: number; end: number }> = [];
  const stack: string[] = [];
  let start: number | null = null;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      if (stack.length === 0) {
        start = i;
      }
      stack.push('{');
    } else if (c === '}') {
      if (stack.length > 0) {
        stack.pop();
        if (stack.length === 0 && start !== null) {
          jsons.push({
            jsonStr: text.substring(start, i + 1),
            start,
            end: i + 1,
          });
          start = null;
        }
      }
    }
    i++;
  }

  return jsons;
}

/**
 * 解析思考结果（单个动作）
 *
 * 对应 maicraft 的 parse_thinking
 *
 * @returns [success, thinking, jsonObj, jsonBefore]
 */
export function parseThinking(thinking: string): {
  success: boolean;
  thinking: string;
  jsonObj: any;
  jsonBefore: string;
} {
  const result = findFirstJson(thinking);

  let success = false;
  let jsonObj: any = null;
  let jsonBefore = '';

  if (result) {
    const { jsonStr, start } = result;

    // 解析 JSON
    jsonObj = parseJson(jsonStr);
    if (!jsonObj) {
      logger.error(`JSON 解析失败: ${jsonStr}`);
      return { success: false, thinking, jsonObj: {}, jsonBefore: thinking };
    }

    success = true;

    // 获取 JSON 前的内容
    if (start > 0) {
      jsonBefore = thinking.substring(0, start).trim();
    }
  } else {
    // 没有找到 JSON
    logger.warn('没有找到 JSON 对象');
    success = false;
    jsonBefore = thinking.trim();
  }

  // 移除 jsonBefore 中的 ```json 和 ```
  if (jsonBefore.includes('```json')) {
    jsonBefore = jsonBefore.replace(/```json/g, '');
  }
  if (jsonBefore.includes('```')) {
    jsonBefore = jsonBefore.replace(/```/g, '');
  }

  // 移除 jsonBefore 的所有换行符
  jsonBefore = jsonBefore.replace(/\n/g, ' ');

  // 检查 action_type
  const actionType = jsonObj?.action_type;
  if (!actionType) {
    logger.error(`思考结果中没有 action_type: ${thinking.substring(0, 100)}...`);
    return { success: false, thinking, jsonObj: jsonObj || {}, jsonBefore };
  }

  return { success, thinking, jsonObj, jsonBefore };
}

/**
 * 解析思考结果（多个动作）
 *
 * 对应 maicraft 的 parse_thinking_multiple
 *
 * @returns [success, thinking, jsonObjList, jsonBefore]
 */
export function parseThinkingMultiple(thinking: string): {
  success: boolean;
  thinking: string;
  jsonObjList: any[];
  jsonBefore: string;
} {
  const results = findAllJsons(thinking);

  const jsonObjList: any[] = [];
  let jsonBefore = '';
  let firstJsonStart = -1;

  if (results.length > 0) {
    firstJsonStart = results[0].start;

    // 解析所有 JSON
    for (const result of results) {
      const jsonObj = parseJson(result.jsonStr);
      if (jsonObj) {
        const actionType = jsonObj.action_type;
        if (!actionType) {
          logger.warn(`JSON 中没有 action_type: ${result.jsonStr.substring(0, 100)}...`);
          continue;
        }
        jsonObjList.push(jsonObj);
      } else {
        logger.warn(`JSON 解析失败: ${result.jsonStr.substring(0, 100)}...`);
      }
    }

    // 获取第一个 JSON 前的内容
    if (firstJsonStart > 0) {
      jsonBefore = thinking.substring(0, firstJsonStart).trim();
    }
  } else {
    // 没有找到 JSON
    logger.warn('没有找到任何 JSON 对象');
    jsonBefore = thinking.trim();
  }

  // 移除 jsonBefore 中的 ```json 和 ```
  if (jsonBefore.includes('```json')) {
    jsonBefore = jsonBefore.replace(/```json/g, '');
  }
  if (jsonBefore.includes('```')) {
    jsonBefore = jsonBefore.replace(/```/g, '');
  }

  // 移除 jsonBefore 的所有换行符
  jsonBefore = jsonBefore.replace(/\n/g, ' ');

  const success = jsonObjList.length > 0;

  if (!success) {
    logger.error(`没有解析到有效的动作: ${thinking.substring(0, 200)}...`);
  }

  return { success, thinking, jsonObjList, jsonBefore };
}
