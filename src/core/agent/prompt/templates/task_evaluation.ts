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
      `评估当前任务的进度和执行效果，并提供结构化的反馈。

【目标】
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

请基于以上信息，全面评估任务的执行情况：

1. **任务状态评估**：
   - on_track: 任务进展顺利，按计划推进
   - struggling: 遇到一些困难，但仍可继续
   - blocked: 任务完全阻塞，无法继续
   - needs_adjustment: 需要调整策略或计划

2. **进度评估**：简短描述任务完成到什么程度，是否接近目标

3. **问题识别**：列出当前遇到的具体问题（如缺少工具、找不到资源、物品栏已满等）

4. **改进建议**：针对问题提出具体可行的建议（如"先合成铁镐"、"向北探索寻找石山"）

5. **是否需要重新规划**：
   - 如果当前计划明显不可行，或存在严重设计缺陷，设为 true
   - 如果只是遇到小困难，可以继续执行，设为 false

6. **是否跳过任务**：
   - 如果任务不可能完成，或发现不再必要，设为 true
   - 否则设为 false

7. **置信度**：对这次评估的置信度（0.0-1.0）

【输出格式】
必须返回一个JSON对象，包含以下字段：
- task_status: "on_track" | "struggling" | "blocked" | "needs_adjustment"
- progress_assessment: string (进度评估描述)
- issues: string[] (问题列表，可以为空数组)
- suggestions: string[] (建议列表，可以为空数组)
- should_replan: boolean (是否需要重新规划)
- should_skip_task: boolean (是否跳过当前任务)
- estimated_completion_time?: number (预计完成时间，分钟，可选)
- confidence: number (置信度 0.0-1.0)
`,
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
