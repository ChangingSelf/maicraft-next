# 规划系统持久化修复总结

## 问题分析

之前的规划系统虽然架构完整，但存在以下问题：

1. **只创建 Goal，没有生成 Plan 和 Task**：在 `Agent.ts` 的 `setGoal` 方法中，只调用了 `createGoal`，但没有创建相应的 Plan 和 Task
2. **缺少 LLM 集成**：规划系统没有与 LLM 连接，无法自动生成执行计划
3. **缺少自动触发机制**：主决策循环中没有检查并生成计划的逻辑

## 修复内容

### 1. 创建规划生成提示词模板

**文件**: `src/core/agent/prompt/templates/plan_generation.ts`

- 添加了详细的规划生成提示词模板
- 包含目标、当前状态、环境信息、历史经验等上下文
- 说明了4种可用的任务追踪器类型（inventory, craft, location, composite）
- 要求 LLM 返回结构化的 JSON 格式计划

### 2. 创建规划生成结构化输出 Schema

**文件**: `src/core/agent/structured/ActionSchema.ts`

添加了：
- `PlanGenerationResponse` 接口
- `PlanTaskDefinition` 接口
- `PLAN_GENERATION_SCHEMA` JSON Schema 定义

支持的追踪器类型：
- **inventory**: 物品收集任务
- **craft**: 合成任务
- **location**: 到达位置任务
- **composite**: 组合任务（多个追踪器的组合）

### 3. 添加规划生成请求方法

**文件**: `src/core/agent/structured/StructuredOutputManager.ts`

添加了：
- `requestPlanGeneration()`: 请求规划生成的主方法
- `requestPlanWithStructuredOutput()`: 使用结构化输出
- `requestPlanWithManualParsing()`: 手动解析降级方案
- `extractPlanResponse()`: 从文本中提取规划响应
- `validatePlanResponse()`: 验证规划响应格式

### 4. 在 GoalPlanningManager 中添加生成方法

**文件**: `src/core/agent/planning/GoalPlanningManager.ts`

添加了：
- `llmManager` 和 `structuredOutputManager` 属性
- `setLLMManager()`: 设置 LLM Manager
- `generatePlanForCurrentGoal()`: 为当前目标生成计划的核心方法

生成流程：
1. 收集游戏环境信息（位置、生命值、物品栏等）
2. 查询相关历史经验
3. 生成提示词并请求 LLM
4. 解析 LLM 响应，创建 Task 和 Tracker
5. 创建并激活 Plan

### 5. 在 Agent 中连接 LLM Manager

**文件**: `src/core/agent/Agent.ts`

修改 `initializeState()` 方法：
- 在创建 `planningManager` 后调用 `setLLMManager()` 设置 LLM Manager

### 6. 在主决策循环中添加自动生成逻辑

**文件**: `src/core/agent/loop/MainDecisionLoop.ts`

添加了：
- `checkAndGeneratePlan()`: 检查并生成计划的方法

在 `runLoopIteration()` 中添加调用：
- 在每次循环中检查是否有目标但没有计划
- 如果检测到这种情况，自动调用 LLM 生成计划
- 生成成功后自动激活计划

逻辑：
1. 检查是否有当前目标
2. 检查是否已有当前计划
3. 如果有目标但没有计划，自动生成
4. 如果目标有计划但未激活，恢复第一个计划

## 工作流程

### 初始化流程

```
Agent.initialize()
  └─> planningManager.initialize()
      └─> 加载 goal-planning.json
```

### 目标设置流程

```
Agent.setGoal("新目标")
  └─> planningManager.createGoal("新目标")
      └─> 保存到 goal-planning.json
```

### 计划生成流程

```
MainDecisionLoop.runLoopIteration()
  └─> checkAndGeneratePlan()
      └─> 检测到有目标但没有计划
          └─> planningManager.generatePlanForCurrentGoal()
              ├─> 收集环境信息
              ├─> 生成提示词
              ├─> LLM 请求（结构化输出）
              ├─> 解析响应，创建 Task 和 Tracker
              ├─> 创建 Plan
              └─> 激活 Plan，保存到 goal-planning.json
```

