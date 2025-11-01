/**
 * Prompt Manager 模块导出
 * 
 * 对应 maicraft 的 prompt_manager/__init__.py
 */

// 核心类和单例
export { PromptTemplate, PromptManager, promptManager, createPromptManager, quickGenerate } from './prompt_manager';

// 解析工具（对应 maicraft 的 utils.py 中的解析函数）
export { parseThinking, parseThinkingMultiple, parseJson } from './parser';

// 导入所有模板初始化函数
import { initAllCoreTemplates } from './templates';

/**
 * 初始化所有提示词模板
 * 
 * 对应 maicraft 的 init_templates()
 */
export function initAllTemplates(): void {
  initAllCoreTemplates();
  // TODO: 添加其他模板初始化
  // initTemplatesTask();
  // initTemplatesChestGui();
  // initTemplatesFurnaceGui();
  // initTemplatesHealth();
}
