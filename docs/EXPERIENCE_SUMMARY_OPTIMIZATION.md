# 经验总结系统优化

## 优化概述

经验总结系统已经从单条经验提取升级为**批量多条经验总结**，采用项目统一的结构化输出方式，提高了经验学习效率和准确性。

## 主要改进

### 1. 批量经验总结

**之前**：一次只总结一条经验
**现在**：一次总结 3-10 条经验

```typescript
// 典型输出示例
{
  "analysis": "最近多次因为物品名称错误导致合成失败",
  "lessons": [
    {
      "lesson": "铁镐的游戏名称是iron_pickaxe而不是iron_pick",
      "context": "多次合成尝试后发现的正确名称",
      "confidence": 0.9
    },
    {
      "lesson": "熔炉需要8个圆石（cobblestone）合成",
      "context": "成功合成熔炉的配方",
      "confidence": 0.95
    },
    {
      "lesson": "工作台需要4块木板（planks）合成",
      "context": "基础工具合成经验",
      "confidence": 1.0
    }
  ]
}
```

### 2. 统一结构化输出

**之前**：使用 `【经验】` 标签手动解析

```typescript
const experienceMatch = response.content.match(/【经验】([\s\S]*?)【/);
```

**现在**：使用项目统一的 JSON Schema + StructuredOutputManager

```typescript
// 定义 Schema
export const EXPERIENCE_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    analysis: { type: 'string' },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lesson: { type: 'string' },
          context: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

// 使用 StructuredOutputManager 请求
const summaryResponse = await this.structuredOutputManager.requestExperienceSummary(prompt, systemPrompt);
```

### 3. 优化的提示词

**关键改进点**：

- 明确要求总结多条经验（3-10条）
- 每条经验不超过100字
- 重点关注：
  - 物品名称错误
  - 合成配方
  - 操作技巧
  - 错误模式
  - 环境规律
- 提供高质量和低质量经验的示例

**示例**：

```
✅ "钻石镐的游戏名称是diamond_pickaxe"
✅ "工作台需要4块木板（planks）合成"
❌ "需要仔细规划" （太空泛）
❌ "失败是成功之母" （没有实际信息）
```

## 技术实现

### 新增文件和修改

1. **ActionSchema.ts** - 新增经验总结 Schema
   - `ExperienceSummaryResponse` 接口
   - `ExperienceLesson` 接口
   - `EXPERIENCE_SUMMARY_SCHEMA` 常量

2. **StructuredOutputManager.ts** - 新增经验总结请求方法
   - `requestExperienceSummary()` - 公共接口
   - `requestExperienceWithStructuredOutput()` - 结构化输出
   - `requestExperienceWithManualParsing()` - 降级解析
   - `validateExperienceResponse()` - 响应验证

3. **experience_summary.ts** - 优化提示词模板
   - 详细的总结要求
   - 具体的关注点
   - 高质量示例

4. **MainDecisionLoop.ts** - 重构经验总结逻辑
   - 使用 `StructuredOutputManager`
   - 批量记录多条经验
   - 改进的日志输出

### 数据流

```
决策记录 + 思维记录
        ↓
   生成提示词
        ↓
StructuredOutputManager
        ↓
   LLM (JSON模式)
        ↓
ExperienceSummaryResponse
        ↓
   验证和解析
        ↓
  批量记录经验
        ↓
   ExperienceMemory
```

## 使用场景示例

### 场景1：物品名称学习

```json
{
  "lesson": "石镐的游戏名称是stone_pickaxe",
  "context": "多次尝试使用stone_pick失败后发现",
  "confidence": 0.9
}
```

### 场景2：合成配方记忆

```json
{
  "lesson": "石镐需要3个圆石和2根木棍合成",
  "context": "成功合成石镐的完整配方",
  "confidence": 1.0
}
```

### 场景3：操作顺序

```json
{
  "lesson": "使用箱子前必须先移动到箱子附近（距离小于4格）",
  "context": "多次远距离操作失败后总结",
  "confidence": 0.85
}
```

## 优势

1. **效率提升**：一次总结多条经验，减少LLM调用次数
2. **质量保证**：结构化输出确保格式正确，易于解析
3. **可维护性**：统一的解析方式，便于调试和扩展
4. **灵活性**：支持降级到手动解析，兼容性好
5. **实用性**：关注具体可操作的经验，避免空泛总结

## 配置

经验总结默认每10次决策循环执行一次：

```typescript
// MainDecisionLoop.ts
if (this.evaluationCounter % 10 === 0) {
  await this.summarizeExperience();
}
```

可根据需要调整频率。

## 未来改进方向

1. **语义去重**：避免记录重复或相似的经验
2. **优先级排序**：根据重要性和实用性对经验排序
3. **经验检索**：基于当前任务智能检索相关经验
4. **经验验证**：通过实践验证经验的正确性
5. **经验泛化**：将具体经验抽象为通用规则

## 测试建议

1. 让机器人尝试多次合成同一物品（物品名错误）
2. 观察经验总结是否能正确提取物品名称
3. 检查经验记录的置信度是否合理
4. 验证经验内容是否简短实用（<100字）