### 任务执行流程

```
MainDecisionLoop.runLoopIteration()
  └─> executeCurrentMode()
      └─> MainMode.execute()
          └─> executeLLMDecision()
              ├─> 收集游戏状态和任务进度
              ├─> LLM 决策动作
              └─> 执行动作
```

### 任务完成检测

```
GoalPlanningManager (每秒自动检查)
  └─> autoCheckCompletion()
      ├─> 检查所有任务的 tracker.checkCompletion()
      ├─> 如果任务完成，标记为 completed
      ├─> 自动切换到下一个任务
      └─> 保存到 goal-planning.json
```

## 持久化数据格式

### goal-planning.json

```json
{
  "currentGoalId": "goal_xxx",
  "currentPlanId": "plan_xxx",
  "currentTaskId": "task_xxx",
  "goals": [
    {
      "id": "goal_xxx",
      "description": "目标描述",
      "status": "active",
      "createdAt": 1234567890,
      "updatedAt": 1234567890,
      "planIds": ["plan_xxx"],
      "metadata": {}
    }
  ],
  "plans": [
    {
      "id": "plan_xxx",
      "title": "计划标题",
      "description": "计划描述",
      "goalId": "goal_xxx",
      "status": "active",
      "createdAt": 1234567890,
      "updatedAt": 1234567890,
      "tasks": [
        {
          "id": "task_xxx",
          "title": "任务标题",
          "description": "任务描述",
          "status": "pending",
          "tracker": {
            "type": "inventory",
            "itemName": "oak_log",
            "targetCount": 10,
            "exact": false
          },
          "dependencies": [],
          "createdAt": 1234567890,
          "updatedAt": 1234567890,
          "metadata": {}
        }
      ]
    }
  ]
}
```

## 验证方法

1. **启动 Bot**：运行 `pnpm dev`
2. **检查初始化**：查看日志中是否有 "Goal-Planning 系统初始化完成"
3. **检查目标加载**：查看是否加载了现有的目标
4. **等待计划生成**：如果有目标但没有计划，系统会自动生成
5. **查看日志**：
   - "检测到目标没有计划，开始自动生成..."
   - "LLM 生成计划: xxx (n 个任务)"
   - "成功生成并激活计划: xxx"
6. **检查文件**：查看 `data/goal-planning.json` 是否包含 plans 数组和 tasks

## 预期效果

修复后，规划系统应该：
1. ✅ 在启动时加载已有的目标和计划
2. ✅ 当有目标但没有计划时，自动调用 LLM 生成计划
3. ✅ 生成的计划包含多个任务，每个任务都有合适的追踪器
4. ✅ 任务按依赖关系顺序执行
5. ✅ 任务完成后自动切换到下一个任务
6. ✅ 所有数据自动持久化到 `goal-planning.json`

## 注意事项

1. **首次运行**：如果 `goal-planning.json` 中只有 goal 没有 plan，需要等待几秒，系统会自动生成计划
2. **LLM 配置**：确保 LLM 配置正确，否则计划生成会失败
3. **追踪器配置**：LLM 生成的追踪器必须包含正确的字段（itemName, targetCount 等）
4. **物品名称**：追踪器中的物品名称必须是 Minecraft 内部名称（如 `oak_log` 而不是 `橡木原木`）

## 相关文件

- 提示词模板: `src/core/agent/prompt/templates/plan_generation.ts`
- Schema 定义: `src/core/agent/structured/ActionSchema.ts`
- 结构化输出: `src/core/agent/structured/StructuredOutputManager.ts`
- 规划管理器: `src/core/agent/planning/GoalPlanningManager.ts`
- Agent 集成: `src/core/agent/Agent.ts`
- 决策循环: `src/core/agent/loop/MainDecisionLoop.ts`
- 数据文件: `data/goal-planning.json`

