/**
 * 任务评估模板
 *
 * 使用结构化输出，返回可操作的评估结果
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册任务评估模板
 */
export function initTaskEvaluationTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'task_evaluation',
      `【目标】
{goal}

【当前任务】
{current_task}
{task_description}

【任务计划】
{to_do_list}

【当前状态】
{position}
物品栏: {inventory}
状态: {health}

【周围环境】
{nearby_block_info}

【周围实体】
{nearby_entities_info}

【已知容器】
{container_cache_info}

【聊天记录】
{chat_str}

【最近决策】
{recent_decisions}

【失败提示】
{failed_hint}

【任务历史统计】
{task_stats}

请基于以上信息评估当前任务的执行情况。`,
      '任务评估',
      [
        'goal',
        'current_task',
        'task_description',
        'to_do_list',
        'position',
        'inventory',
        'health',
        'nearby_block_info',
        'nearby_entities_info',
        'container_cache_info',
        'chat_str',
        'recent_decisions',
        'failed_hint',
        'task_stats',
      ],
    ),
  );
}
