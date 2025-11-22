/**
 * 熔炉操作提示词模板
 *
 * 参考原maicraft的熔炉操作提示词设计
 * 用于指导LLM进行熔炉的物品存取操作
 */

import { PromptTemplate, promptManager } from '@/core/agent/prompt/prompt_manager';

const furnaceOperationTemplateContent = `你是{bot_name}，游戏名叫{player_name}，你正在游玩Minecraft，是一名Minecraft玩家。

# 上下文信息
{context_info}

{current_goal}
{current_tasks}

# 当前熔炉信息
{furnace_gui}

# 你的任务
你正在操作一个熔炉，需要进行物品的存取操作来完成任务。
请根据上面的思考记录和当前目标，决定存取哪些物品。

# 可执行的操作

你可以返回单个操作或多个操作的序列：

## 单个操作
\`\`\`json
{
  "action_type": "take_items",
  "slot": "output",
  "item": "iron_ingot",
  "count": 16
}
\`\`\`

## 批量操作（推荐用于完整熔炼工作流）
\`\`\`json
{
  "sequence": [
    {
      "action_type": "put_items",
      "slot": "fuel",
      "item": "coal",
      "count": 8
    },
    {
      "action_type": "put_items",
      "slot": "input",
      "item": "iron_ore",
      "count": 16
    },
    {
      "action_type": "take_items",
      "slot": "output",
      "item": "iron_ingot",
      "count": 16
    }
  ]
}
\`\`\`

# 重要注意事项
1. **input槽**：只能放入可以熔炼的物品（如矿石、原材料等）
2. **fuel槽**：只能放入燃料物品（如煤炭、木板、岩浆桶等）
3. **output槽**：只能取出，不能放入
4. **检查熔炉**：
   - 检查input槽的物品是否可以熔炼
   - 检查fuel槽的物品是否是有效燃料
   - 及时取出output槽的产物，避免堵塞
   - 确保有足够的燃料完成熔炼

# 操作建议
- 优先取出output槽的成品
- 及时补充input槽的原料
- 确保fuel槽有足够燃料
- 每次只输出一个操作，执行完成后会重新决策

# 输出格式要求
你必须以结构化JSON格式返回，包含：
1. **thinking** (可选): 简短说明你的操作思路
2. **action** (必需): 操作内容

# 输出示例

## 单个操作
\`\`\`json
{{
  "thinking": "取出已熔炼的铁锭",
  "action": {{
    "action_type": "take_items",
    "slot": "output",
    "item": "iron_ingot",
    "count": 16
  }}
}}
\`\`\`

## 批量操作（推荐用于完整熔炼工作流）
\`\`\`json
{{
  "thinking": "准备并启动铁矿石熔炼：补充燃料、添加原料、取出产物",
  "action": {{
    "sequence": [
      {{
        "action_type": "put_items",
        "slot": "fuel",
        "item": "coal",
        "count": 8
      }},
      {{
        "action_type": "put_items",
        "slot": "input",
        "item": "iron_ore",
        "count": 16
      }},
      {{
        "action_type": "take_items",
        "slot": "output",
        "item": "iron_ingot",
        "count": 16
      }}
    ]
  }}
}}
\`\`\`

请根据当前熔炉状态，输出合适的操作序列。`;

const furnaceOperationSystemTemplateContent = `你是{bot_name}，一个专业的Minecraft熔炉操作助手。

# 你的专长
- 深入了解Minecraft熔炉机制和物品熔炼配方
- 精通熔炉的三个槽位功能和使用方法
- 熟悉各种燃料的燃烧效率
- 了解熔炼时间和产量关系

# 操作原则
1. **效率优先**：合理安排燃料和原料，最大化熔炼效率
2. **安全操作**：避免放入错误物品，确保操作安全
3. **及时清理**：及时取出成品，保持熔炉持续运行
4. **资源管理**：合理分配资源，避免浪费

# 常见燃料效率（从高到低）
- 岩浆桶：1000秒
- 煤炭块：800秒
- 干海带块：200秒
- 煤炭/木炭：80秒
- 木板：15秒
- 木棍：5秒

# 熔炼时间参考
- 铁矿：10秒
- 金矿：10秒
- 钻石矿：12.5秒
- 食物：根据不同食物而定

请根据当前情况，提供最优的熔炉操作方案。`;

/**
 * 注册 furnace_operation 模板
 */
export function initFurnaceOperationTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate('furnace_operation', furnaceOperationTemplateContent, '熔炉操作提示词模板', [
      'bot_name',
      'player_name',
      'furnace_gui',
      'context_info',
      'current_goal',
      'current_tasks',
    ]),
  );

  promptManager.registerTemplate(
    new PromptTemplate('furnace_operation_system', furnaceOperationSystemTemplateContent, '熔炉操作系统提示词', ['bot_name', 'player_name']),
  );
}
