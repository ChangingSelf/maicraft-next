/**
 * 经验总结提示词模板
 */

import { PromptTemplate, promptManager } from '../prompt_manager';

/**
 * 初始化经验总结模板
 */
export function initExperienceSummaryTemplate(): void {
  console.log('📝 注册经验总结模板...');

  promptManager.registerTemplate(
    new PromptTemplate(
      'experience_summary',
      `基于最近的决策历史和思维记录，请总结出有价值的经验教训。

## 最近决策记录
{{recent_decisions}}

## 最近思维记录
{{recent_thoughts}}

## 当前状态
- 当前目标：{{current_goal}}
- 当前任务：{{current_task}}

## 总结要求
请分析上述决策和思维记录，找出：
1. 成功的模式和策略
2. 失败的原因和教训
3. 可以改进的地方
4. 未来的行动建议

请用【经验】标签包含你的总结内容。`,
      '经验总结用户提示词模板',
      ['recent_decisions', 'recent_thoughts', 'current_goal', 'current_task'],
    ),
  );

  promptManager.registerTemplate(
    new PromptTemplate(
      'experience_summary_system',
      `你是 {{bot_name}} 的经验总结助手。

你的任务是分析AI的行为模式，从成功和失败中提取经验教训，帮助AI更好地完成任务。

## 分析原则
1. **客观分析**：基于数据而非主观判断
2. **模式识别**：找出重复出现的问题和解决方案
3. **实用建议**：提供可操作的改进建议
4. **分层总结**：区分战术层和战略层的经验

## 输出格式
请用【经验】标签包含你的总结内容，内容要：
- 简洁明了
- 具体可操作
- 包含置信度评估
- 突出关键教训

记住：经验是从实践中总结出来的智慧，不要创造不存在的经验。`,
      '经验总结系统提示词模板',
      ['bot_name'],
    ),
  );

  console.log('✅ 经验总结模板注册完成');
}
