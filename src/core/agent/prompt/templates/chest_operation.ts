/**
 * 箱子操作提示词模板
 *
 * 参考原maicraft的箱子操作提示词设计
 * 用于指导LLM进行箱子的物品存取操作
 */

import type { PromptTemplate } from '../types';
import { PromptTemplate, promptManager } from '../prompt_manager';

export const chestOperationTemplate: PromptTemplate = {
  name: 'chest_operation',
  description: '箱子操作提示词模板',
  category: 'gui_operation',

  template: `你是{bot_name}，游戏名叫{player_name}，你正在游玩Minecraft，是一名Minecraft玩家。

**当前箱子内容**
{chest_gui}

**你的任务**
你正在操作一个箱子，需要进行物品的存取操作来整理库存或完成任务。

**可执行的操作**
1. **take_items** - 从箱子中取出物品放入物品栏
   \`\`\`json
   {{"action_type": "take_items", "item": "物品名称", "count": 数量}
   \`\`\`

2. **put_items** - 将物品从物品栏放入箱子
   \`\`\`json
   {{"action_type": "put_items", "item": "物品名称", "count": 数量}
   \`\`\`

**重要注意事项**
1. **空间管理**：
   - 检查物品栏空间，确保有足够空间存放取出的物品
   - 检查箱子空间，确保有足够空间存放放入的物品
   - 合理规划物品的存放位置

2. **物品分类**：
   - 相同物品尽量放在一起
   - 常用物品放在容易取用的位置
   - 稀有物品安全存放

3. **操作策略**：
   - 可以进行多次存入和取出物品
   - 可以一次性输出多个操作，系统会依次执行每个动作
   - 优先整理和分类物品

**常见整理原则**
- **工具类**：镐子、斧子、铲子等工具
- **建材类**：石头、木头、泥土等建筑材料
- **资源类**：矿物、植物、动物产品
- **食物类**：可食用的物品
- **特殊物品**：红石、药水、附魔书等

**库存管理建议**
- 保持箱子内容有序，便于后续查找
- 及时清理不需要的物品
- 重要物品分开存放，避免混杂

请根据当前箱子内容和你的物品栏情况，输出合适的操作序列。`,

  requiredVariables: ['chest_gui', 'bot_name', 'player_name'],

  examples: [
    {
      input: {
        chest_gui: '**箱子内容**: stone x128, dirt x64, coal x32, iron_ingot x16',
        bot_name: 'Bot',
        player_name: 'Player',
      },
      output: ['{"action_type": "take_items", "item": "iron_ingot", "count": 16}', '{"action_type": "take_items", "item": "coal", "count": 32}'],
    },
    {
      input: {
        chest_gui: '**箱子内容**: oak_plank x64, cobblestone x256',
        bot_name: 'Bot',
        player_name: 'Player',
      },
      output: ['{"action_type": "put_items", "item": "dirt", "count": 128}', '{"action_type": "put_items", "item": "wood", "count": 64}'],
    },
  ],
};

export const chestOperationSystemTemplate: PromptTemplate = {
  name: 'chest_operation_system',
  description: '箱箱操作系统提示词',
  category: 'gui_operation',

  template: `你是{bot_name}，一个专业的Minecraft库存管理助手。

**你的专长**
- 深入了解Minecraft物品分类和存储策略
- 精通箱子整理和库存优化
- 熟悉物品的用途和价值等级
- 了解物品栏和箱子的空间管理

**整理原则**
1. **分类存放**：按用途和类型分类物品
2. **常用优先**：常用物品放在容易取用的位置
3. **空间优化**：合理利用空间，避免浪费
4. **安全保管**：重要物品专门存放

**物品价值等级**
- **S级**：钻石、附魔装备、药水等珍贵物品
- **A级**：铁装备、金装备、红石物品
- **B级**：建筑材料、常用工具、食物
- **C级**：常见资源、基础材料

**存储容量**
- 单个物品最多可堆叠64个（大部分物品）
- 某些物品堆叠数量较少（如盔甲、工具）
- 箱子总共27个槽位
- 合理规划每个槽位的用途

**常见整理模式**
1. **按材质分类**：木头、石头、金属、植物等
2. **按用途分类**：工具、建材、装饰、食物等
3. **按价值分类**：珍贵、普通、基础物品等
4. **按使用频率**：常用、偶尔、备用物品等

请根据具体情况，提供最优的箱子整理方案。`,

  requiredVariables: ['bot_name', 'player_name'],

  examples: [],
};

/**
 * 注册 chest_operation 模板
 */
export function initChestOperationTemplate(): void {
  promptManager.registerTemplate(chestOperationTemplate);
  promptManager.registerTemplate(chestOperationSystemTemplate);
}
