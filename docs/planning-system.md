# 规划系统 (Goal-Plan-Task System)

> 本文档介绍 Maicraft-Next 的层次化任务规划系统

---

## 🎯 设计理念

### Maicraft Python 的局限

```python
# ❌ 简单的 to_do_list
todo_list = [
    "收集木头",
    "制作工作台",
    "制作木镐"
]
```

**问题**：

- 扁平结构，无层次关系
- 无法表达任务依赖
- 无进度追踪
- 难以管理复杂任务

### Maicraft-Next 的改进

**三层结构**：Goal → Plan → Task

```typescript
// ✅ 层次化规划
const goal = await planning.createGoal({
  name: '建造房子',
  description: '在当前位置建造一个木质房子',
  priority: 'high',
});

const plan = await planning.createPlan(goal.id, {
  name: '收集材料',
  tasks: [
    { name: '收集64个橡木', tracker: { type: 'inventory', item: 'oak_log', count: 64 } },
    { name: '制作256个木板', tracker: { type: 'inventory', item: 'oak_planks', count: 256 } },
  ],
});

// ✅ 自动进度追踪
console.log(plan.progress); // 45%
```

---

## 📐 系统架构

```
Goal (目标)
  ├── Plan 1 (计划)
  │   ├── Task 1.1 (任务)
  │   │   └── Tracker (追踪器)
  │   ├── Task 1.2
  │   │   └── Tracker
  │   └── Task 1.3
  │       └── Tracker
  └── Plan 2
      ├── Task 2.1
      └── Task 2.2
```

### 三层含义

1. **Goal (目标)** - 高层次的目标，如"建造房子"、"探索矿洞"
2. **Plan (计划)** - 实现目标的具体计划，如"收集材料"、"建造地基"
3. **Task (任务)** - 计划中的具体任务，如"收集64个木头"

---

## 💻 基本使用

### 创建目标

```typescript
import { GoalPlanningManager } from '@/core/agent/planning/GoalPlanningManager';

const planning = new GoalPlanningManager(gameContext);

// 创建目标
const goal = await planning.createGoal({
  name: '建造房子',
  description: '在(100, 64, 200)建造一个木质房子',
  priority: 'high',
  metadata: {
    location: { x: 100, y: 64, z: 200 },
    type: 'building',
  },
});
```

### 创建计划

```typescript
// 为目标添加计划
const plan = await planning.createPlan(goal.id, {
  name: '收集材料',
  description: '收集建造所需的木材',
  tasks: [
    {
      name: '收集64个橡木',
      description: '去森林收集橡木原木',
      tracker: {
        type: 'inventory',
        item: 'oak_log',
        count: 64,
      },
    },
    {
      name: '制作256个木板',
      description: '将橡木原木制作成木板',
      tracker: {
        type: 'inventory',
        item: 'oak_planks',
        count: 256,
      },
    },
  ],
});
```

### 追踪进度

```typescript
// 获取进度
const progress = await planning.getProgress(plan.id);
console.log(`计划进度: ${progress}%`);

// 检查任务是否完成
const task = plan.tasks[0];
const isComplete = await planning.checkTaskComplete(task);
console.log(`任务完成: ${isComplete}`);

// 自动更新进度
await planning.updateProgress();
```

### 管理目标

```typescript
// 获取所有目标
const goals = await planning.getAllGoals();

// 获取当前目标
const current = await planning.getCurrentGoal();

// 切换目标
await planning.setCurrentGoal(goal.id);

// 完成目标
await planning.completeGoal(goal.id);

// 取消目标
await planning.cancelGoal(goal.id);
```

---

## 🔧 任务追踪器 (Trackers)

### 内置追踪器类型

#### 1. InventoryTracker - 物品栏追踪

```typescript
{
  type: 'inventory',
  item: 'iron_ore',
  count: 10
}
```

检查物品栏中是否有指定数量的物品。

#### 2. LocationTracker - 位置追踪

```typescript
{
  type: 'location',
  x: 100,
  y: 64,
  z: 200,
  radius: 5
}
```

检查是否到达指定位置（在半径范围内）。

#### 3. CraftTracker - 合成追踪

```typescript
{
  type: 'craft',
  item: 'wooden_pickaxe',
  count: 1
}
```

检查是否完成指定物品的合成。

#### 4. CompositeTracker - 组合追踪

```typescript
{
  type: 'composite',
  operator: 'AND',  // 或 'OR'
  trackers: [
    { type: 'inventory', item: 'diamond', count: 3 },
    { type: 'location', x: 0, y: 64, z: 0, radius: 10 }
  ]
}
```

