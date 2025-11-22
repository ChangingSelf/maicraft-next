/**
 * 目标生成模板
 *
 * 用于在目标完成后，根据历史目标和环境信息自动生成新的目标
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

/**
 * 注册目标生成模板
 */
export function initGoalGenerationTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'goal_generation',
      `你是一个 Minecraft AI 助手，需要根据当前情况和历史经验为玩家生成下一个合适的游戏目标。

# 已完成的目标
{completed_goals}

# 当前状态
位置: {position}
生命值: {health}/20, 饥饿值: {food}/20
物品栏: {inventory}
当前时间: {time}

# 周边环境
{environment}

# 历史经验
{experiences}

# 目标生成原则
1. **连续性**：新目标应该与已完成的目标相关联，形成自然的游戏进度
2. **可行性**：目标应该在当前资源和环境下能够实现
3. **多样性**：避免重复相同类型的目标，提供不同游戏内容的体验
4. **平衡性**：综合考虑资源收集、建筑、探索、生存等不同方面
5. **渐进性**：目标难度应该循序渐进，避免突然大幅提升难度

# 目标类型优先级
根据当前进度建议目标类型：

1. 基础资源收集 → 合成工具 → 建造工作台 → 高级资源收集
2. 探索地形 → 寻找新资源 → 建立基地 → 扩展基地
3. 生存保障 → 食物获取 → 工具升级 → 装备制作
4. 自动化建设 → 农场建设 → 红石机制 → 复杂建筑

# 目标生成策略
- 如果刚刚完成资源收集（木材、石头等），建议合成相关工具或建造工作台
- 如果有工作台但缺少高级工具，建议制作镐子、斧头等工具
- 如果工具齐全但缺少食物，建议探索地形或建立农场
- 如果生存条件较好，建议探索新区域或建造更复杂的结构
- 定期建议建立永久基地，扩大生存空间

# 输出格式
请以 JSON 格式输出新目标：

\`\`\`json
{
  "goal": "目标描述（简洁明了，如：收集64个石头）",
  "reasoning": "生成这个目标的理由和预期收益",
  "difficulty": "easy|medium|hard",
  "estimated_time": "预估完成时间（分钟）",
  "priority": "low|medium|high",
  "category": "resource|crafting|exploration|building|survival"
}
\`\`\`

注意：
- goal 字段要具体可量化，便于后续生成计划
- reasoning 要说明为什么选择这个目标，以及它对游戏进度的贡献
- difficulty 基于当前资源和技能水平评估
- category 帮助分类和统计目标完成情况
`,
      '目标生成',
      ['completed_goals', 'position', 'health', 'food', 'inventory', 'time', 'environment', 'experiences'],
    ),
  );
}
