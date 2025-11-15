# Basic Info 提示词缺失问题修复

## 问题描述

用户发现 LLM **完全无法感知环境、目标、计划和任务**，经过检查发现 `basic_info` 提示词从未被生成和拼接到主提示词中。

## 问题分析

### 错误的代码逻辑

在 `PromptDataCollector.collectAllData()` 中：

```typescript
collectAllData(): MainThinkingData {
  const basicInfo = this.collectBasicInfo();  // 返回 BasicInfoData

  return {
    basic_info: basicInfo.basic_info || '', // ❌ basicInfo 根本没有这个属性！
    ...
  };
}
```

### 数据流问题

1. **收集阶段**：`collectBasicInfo()` 收集了所有基础数据（goal, inventory, position 等）
2. **格式化阶段**：**缺失！** 应该用 `promptManager.generatePrompt('basic_info', basicInfo)` 生成提示词
3. **使用阶段**：`basic_info` 永远是空字符串 `''`

### 导致的后果

LLM 收到的提示词类似这样：

```
{空字符串}  ← basic_info 应该在这里

{available_actions}

**关于规划系统**
...

**思考/执行的记录**
...
```

**LLM 看不到**：

- ❌ 当前目标和任务规划
- ❌ 生命值、饥饿值等状态
- ❌ 物品栏内容
- ❌ 当前位置
- ❌ 周围方块信息
- ❌ 周围箱子信息
- ❌ 周围实体信息
- ❌ 聊天记录

**结果**：LLM 完全"瞎了"，无法做出合理的决策。

## 修复方案

### 1. 添加 promptManager 导入

```typescript
import { promptManager } from '../prompt';
```

### 2. 修复 collectAllData()

```diff
  collectAllData(): MainThinkingData {
    const basicInfo = this.collectBasicInfo();
    const dynamicActions = this.collectDynamicActions();
    const memoryData = this.collectMemoryData();

+   // 生成 basic_info 提示词
+   const basicInfoPrompt = promptManager.generatePrompt('basic_info', basicInfo);

    return {
-     basic_info: basicInfo.basic_info || '', // 需要从外部生成
+     basic_info: basicInfoPrompt,
      available_actions: this.actionPromptGenerator.generatePrompt(),
      ...dynamicActions,
      ...memoryData,
      nearby_block_info: basicInfo.nearby_block_info,
      position: basicInfo.position,
      chat_str: basicInfo.chat_str,
      judge_guidance: this.getJudgeGuidance(),
+     goal: basicInfo.goal,
    };
  }
```

### 3. 简化 collectMainThinkingData()

这个方法现在只是 `collectAllData()` 的别名：

```typescript
collectMainThinkingData(): MainThinkingData {
  return this.collectAllData();
}
```

## 修复后的数据流

```
1. collectBasicInfo()
   ↓
   返回 {
     goal: "建造木屋",
     to_do_list: "🎯 当前目标...",
     inventory_info: "oak_log×10, ...",
     position: "位置: (100, 64, 200)",
     ...
   }

2. promptManager.generatePrompt('basic_info', basicInfo)
   ↓
   生成完整的 basic_info 字符串：
   """
   你是AI Bot，游戏名叫Bot...

   **当前目标和任务规划**
   目标：建造木屋

   🎯 当前目标: 建造木屋
   📋 收集木材 (1/3)
     🔄 收集橡木原木 (100%)
     ⏳ 合成木板
     ...

   **当前状态**
   生命值: 20/20, 饥饿值: 18/20

   **物品栏和工具**
   oak_log×10, stone_pickaxe×1
   ...
   """

3. 拼接到 main_thinking 提示词
   ↓
   LLM 能看到完整的游戏状态！
```

## 验证修复

### 重启后检查日志

查找类似的日志：

```
💭 生成提示词完成
```

### 检查 LLM 决策

如果修复成功，LLM 应该能够：

- ✅ 了解当前目标和任务
- ✅ 根据物品栏状态做决策
- ✅ 根据周围方块信息采取行动
- ✅ 根据生命值/饥饿值判断是否需要吃东西

### 测试方法

1. 设置一个简单目标
2. 观察 LLM 是否能正确理解任务
3. 检查是否会根据环境做出合理决策

## basic_info 模板内容

修复后，LLM 会收到完整的 `basic_info`，包含：

```
你是{bot_name}，游戏名叫{player_name},你正在游玩1.18.5以上版本的Minecraft。
生命值: 20/20, 饥饿值: 18/20

**当前目标和任务规划**
目标：{goal}

{to_do_list}

说明：任务系统会自动追踪你的进度，完成后会自动切换到下一个任务。
你只需要专注执行动作来完成当前任务的目标。

**当前状态**
生命值: 20/20, 饥饿值: 18/20, 等级: 0

**物品栏和工具**
oak_log×10, stone_pickaxe×1, ...

**位置信息**
位置: (100, 64, 200)

**周围方块的信息**
附近重要方块 (5个):
  oak_log at (102, 64, 201) [距离: 2.2格]
  crafting_table at (100, 64, 205) [距离: 5.0格]
  ...

**周围箱子信息**
附近容器 (2个):
  chest: 存储箱 at (95, 64, 200) [距离: 5.0格]
    物品: oak_log×32, stone×64
  ...

**周围实体信息**
cow (5.2m), sheep (8.1m), ...

**玩家聊天记录**
暂无聊天记录
```

## 影响范围

这个 bug 影响了：

- ✅ MainMode - 主决策模式
- ❓ ChatLoop - 可能也受影响，需要检查
- ❓ 其他模式 - 需要检查是否也使用了 PromptDataCollector

## 总结

这是一个**严重的架构级 bug**：

- 提示词收集器收集了数据但没有格式化
- 导致 LLM 完全"看不见"游戏状态
- 修复方法很简单：调用 `promptManager.generatePrompt('basic_info', basicInfo)`

修复后，LLM 终于能够正确感知环境并做出合理决策了！
