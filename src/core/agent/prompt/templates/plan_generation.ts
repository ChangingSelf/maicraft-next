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
      `你是一个 Minecraft 任务规划专家。请根据目标生成一个详细的执行计划。

【目标】
{goal}

【当前状态】
位置: {position}
生命值: {health}/20, 饥饿值: {food}/20
物品栏: {inventory}

【周边环境】
{environment}

【已有经验】
{experiences}

【可用追踪器类型】
1. inventory - 物品收集任务
   - 参数: itemName (物品名称), targetCount (目标数量), exact (是否精确，可选)
   - 示例: { "type": "inventory", "itemName": "stone", "targetCount": 64, "exact": false }

2. craft - 合成任务
   - 参数: itemName (目标物品名称), targetCount (目标数量)
   - 示例: { "type": "craft", "itemName": "wooden_pickaxe", "targetCount": 1 }

3. location - 到达位置任务
   - 参数: targetX, targetY, targetZ (目标坐标), radius (到达半径，可选)
   - 示例: { "type": "location", "targetX": 100, "targetY": 64, "targetZ": 200, "radius": 2 }

4. composite - 组合任务（多个追踪器的组合）
   - 参数: trackers (追踪器数组), logic (组合逻辑: "and"或"or")
   - 示例: { "type": "composite", "logic": "and", "trackers": [...] }

【规划要求】
1. 计划标题要简洁明确
2. 计划描述要包含总体思路和预期结果
3. 任务要具体可执行，有明确的完成条件
4. 任务之间要有合理的依赖关系（通过 dependencies 字段指定）
5. 每个任务必须配置合适的追踪器（tracker）用于自动检测完成状态
6. 任务顺序要符合逻辑（先收集资源，再合成物品，最后使用）

【输出格式】
请以 JSON 格式输出计划，格式如下：

\`\`\`json
{
  "title": "计划标题",
  "description": "计划的总体描述",
  "tasks": [
    {
      "title": "任务1标题",
      "description": "任务1详细描述",
      "tracker": {
        "type": "inventory",
        "itemName": "oak_log",
        "targetCount": 4,
        "exact": false
      },
      "dependencies": []
    },
    {
      "title": "任务2标题",
      "description": "任务2详细描述",
      "tracker": {
        "type": "craft",
        "itemName": "crafting_table",
        "targetCount": 1
      },
      "dependencies": ["0"]
    }
  ]
}
\`\`\`

注意：
- dependencies 数组中填写依赖任务的索引（从0开始）
- tracker 必须是上述可用类型之一
- **字段名必须精确匹配**：inventory 用 itemName/targetCount，location 用 targetX/targetY/targetZ
- 所有数值类型的参数（如 targetCount, targetX 等）必须是数字，不能是字符串
- itemName 必须使用 Minecraft 内部名称（如 oak_log, stone, iron_ore）
`,
      '规划生成',
      ['goal', 'position', 'health', 'food', 'inventory', 'environment', 'experiences'],
    ),
  );
}
