# 动作系统优化方案

## 概述

本方案旨在优化 maicraft-next 的动作系统和提示词（参考原maicraft项目GUI模式相关，但一定要注意适配本项目，比如thinking log在本项目是思考记忆），主要通过：

1. **动作自管理激活**：每个动作实现自己的激活条件判断
2. **简化GUI模式触发**：use_chest/use_furnace 只保留位置参数
3. **上下文传递机制**：通过 思考记忆 在模式间传递意图
4. **提示词优化**：减少不必要的动作定义，节省 token

## 核心设计原则

### 1. 分层决策

- **主模式**：决策"做什么"（例如：使用箱子）
- **GUI模式**：决策"怎么做"（例如：存取哪些物品）
- **上下文传递**：通过 思考记忆 连接两个层次

### 2. 动作自管理激活

每个动作实现 `shouldActivate()` 方法：

- 传入参数：RuntimeContext（包含 GameState）
- 返回值：boolean（是否应该在提示词中显示）
- 核心动作：始终返回 true
- 条件动作：根据状态判断

### 3. 明确模式切换

- GUI模式在主模式中被 LLM 主动触发
- GUI模式完成操作后立即返回主模式
- 避免通过超时机制返回

---

## 一、动作激活系统

### 1.1 动作接口扩展

```typescript
interface Action {
  // 现有属性
  id: ActionId;
  name: string;
  description: string;

  // 新增：激活条件判断
  shouldActivate(context: RuntimeContext): boolean;

  // 现有方法
  execute(context: RuntimeContext, params: any): Promise<ActionResult>;
  getParamsSchema(): any;
}
```

### 1.2 动作分类

#### 核心动作（始终激活）

- move, move_to_block, move_to_location
- mine_by_type, mine_at_position, find_block
- place_block
- craft (保持智能合成系统)
- use_chest, use_furnace (简化版)
- chat, set_location

实现：

```typescript
shouldActivate(context: RuntimeContext): boolean {
  return true; // 始终激活
}
```

#### 条件动作（状态触发）

**EatAction**

- 激活条件：饥饿度 < 15，或者有食物且饥饿度 < 20
- 用途：避免不需要时干扰决策

**SwimToLandAction**

- 激活条件：玩家在水中，或者氧气 < 15
- 用途：只在落水时显示

实现示例：

```typescript
shouldActivate(context: RuntimeContext): boolean {
  return context.gameState.food < 15 ||
         (context.gameState.food < 20 && this.hasFood(context));
}
```

### 1.3 提示词生成集成

ActionPromptGenerator 在生成提示词时：

1. 遍历所有注册的动作
2. 调用每个动作的 `shouldActivate(context)`
3. 只为返回 true 的动作生成提示词
4. 结果：动态的、上下文相关的动作列表

---

## 二、GUI模式优化

### 2.1 use_chest 动作简化

**优化前**（46行）：

```json
{
  "action_type": "use_chest",
  "action": "store | withdraw",
  "items": [
    {"name": "物品名", "count": 数量}
  ],
  "x": 坐标, "y": 坐标, "z": 坐标
}
```

**优化后**（10行）：

```json
{
  "action_type": "use_chest",
  "position": {"x": 坐标, "y": 坐标, "z": 坐标}
}
```

**说明**：

- 主模式 LLM 只需决策"使用哪个箱子"
- 具体存取什么物品由 ChestMode 的 LLM 决策
- 减少主模式提示词复杂度

### 2.2 use_furnace 动作简化

类似 use_chest，从详细的 slot/item 参数简化为只有 position。

### 2.3 MainMode 拦截机制

MainMode 在执行动作列表时：

1. 检测到 use_chest 或 use_furnace
2. 提取位置参数
3. 切换到对应的 GUI Mode
4. 停止后续动作执行

---

## 三、上下文传递机制

### 3.1 思考记录的作用

**问题**：主模式只传递位置，GUI模式如何知道操作意图？

**答案**：通过 思考记忆（思考记录）

### 3.2 流程示例

1. **主模式决策**：

   ```
   思考：背包快满了，需要把多余的圆石存到箱子
   动作：use_chest (100, 64, 200)
   记录：思考记忆.add("背包快满了，需要把多余的圆石存到箱子")
   ```

2. **切换到 ChestMode**：
   - 保留 思考记忆 上下文

3. **ChestMode 提示词**：

   ```
   **思考/执行的记录**
   15:21:34: 背包快满了，需要把多余的圆石存到箱子
   15:21:30: 已经采集了64个圆石

   **当前背包**
   cobblestone x64, dirt x32

   **当前箱子**
   oak_planks x16, stick x8

   **请根据之前的思考记录决定存取操作**
   ```

4. **ChestMode LLM 决策**：
   ```
   理解意图：需要存储圆石
   动作：put_items cobblestone 50
   ```

### 3.3 ChestMode/FurnaceMode 改动

关键点：

