# 合成(Craft)动作设计文档

## 概述

本文档定义了合成(Craft)动作的设计规范，基于maicraft-next的一体化agent架构理念。设计遵循简单易用的原则，提供单一的智能合成动作，让agent无需关心合成细节，专注于目标达成。

## 设计原则

1. **简单易用** - 单一合成动作，参数简洁明了
2. **智能决策** - 自动处理配方选择、工作台查找等细节
3. **容错友好** - 提供清晰的错误信息和解决建议
4. **一体化集成** - 与GameState无缝集成，状态透明访问
5. **中文支持** - 完整的中文物品名称支持

## 单一合成动作设计

### CraftAction - 智能合成物品

**动作ID**: `CRAFT`

**描述**: 自动查找配方并合成指定物品，agent无需关心合成细节，专注于目标达成

**使用场景**:

- 合成任意物品（工具、武器、建材、食物等）
- 批量合成同一物品
- 智能处理材料和工作台需求

**参数**:

```typescript
interface CraftParams {
  item: string; // 物品名称（必需）
  count?: number; // 合成数量（默认1，可选）
}
```

**参数说明**:

- `item`: 物品名称，支持中文和英文名称（如"木镐"、"wooden_pickaxe"）
- `count`: 合成数量，默认为1，支持批量合成

**示例**:

```json
{
  "action_type": "CRAFT",
  "item": "木镐",
  "count": 3
}
```

```json
{
  "action_type": "CRAFT",
  "item": "iron_sword",
  "count": 1
}
```

**实现要点**:

- **智能配方选择**: 自动选择最优配方，优先使用常见材料
- **递归合成**: 自动合成所需的原材料
- **工作台处理**: 自动查找附近工作台，必要时自动放置
- **中文支持**: 完整的中文物品名称映射
- **错误友好**: 提供清晰的材料缺失建议

## 核心实现系统

### 1. CraftManager - 合成管理器

智能合成的核心类，负责所有合成逻辑：

```typescript
export class CraftManager {
  private itemNames: Map<string, string>; // 中文到英文名称映射

  constructor(
    private bot: Bot,
    private logger: Logger,
  ) {
    this.itemNames = this.loadItemNameMapping();
  }

  // 主要合成方法
  async craftItem(itemName: string, count: number = 1): Promise<ActionResult> {
    // 1. 标准化物品名称
    const normalizedName = this.normalizeItemName(itemName);

    // 2. 查找配方
    const recipe = await this.findOptimalRecipe(normalizedName);
    if (!recipe) {
      return this.createErrorResult(`找不到 ${itemName} 的合成配方`);
    }

    // 3. 递归检查和合成材料
    const materialResult = await this.ensureMaterials(recipe, count);
    if (!materialResult.success) {
      return materialResult;
    }

    // 4. 处理工作台
    const craftingTable = await this.ensureCraftingTable(recipe);

    // 5. 执行合成
    return await this.performCrafting(recipe, count, craftingTable);
  }

  // 物品名称标准化
  private normalizeItemName(name: string): string {
    const normalizedName = name.toLowerCase().trim();
    return this.itemNames.get(normalizedName) || normalizedName;
  }
}
```

### 2. RecipeSelector - 配方选择器

负责选择最优配方：

```typescript
export class RecipeSelector {
  // 选择最优配方（优先使用常见材料）
  selectOptimalRecipe(recipes: Recipe[]): Recipe | null {
    if (recipes.length === 0) return null;

    // 按材料稀有度排序，优先选择常见材料
    const sortedRecipes = recipes.sort((a, b) => {
      const scoreA = this.calculateRecipeScore(a);
      const scoreB = this.calculateRecipeScore(b);
      return scoreB - scoreA; // 降序，分数高的优先
    });

    return sortedRecipes[0];
  }

  // 计算配方分数（材料越常见分数越高）
  private calculateRecipeScore(recipe: Recipe): number {
    let score = 0;

    // 材料稀有度权重
    const materialRarity: Record<string, number> = {
      oak_planks: 10,
      cobblestone: 10,
      stick: 10,
      iron_ingot: 5,
      gold_ingot: 3,
      diamond: 1,
    };

    for (const ingredient of recipe.ingredients) {
      const materialName = this.getItemNameById(ingredient.id);
      score += materialRarity[materialName] || 1;
    }

    return score;
  }
}
```

### 3. MaterialPlanner - 材料规划器

负责递归材料检查和合成：

```typescript
export class MaterialPlanner {
  async ensureMaterials(recipe: Recipe, count: number): Promise<ActionResult> {
    for (const ingredient of recipe.ingredients) {
      const needCount = ingredient.count * count;
      const haveCount = this.getItemCount(ingredient.id);

      if (haveCount < needCount) {
        const shortage = needCount - haveCount;

        // 尝试合成缺失材料
        const craftResult = await this.craftItem(ingredient.id, shortage);
        if (!craftResult.success) {
          return this.createMaterialError(ingredient, shortage, craftResult);
        }
      }
    }
    return this.createSuccessResult('材料检查通过');
  }
}
```

