/**
 * 主思考模板
 *
 * 对应 maicraft 的 main_thinking 模板
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册 main_thinking 模板
 */
export function initMainThinkingTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'main_thinking',
      `**当前游戏状态**

{basic_info}

{failed_hint}

**上一阶段的反思**
{judge_guidance}

**思考/执行的记录**
{thinking_list}

请基于以上信息分析当前情况并制定下一步行动计划。`,
      '任务-动作选择',
      ['basic_info', 'failed_hint', 'judge_guidance', 'thinking_list'],
    ),
  );
}
