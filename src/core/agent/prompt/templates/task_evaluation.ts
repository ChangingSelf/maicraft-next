/**
 * 任务评估模板
 *
 * 对应 maicraft 的任务评估模板
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册任务评估模板
 */
export function initTaskEvaluationTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'task_evaluation',
      `评估当前任务进度和执行效果：

【目标】
{goal}
当前任务: {current_task}

【当前状态】
{position}
物品栏: {inventory}

【最近决策】
{recent_decisions}

【最近思考】
{recent_thoughts}

请评估：
1. 当前任务的进展如何？是否按计划推进？
2. 遇到了什么问题或障碍？
3. 需要调整策略吗？如何调整？
4. 接下来应该关注什么？

【输出格式】
以简洁的文字输出你的评估和建议，不要使用JSON格式。
`,
      '任务评估',
      ['goal', 'current_task', 'position', 'inventory', 'recent_decisions', 'recent_thoughts'],
    ),
  );
}
