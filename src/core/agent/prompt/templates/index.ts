/**
 * 模板统一导出和初始化
 */

export { initBasicInfoTemplate } from './basic_info';
export { initMainThinkingTemplate } from './main_thinking';
export { initChatResponseTemplate } from './chat_response';
export { initChatInitiateTemplate } from './chat_initiate';
export { initTaskEvaluationTemplate } from './task_evaluation';
export { initSystemPromptTemplates } from './system_prompts';
export { initFurnaceOperationTemplate } from './furnace_operation';
export { initChestOperationTemplate } from './chest_operation';

/**
 * 初始化所有核心模板
 *
 * 对应 maicraft 的 template.py 中的 init_templates()
 */
import { initBasicInfoTemplate } from './basic_info';
import { initMainThinkingTemplate } from './main_thinking';
import { initChatResponseTemplate } from './chat_response';
import { initChatInitiateTemplate } from './chat_initiate';
import { initTaskEvaluationTemplate } from './task_evaluation';
import { initSystemPromptTemplates } from './system_prompts';
import { initFurnaceOperationTemplate } from './furnace_operation';
import { initChestOperationTemplate } from './chest_operation';

export function initAllCoreTemplates(): void {
  initBasicInfoTemplate();
  initMainThinkingTemplate();
  initChatResponseTemplate();
  initChatInitiateTemplate();
  initTaskEvaluationTemplate();
  initSystemPromptTemplates();
  initFurnaceOperationTemplate();
  initChestOperationTemplate();
}
