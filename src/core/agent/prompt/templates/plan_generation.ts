/**
 * 规划生成模板
 *
 * 用于根据目标生成具体的执行计划
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册规划生成模板
 */
export function initPlanGenerationTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'plan_generation',
      `【目标】
{goal}

【当前状态】
位置: {position}
生命值: {health}/20, 饥饿值: {food}/20
物品栏: {inventory}

【周边环境】
{environment}

【已有经验】
{experiences}

【该目标的历史计划】
{plan_history}

请基于以上信息生成详细的执行计划。`,
      '规划生成',
      ['goal', 'position', 'health', 'food', 'inventory', 'environment', 'experiences', 'plan_history'],
    ),
  );
}