### 4. CraftingTableManager - 工作台管理器

负责工作台的查找和放置：

```typescript
export class CraftingTableManager {
  async ensureCraftingTable(recipe: Recipe): Promise<Block | null> {
    if (!recipe.requiresTable) {
      return null; // 不需要工作台
    }

    // 查找附近工作台
    const nearbyTable = this.bot.findBlock({
      matching: this.mcData.blocksByName.crafting_table.id,
      maxDistance: 32,
    });

    if (nearbyTable) {
      return nearbyTable;
    }

    // 没有找到工作台，尝试放置
    return await this.placeCraftingTable();
  }

  private async placeCraftingTable(): Promise<Block | null> {
    const craftingTable = this.inventory.findInventoryItem(this.mcData.itemsByName.crafting_table.id);

    if (!craftingTable) {
      throw new Error('需要工作台但没有找到，请先合成工作台');
    }

    // 寻找合适的放置位置
    const placementPos = this.findSuitablePlacementPosition();
    if (!placementPos) {
      throw new Error('找不到合适的位置放置工作台');
    }

    await this.bot.placeBlock(craftingTable, placementPos);
    return this.bot.blockAt(placementPos);
  }
}
```

## 实现规范

### 增强的CraftAction类结构

```typescript
export class CraftAction extends BaseAction<CraftParams> {
  readonly id = ActionIds.CRAFT;
  readonly name = 'CraftAction';
  readonly description = '智能合成物品，自动处理配方、材料和工作台';

  private craftManager: CraftManager;

  constructor() {
    // 简化构造函数，内部管理依赖
  }

  async execute(context: RuntimeContext, params: CraftParams): Promise<ActionResult> {
    const { item, count = 1 } = params;

    try {
      // 1. 参数验证
      if (!item) {
        return this.failure('物品名称不能为空');
      }

      context.logger.info(`开始合成: ${item} x${count}`);

      // 2. 使用CraftManager执行合成
      const result = await this.craftManager.craftItem(item, count);

      if (result.success) {
        context.logger.info(`合成成功: ${item} x${count}`);
        return this.success(result.message, result.data);
      } else {
        context.logger.warn(`合成失败: ${result.message}`);
        return this.failure(result.message, result.error);
      }
    } catch (error) {
      const err = error as Error;
      context.logger.error('合成过程中发生错误:', err);
      return this.failure(`合成失败: ${err.message}`, err);
    }
  }

  getParamsSchema(): any {
    return {
      item: {
        type: 'string',
        description: '物品名称，支持中文和英文（如：木镐、wooden_pickaxe）',
      },
      count: {
        type: 'number',
        description: '合成数量，默认为1',
        optional: true,
        minimum: 1,
        maximum: 64,
      },
    };
  }
}
```

### 简化的错误处理

```typescript
// 主要错误类型
const CRAFT_ERRORS = {
  ITEM_NOT_FOUND: '找不到指定的物品',
  RECIPE_NOT_FOUND: '找不到该物品的合成配方',
  INSUFFICIENT_MATERIALS: '材料不足',
  CRAFTING_TABLE_REQUIRED: '需要工作台但没有找到',
  CRAFT_FAILED: '合成执行失败',
} as const;

// 用户友好的错误信息
function createFriendlyError(errorType: keyof typeof CRAFT_ERRORS, details?: any): ActionResult {
  const baseMessage = CRAFT_ERRORS[errorType];

  switch (errorType) {
    case 'INSUFFICIENT_MATERIALS':
      const missingList = details?.missing?.map((m: any) => `${m.name} x${m.count}`).join('、') || '未知材料';
      return {
        success: false,
        message: `${baseMessage}：缺少 ${missingList}`,
        error: { code: errorType, details },
      };

    case 'RECIPE_NOT_FOUND':
      return {
        success: false,
        message: `${baseMessage}，请检查物品名称是否正确`,
        error: { code: errorType, details },
      };

    default:
      return {
        success: false,
        message: baseMessage,
        error: { code: errorType, details },
      };
  }
}
```

### 物品名称映射

```typescript
// 简化的中文物品名称映射
const ITEM_NAME_MAPPING: Record<string, string> = {
  // 工具
  木镐: 'wooden_pickaxe',
  石镐: 'stone_pickaxe',
  铁镐: 'iron_pickaxe',
  钻石镐: 'diamond_pickaxe',
  木斧: 'wooden_axe',
  石斧: 'stone_axe',
  铁斧: 'iron_axe',
  钻石斧: 'diamond_axe',
  木剑: 'wooden_sword',
  石剑: 'stone_sword',
  铁剑: 'iron_sword',
  钻石剑: 'diamond_sword',

  // 基础材料
  木板: 'planks',
  木棍: 'stick',
  工作台: 'crafting_table',
  熔炉: 'furnace',
  箱子: 'chest',

  // 矿物
  煤炭: 'coal',
  铁锭: 'iron_ingot',
  金锭: 'gold_ingot',
  钻石: 'diamond',

  // 食物
  面包: 'bread',
  熟牛肉: 'cooked_beef',
  熟猪肉: 'cooked_porkchop',

  // 方块
  圆石: 'cobblestone',
  石头: 'stone',
  木头: 'log',
  玻璃: 'glass',
};

function normalizeItemName(name: string): string {
  const normalizedName = name.toLowerCase().trim();
  return ITEM_NAME_MAPPING[normalizedName] || normalizedName;
}
```