组合多个追踪器，支持 AND/OR 逻辑。

---

## 🔄 与 Maicraft Python 的对比

| 方面         | Maicraft Python  | Maicraft-Next       |
| ------------ | ---------------- | ------------------- |
| **结构**     | 扁平的 todo_list | 三层 Goal-Plan-Task |
| **层次**     | 无层次关系       | 清晰的层次结构      |
| **进度**     | 无自动追踪       | 自动进度计算        |
| **追踪器**   | 手动检查         | 编程式追踪器        |
| **依赖**     | 无依赖管理       | 支持任务依赖        |
| **复杂任务** | 难以管理         | 易于组织            |

---

## 📚 在 Agent 中使用规划系统

### 在决策循环中

```typescript
// MainDecisionLoop.ts
async think(): Promise<void> {
  // 1. 更新任务进度
  await this.state.planningManager.updateProgress();

  // 2. 获取当前目标和计划
  const currentGoal = await this.state.planningManager.getCurrentGoal();
  const currentPlan = currentGoal?.plans[0];

  // 3. 包含在 Prompt 中
  const prompt = `
    当前目标: ${currentGoal?.name}
    当前计划: ${currentPlan?.name}
    进度: ${currentPlan?.progress}%

    未完成的任务:
    ${currentPlan?.tasks
      .filter(t => t.status !== 'completed')
      .map(t => `- ${t.name} (${t.progress}%)`)
      .join('\n')}
  `;

  // 4. 调用 LLM 决策
  const response = await this.llmManager.chat(prompt);

  // 5. 根据任务完成情况更新
  if (currentPlan?.progress === 100) {
    await this.state.planningManager.completePlan(currentPlan.id);
  }
}
```

---

## 🚀 最佳实践

### 1. 合理分解任务

```typescript
// ✅ 好：任务具体、可追踪
{
  name: '收集10个铁矿',
  tracker: { type: 'inventory', item: 'iron_ore', count: 10 }
}

// ❌ 差：任务太抽象
{
  name: '准备冒险',
  tracker: null
}
```

### 2. 使用适当的追踪器

```typescript
// ✅ 对于物品收集，使用 inventory tracker
{ type: 'inventory', item: 'iron_ore', count: 10 }

// ✅ 对于移动任务，使用 location tracker
{ type: 'location', x: 100, y: 64, z: 200, radius: 5 }

// ✅ 对于复杂任务，使用 composite tracker
{
  type: 'composite',
  operator: 'AND',
  trackers: [/* 多个追踪器 */]
}
```

### 3. 设置合理的优先级

```typescript
// 紧急任务
await planning.createGoal({
  name: '逃离危险',
  priority: 'critical',
});

// 重要任务
await planning.createGoal({
  name: '建造房子',
  priority: 'high',
});

// 日常任务
await planning.createGoal({
  name: '整理物品栏',
  priority: 'normal',
});
```

### 4. 定期更新进度

```typescript
// 在决策循环中定期更新
setInterval(async () => {
  await planning.updateProgress();
}, 10000); // 每 10 秒更新一次
```

---

## 📚 完整示例

```typescript
// 创建"建造房子"目标
const goal = await planning.createGoal({
  name: '建造房子',
  description: '建造一个简单的木质房子',
  priority: 'high',
});

// 计划1: 收集材料
const plan1 = await planning.createPlan(goal.id, {
  name: '收集材料',
  tasks: [
    {
      name: '收集64个橡木',
      tracker: { type: 'inventory', item: 'oak_log', count: 64 },
    },
    {
      name: '制作256个木板',
      tracker: { type: 'inventory', item: 'oak_planks', count: 256 },
    },
    {
      name: '制作工作台',
      tracker: { type: 'craft', item: 'crafting_table', count: 1 },
    },
  ],
});

// 计划2: 建造地基
const plan2 = await planning.createPlan(goal.id, {
  name: '建造地基',
  tasks: [
    {
      name: '到达建造地点',
      tracker: { type: 'location', x: 100, y: 64, z: 200, radius: 5 },
    },
    {
      name: '放置地基方块',
      tracker: { type: 'custom', checkFn: () => checkFoundation() },
    },
  ],
});

// 自动更新进度
await planning.updateProgress();
console.log(`目标进度: ${goal.progress}%`);
```

---

## 📚 相关文档

- [代理系统](agent-system.md) - 了解规划系统在 Agent 中的使用
- [记忆系统](memory-system.md) - 了解如何配合记忆系统使用

---

_最后更新: 2025-11-01_
