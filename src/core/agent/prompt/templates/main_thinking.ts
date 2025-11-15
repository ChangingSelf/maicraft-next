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
      `{role_description}

**行为准则**
1. 先总结之前的思考和执行的记录，对执行结果进行分析，上一次使用的动作是否达到了目的
2. 你不需要搭建方块来前往某个地方，直接使用move动作，会自动搭建并移动
3. 专注于当前任务，通过执行动作来完成任务目标。任务完成会被自动检测
4. set_location可以帮助你记录、管理、查看重要位置的信息，用于后续的移动，采矿，探索等。如果不需要使用某个地标，必须删除地标
5. 查看"当前目标和任务列表"来了解你需要做什么，当前任务的进度如何
6. 如果一个动作反复无法完成，可能是参数错误或缺少必要条件，请结合周围环境尝试别的方案，不要重复尝试同一个动作

{available_actions}

{eat_action}

{kill_mob_action}

---

{basic_info}

{failed_hint}

**上一阶段的反思**
{judge_guidance}

**思考/执行的记录**
{thinking_list}

**输出格式要求**
你必须以结构化JSON格式返回你的响应，包含以下字段：

1. **thinking** (可选): 简短的思考过程，说明你的决策理由
2. **actions** (必需): 动作列表，至少包含一个动作

每个动作必须包含：
- **intention**: 动作意图，用一句话说明目的
- **action_type**: 动作类型
- 其他必需参数根据动作类型而定

**输出示例**
\`\`\`json
{{
  "thinking": "当前需要寻找资源并建造工作台，首先移动到附近的森林区域",
  "actions": [
    {{
      "intention": "前往森林区域收集木材",
      "action_type": "move",
      "x": 100,
      "y": 70,
      "z": 200
    }},
    {{
      "intention": "挖掘橡木获取木材资源",
      "action_type": "mine_block",
      "name": "oak_log",
      "count": 10
    }}
  ]
}}
\`\`\`

**重要**
- 必须严格按照JSON Schema格式输出
- thinking字段简洁明了，不要分点
- actions数组中的每个动作都必须包含intention字段
- 可以输出多个动作，它们会按顺序执行
`,
      '任务-动作选择',
      [
        'role_description',
        'basic_info',
        'available_actions',
        'eat_action',
        'kill_mob_action',
        'failed_hint',
        'thinking_list',
        'nearby_block_info',
        'position',
        'chat_str',
        'judge_guidance',
        'goal',
      ],
    ),
  );
}