## 使用示例

### 基础合成

```typescript
// 合成单个物品
const result = await executor.execute(ActionIds.CRAFT, {
  item: '木镐',
});
```

```typescript
// 合成多个物品
const result = await executor.execute(ActionIds.CRAFT, {
  item: 'wooden_pickaxe',
  count: 3,
});
```

```typescript
// 使用中文名称
const result = await executor.execute(ActionIds.CRAFT, {
  item: '铁镐',
  count: 1,
});
```

### 错误处理示例

```typescript
const result = await executor.execute(ActionIds.CRAFT, {
  item: '木镐',
  count: 5,
});

if (!result.success) {
  console.log('合成失败:', result.message);
  // 输出: "合成失败: 材料不足：缺少 木板 x20、木棍 x5"

  if (result.error?.code === 'INSUFFICIENT_MATERIALS') {
    console.log('需要先合成缺失的材料');
  }
}
```

## 注册规范

### ActionIds定义（简化版）

```typescript
// src/core/actions/ActionIds.ts
export const ActionIds = {
  // ... 其他动作
  CRAFT: 'craft',
} as const;
```

### 动作注册（简化版）

```typescript
// src/core/actions/implementations/index.ts
export { CraftAction } from './CraftAction';
```

### 类型映射（简化版）

```typescript
// src/core/actions/types.ts
export interface ActionParamsMap {
  // ... 其他动作
  [ActionIds.CRAFT]: CraftParams;
}
```

## 与原项目的对比

### 简化后的功能对比

| 特性           | Maicraft (Python) | Maicraft-Next (新设计) | 改进说明           |
| -------------- | ----------------- | ---------------------- | ------------------ |
| **智能合成**   | ✓ 高级智能合成    | ✓ 增强智能合成         | 保留智能，优化性能 |
| **API简洁性**  | ✓ 简洁单一接口    | ✓ 极简双参数接口       | 进一步简化         |
| **中文支持**   | ✓ 完整中文支持    | ✓ 完整中文支持         | 保持兼容           |
| **错误处理**   | ✓ 详细分析报告    | ✓ 友好错误信息         | 更直观易懂         |
| **递归合成**   | ✓ 支持递归        | ✓ 支持递归             | 保留核心功能       |
| **批量合成**   | ❌ 不支持         | ✓ 支持count参数        | 简化实现           |
| **工作台处理** | ✓ 智能处理        | ✓ 智能处理             | 优化性能           |

### 关键设计改进

1. **极简化参数**: 只保留`item`和`count`两个参数，agent无需关心复杂配置
2. **自动化决策**: 系统自动处理配方选择、材料规划、工作台管理等细节
3. **友好错误**: 提供中文错误信息和具体的解决建议
4. **性能优化**: 直接调用，避免跨进程通信开销

### 与MCP架构的对比

**MCP架构的限制**:

- 跨进程通信开销大
- 需要先查询配方再合成（两次调用）
- 状态不透明，难以实现复杂递归逻辑

**一体化架构的优势**:

- 直接函数调用，性能优异
- 状态完全透明，支持复杂逻辑
- 简化的API，降低agent的认知负担

---

## 文档更新

新增或修改合成动作时需要：

1. 更新本文档
2. 更新ActionIds常量
3. 更新类型映射
4. 更新导出列表
5. 添加相应的测试用例

---

## 设计决策记录

### 为什么选择单一智能动作？

1. **降低认知负担** - agent只需知道"合成物品"，无需理解复杂的合成策略
2. **自动化决策** - 系统处理所有技术细节，让agent专注于目标
3. **简化API** - 最少的参数，最直观的使用方式
4. **一体化优势** - 充分利用单一架构的状态透明和性能优势

### 为什么去除复杂配置选项？

1. **避免过度设计** - 大部分场景agent不需要精细控制合成过程
2. **智能默认值** - 系统的自动决策已经足够优秀
3. **保持简洁** - 简单的API更容易理解和维护
4. **渐进增强** - 未来需要时可以再添加可选的高级参数

### 递归合成的必要性？

1. **用户体验** - agent不需要知道"先合成木板再合成工作台最后合成木镐"
2. **智能规划** - 系统自动处理依赖关系和合成顺序
3. **减少调用** - 一次调用完成整个合成链，提高效率

---

_设计文档版本: 2.0 (简化版)_
_创建日期: 2025-11-15_
_最后更新: 2025-11-15_
