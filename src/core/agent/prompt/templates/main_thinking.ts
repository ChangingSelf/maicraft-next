/**
 * 主思考模板
 *
 * 对应 maicraft 的 main_thinking 模板
 */

import { PromptTemplate, promptManager } from '../prompt_manager';

/**
 * 注册 main_thinking 模板
 */
export function initMainThinkingTemplate(): void {
  promptManager.registerTemplate(
    new PromptTemplate(
      'main_thinking',
      `{basic_info}

{available_actions}

{eat_action}

{kill_mob_action}

**进入task_edit模式**
对任务列表进行修改，包括：
1. 更新当前任务的进展
2. 如果当前任务无法完成，需要前置任务，创建新任务
3. 选择其他任务
如果当前没有正在进行的任务，最好选择一个简单合适的任务
\`\`\`json
{{
    "action_type":"edit_task_list",
}}
\`\`\`

如果目标已经完成，目标条件已经达成，直接完成目标
总目标：{goal}
\`\`\`json
{{
    "action_type":"complete_goal",
}}
\`\`\`

{failed_hint}

你必须以下格式进行进一步思考
**分析动作**
1.分析上次执行的动作是否成功，是否达到了目的
2.如果动作失败，分析失败原因，并尝试使用别的方案
3.如果一个动作反复无法完成，可能是参数错误或缺少必要条件，请结合周围环境尝试别的方案，不要重复尝试同一个动作

**行为准则**
1.先总结之前的思考和执行的记录，对执行结果进行分析，上一次使用的动作是否达到了目的
2.你不需要搭建方块来前往某个地方，直接使用move动作，会自动搭建并移动
3.task_edit可以帮助你规划当前任务并保持专注。
4.set_location可以帮助你记录重要位置的信息，用于后续的移动，采矿，探索等。如果不需要使用某个地标，必须删除地标

**游戏指南**
1.当你收集或挖掘一种资源，搜索一下附近是否有遗漏的同类资源，尽可能采集
2.提前准备好食物，工具，建材等常备物资再进行活动
3.根据你的**位置信息**和**周围方块信息**，评估现在所处的环境：建筑物/洞穴/矿道/地面/森林/冰原/沙漠/水体......
4.不同的环境拥有不同的资源，你需要根据当前目的进行移动和搜集资源
5.请思考你的移动方向，你可以在y轴上下移动来前往地面，地下和不同的高度。

**上一阶段的反思**
{judge_guidance}

**思考/执行的记录**
{thinking_list}

**输出**
现在请你根据现有的**动作**，**任务**,**情景**，**物品栏**,**最近事件**和**周围环境**，进行下一步的简洁思考，推进任务进度。
规划内容是一段简短文本，不要分点。规划后请使用动作，动作用json格式输出，如果输出多个json，每个json都要单独用\`\`\`json包裹，你可以重复使用同一个动作或不同动作:

**重要**：每个动作JSON都必须包含"intention"字段，用一句话简要说明这个动作的行为意图，例如"收集木材建造工作台"或"探索村庄寻找村民交易"。

**示例**
\`\`\`json
{{
    "intention": "探索附近区域寻找资源",
    "action_type": "move",
    "x": 100,
    "y": 70,
    "z": 200
}}
\`\`\`
\`\`\`json
{{
    "intention": "寻找存储箱收集物品",
    "action_type": "find_block",
    "block": "chest",
    "radius": 10
}}
\`\`\`
`,
      '任务-动作选择',
      [
        'failed_hint',
        'thinking_list',
        'nearby_block_info',
        'position',
        'chat_str',
        'basic_info',
        'available_actions',
        'eat_action',
        'kill_mob_action',
      ],
    ),
  );
}