1. **收集上下文**：从 Memory 获取 思考记忆, goal, tasks
2. **传递给提示词**：让 LLM 理解操作意图
3. **执行后返回**：明确调用 `setMode(MAIN)` 返回主模式

---

## 四、提示词优化效果

### 4.1 主模式提示词

**优化前**：~630 行

- 基础信息：200 行
- 动作定义：430 行（15个动作，每个平均30行）

**优化后**：~350-400 行

- 基础信息：200 行
- 核心动作：150 行（10个简化动作）
- 条件动作：0-100 行（根据状态动态，3-5个）

**节省**：~230-280 行（约 40% token）

### 4.2 GUI模式提示词

GUI模式提示词会增加上下文信息：

- 思考记忆（约50 tokens）
- goal, tasks（约50 tokens）
- inventory, chat（约100 tokens）

但由于主模式节省更多，整体仍是优化。

---

## 五、是否需要新Mode？

### 5.1 当前Mode架构

现有的4个Mode已经足够：

1. **MainMode**：主动探索和任务执行
2. **CombatMode**：战斗（被动响应）
3. **ChestMode**：箱子操作（LLM主动触发）
4. **FurnaceMode**：熔炉操作（LLM主动触发）

### 5.2 不需要新Mode的理由

**EatMode**？

- ❌ 不需要。eat 是简单的一次性动作
- ✅ 通过条件激活在主模式处理

**SwimMode**？

- ❌ 不需要。swim_to_land 也是简单动作
- ✅ 通过条件激活在主模式处理

**MiningMode**？

- ❌ 不需要。mine_by_type 已经足够智能
- ✅ 复杂的采矿策略由 PlanningManager 处理

**BuildMode**？

- ❌ 不需要。place_block + 任务系统已够用
- ✅ 建筑规划由 PlanningManager 处理

### 5.3 设计原则

**何时创建新Mode**：

- 需要多步骤的 LLM 决策
- 需要专门的交互界面
- 有明确的进入/退出条件

**何时使用条件激活**：

- 简单的一次性动作
- 状态触发的辅助功能
- 不需要复杂决策的操作

---

## 六、实施计划

### Phase 1: 动作激活系统（核心）

**目标**：建立动作自管理激活机制

1. 扩展 Action 接口，添加 `shouldActivate()` 方法
2. 为所有动作实现激活条件
   - 核心动作：返回 true
   - 条件动作：实现判断逻辑
3. 修改 ActionPromptGenerator，集成激活过滤

### Phase 2: GUI模式优化（重要）

**目标**：简化触发，增强上下文传递

1. 简化主模式的 use_chest/use_furnace 提示词
2. ChestMode/FurnaceMode 添加上下文收集
3. 更新 chest_operation/furnace_operation 模板
4. 实现明确的返回主模式机制

### Phase 3: 提示词清理（优化）

**目标**：减少冗余，优化token使用

1. 移除或简化不常用动作的详细说明
2. 优化动作描述的语言
3. 调整条件动作的激活阈值

### Phase 4: 测试和调优（验证）

不需要你来测试，用户来测试。

---

## 九、与原版对齐

本方案完全对齐原版 maicraft (Python) 的设计理念：

| 方面     | 原版 maicraft       | maicraft-next (本方案) |
| -------- | ------------------- | ---------------------- |
| GUI触发  | use_chest(position) | use_chest(position) ✅ |
| 意图传递 | 思考记忆            | 思考记忆 ✅            |
| 模式返回 | 明确 setMode        | 明确 setMode ✅        |
| 动作过滤 | 只过滤查询类        | 条件激活 ✅            |
| 合成系统 | 自动化              | 自动化 ✅              |
| Mode数量 | 4个核心Mode         | 4个核心Mode ✅         |

### 改进点

在原版基础上的创新：

1. **动作自管理激活**：比原版更灵活
2. **类型安全**：TypeScript 的优势
3. **结构化输出**：更可靠的解析

---

## 十、参考原版实现

### 原版关键代码位置

**意图传递**：

- `agent/environment/environment.py:631` - 思考记忆 包含在 get_all_data()
- `agent/prompt_manager/chest_gui.py:42` - chest_gui 模板使用 思考记忆
- `agent/thinking_log.py` - 思考记录管理

**GUI模式触发**：

- `agent/mai_agent.py:440-472` - use_chest 触发模式切换
- `agent/sim_gui/chest.py:30-76` - ChestSimGui 执行并返回

**动作过滤**：

- `agent/utils/utils.py:118-148` - filter_action_tools 只过滤查询类

---

## 总结

本方案的核心思想：

1. **让动作更智能**：每个动作知道自己何时应该出现
2. **让决策更分层**：主模式决策方向，GUI模式决策细节
3. **让上下文流动**：思考记忆 连接不同决策层次
4. **让提示词更精简**：只显示相关的动作，节省token

通过这些改进，系统将更高效、更智能、更易维护。
