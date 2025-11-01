/**
 * 模板统一导出和初始化
 */

export { initBasicInfoTemplate } from './basic_info';
export { initMainThinkingTemplate } from './main_thinking';
export { initChatResponseTemplate } from './chat_response';
export { initChatInitiateTemplate } from './chat_initiate';
export { initTaskEvaluationTemplate } from './task_evaluation';

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

export function initAllCoreTemplates(): void {
  initBasicInfoTemplate();
  initMainThinkingTemplate();
  initChatResponseTemplate();
  initChatInitiateTemplate();
  initTaskEvaluationTemplate();
}
