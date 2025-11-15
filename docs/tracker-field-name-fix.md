# 追踪器字段名不一致问题修复

## 问题诊断

在 `task-history.json` 中出现了 `"description": "0/undefined undefined"` 的问题，原因是：

### 1. 提示词中的字段名错误

**旧提示词**（错误）：

```
- itemType, count  (应该是 itemName, targetCount)
- x, y, z          (应该是 targetX, targetY, targetZ)
- operator         (应该是 logic)
```

### 2. 实际代码中的字段名

查看各个 Tracker 的实现：

- **InventoryTracker**: `itemName`, `targetCount`, `exact`
- **CraftTracker**: `itemName`, `targetCount`
- **LocationTracker**: `targetX`, `targetY`, `targetZ`, `radius`
- **CompositeTracker**: `logic`, `trackers`

### 3. 现有数据文件的问题

`goal-planning.json` 中的追踪器缺少必要字段：

```json
{
  "tracker": {
    "type": "inventory",
    "exact": false
    // 缺少 itemName 和 targetCount！
  }
}
```

这导致 `InventoryTracker.getProgress()` 调用时：

```typescript
description: `${current}/${target} ${this.itemName}`;
//                           ↑         ↑
//                      undefined   undefined
```

## 修复方案

### 1. 更新提示词模板 ✅

已修复 `src/core/agent/prompt/templates/plan_generation.ts`：

```diff
- itemType (物品类型), count (数量)
+ itemName (物品名称), targetCount (目标数量)

- x, y, z (目标坐标)
+ targetX, targetY, targetZ (目标坐标)

- operator (and/or)
+ logic (and/or)
```

### 2. 更新 JSON Schema ✅

已修复 `src/core/agent/structured/ActionSchema.ts`：

```diff
- x: { type: 'number' }
- y: { type: 'number' }
- z: { type: 'number' }
+ targetX: { type: 'number' }
+ targetY: { type: 'number' }
+ targetZ: { type: 'number' }

- operator: { enum: ['and', 'or'] }
+ logic: { enum: ['and', 'or'] }
```

### 3. 清理损坏的数据文件

需要删除或重新生成包含不完整追踪器的计划：

```bash
# 备份当前数据
cp data/goal-planning.json data/goal-planning.json.backup

# 选项1: 清空计划，保留目标
# 编辑 goal-planning.json，删除 plans 数组中的内容，将 currentPlanId 设为 null

# 选项2: 完全重新开始
rm data/goal-planning.json
rm data/task-history.json
```

## 字段名对照表

| 追踪器类型 | 正确字段名  | 错误字段名（已修复） | 类型           |
| ---------- | ----------- | -------------------- | -------------- |
| inventory  | itemName    | itemType             | string         |
| inventory  | targetCount | count                | number         |
| inventory  | exact       | -                    | boolean (可选) |
| craft      | itemName    | itemType             | string         |
| craft      | targetCount | count                | number         |
| location   | targetX     | x                    | number         |
| location   | targetY     | y                    | number         |
| location   | targetZ     | z                    | number         |
| location   | radius      | -                    | number (可选)  |
| composite  | logic       | operator             | 'and' \| 'or'  |
| composite  | trackers    | -                    | array          |

## CompositeTracker 的大小写问题

**注意**：CompositeTracker 内部使用大写 `'AND' | 'OR'`，但 JSON 中使用小写 `'and' | 'or'`：

```typescript
// CompositeTracker.ts
constructor(
  private trackers: TaskTracker[],
  private logic: 'AND' | 'OR' = 'AND',  // 大写
) {}

static fromJSON(json: any, trackerFactory: any): CompositeTracker {
  const trackers = json.trackers.map((t: any) => trackerFactory.fromJSON(t));
  return new CompositeTracker(trackers, json.logic);  // JSON 中是小写
}
```

这会导致问题！需要修复。

## 验证修复

### 1. 启动后重新生成计划

系统会自动检测到目标没有有效的计划，然后调用 LLM 重新生成。

### 2. 检查生成的计划

查看新生成的 `goal-planning.json`，确保包含完整字段：

```json
{
  "tracker": {
    "type": "inventory",
    "itemName": "oak_log",
    "targetCount": 10,
    "exact": false
  }
}
```

### 3. 检查任务历史

`task-history.json` 中的进度应该显示正确：

```json
{
  "description": "6/10 oak_log" // ✅ 正确
}
```

而不是：

```json
{
  "description": "0/undefined undefined" // ❌ 错误
}
```

## 后续处理

1. **删除损坏的计划数据**（推荐）
2. **重新启动 Bot**
3. **LLM 会自动生成新的计划**（使用正确的字段名）
4. **监控日志确认追踪器工作正常**
