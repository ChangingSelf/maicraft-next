/**
 * 经验总结提示词模板
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 初始化经验总结模板
 */
export function initExperienceSummaryTemplate(): void {
  console.log('📝 注册经验总结模板...');

  promptManager.registerTemplate(
    new PromptTemplate(
      'experience_summary',
      `基于最近的决策历史和思维记录，请总结出多条简短实用的经验教训。

## 最近决策记录
{{recent_decisions}}

## 最近思维记录
{{recent_thoughts}}

## 当前状态
- 当前目标：{{current_goal}}
- 当前任务：{{current_task}}

## 总结要求
请分析上述决策和思维记录，提取多条（建议3-10条）简短的经验教训：

### 重点关注
1. **物品名称错误**：如果多次尝试某个操作因为物品名称错误失败，最后发现正确名称，记录下来
   - 例如："铁镐的游戏名称是iron_pickaxe而不是iron_pick"
   
2. **合成配方**：记录成功合成物品所需的材料和数量
   - 例如："熔炉需要8个圆石（cobblestone）合成"
   
3. **操作技巧**：记录成功完成任务的关键步骤
   - 例如："挖矿前需要先装备合适的工具"
   
4. **错误模式**：记录反复出现的错误及解决方法
   - 例如："使用箱子前必须先移动到箱子附近"

5. **环境规律**：记录游戏世界的规律和限制
   - 例如："钻石矿只在Y坐标16以下生成"

### 格式要求
- 每条经验用一句简短的话描述（不超过100字）
- 提供经验的来源场景说明
- 评估每条经验的置信度（0.0-1.0）
- 越具体、越可操作的经验越有价值

### 注意事项
- 只记录从实际决策中观察到的经验，不要臆造
- 优先记录可以避免未来错误的经验
- 关注物品的游戏内部名称（如minecraft:iron_pickaxe）
- 如果没有明显的经验可总结，可以返回较少的条目`,
      '经验总结用户提示词模板',
      ['recent_decisions', 'recent_thoughts', 'current_goal', 'current_task'],
    ),
  );

  promptManager.registerTemplate(
    new PromptTemplate(
      'experience_summary_system',
      `你是 {{bot_name}} 的经验总结助手。

你的核心任务：分析AI最近的决策记录，提取多条简短实用的经验教训。

## 核心原则
1. **数据驱动**：只基于提供的决策记录总结，不臆造经验
2. **简短精炼**：每条经验不超过100字，直击要点
3. **多条总结**：一次性总结3-10条经验（视情况而定）
4. **实用优先**：优先记录能避免未来错误的关键信息

## 高价值经验示例
✅ "钻石镐的游戏名称是diamond_pickaxe"
✅ "工作台需要4块木板（planks）合成"
✅ "石制工具需要圆石（cobblestone）而不是石头（stone）"
✅ "夜晚时应该避免外出，优先在室内工作"
✅ "熔炼铁矿石需要同时放入燃料和矿石"

## 低价值经验（避免）
❌ "需要仔细规划" （太空泛）
❌ "应该更好地管理资源" （不具体）
❌ "失败是成功之母" （没有实际信息）

## 输出格式
你必须返回一个纯JSON对象，不要包含任何其他文本、解释或markdown格式。JSON格式如下：

\`\`\`json
{
  "analysis": "简短的总体分析（可选）",
  "lessons": [
    {
      "lesson": "经验内容，用一句话简短描述",
      "context": "经验的来源或适用场景",
      "confidence": 0.0到1.0之间的数字
    }
  ]
}
\`\`\`

重要：只返回JSON对象，不要有任何其他内容！

记住：你的目标是帮助AI快速学习和避免重复错误！`,
      '经验总结系统提示词模板',
      ['bot_name'],
    ),
  );

  console.log('✅ 经验总结模板注册完成');
}
