# Move动作设计文档

## 概述

本文档定义了Move相关动作的设计规范，作为其他动作设计的参考模板。Move动作采用多动作系统，每个动作专注于特定的移动场景。

## 设计原则

1. **单一职责** - 每个动作只处理一种移动类型
2. **语义明确** - 动作名称直接表达意图
3. **参数简洁** - 只包含必要参数，避免复杂组合，超时控制由动作系统统一管理，不需要超时参数
4. **复用基础设施** - 移动逻辑通过MovementUtils统一实现

## Move动作列表

### 1. MoveAction - 移动到精确坐标

**动作ID**: `MOVE`

**描述**: 移动到指定的三维坐标位置

**使用场景**:

- 移动到已知的精确位置
- 基于计算结果的目标位置
- 调试和测试特定坐标

**参数**:

```typescript
interface MoveParams {
  x: number; // 目标X坐标（必需）
  y: number; // 目标Y坐标（必需）
  z: number; // 目标Z坐标（必需）
}
```

**示例**:

```json
{
  "action_type": "MOVE",
  "x": 100,
  "y": 64,
  "z": 200
}
```

**实现要点**:

- 使用MovementUtils.moveToCoordinate()
- 验证坐标参数完整性
- 支持超时控制

---

### 2. MoveToLocationAction - 移动到命名位置

**动作ID**: `MOVE_TO_LOCATION`

**描述**: 移动到预先保存的命名位置

**使用场景**:

- 移动到基地、家、农场等已知位置
- 导航到已标记的重要地点
- 位置间的快速移动

**参数**:

```typescript
interface MoveToLocationParams {
  locationName: string; // 位置名称（必需）
  reachDistance?: number; // 到达距离（默认1，可选）
}
```

**示例**:

```json
{
  "action_type": "MOVE_TO_LOCATION",
  "locationName": "home",
  "reachDistance": 2
}
```

**实现要点**:

- 通过LocationManager查找位置坐标
- 位置不存在时返回错误
- 支持自定义到达距离

---

### 3. MoveToEntityAction - 移动到实体附近

**动作ID**: `MOVE_TO_ENTITY`

**描述**: 移动到指定类型的实体附近或跟随实体

**使用场景**:

- 跟随其他玩家
- 接近动物、怪物等生物
- 与实体交互前的接近

**参数**:

```typescript
interface MoveToEntityParams {
  entityName: string; // 实体名称或类型（必需）
  entityType: 'player' | 'mob' | 'animal' | 'hostile' | 'passive' | 'any'; // 实体类型（必需）
  followDistance?: number; // 跟随距离（默认3，可选）
  maxDistance?: number; // 最大搜索距离（默认100，可选）
  continuous?: boolean; // 是否持续跟随（默认false，可选）
}
```

**示例**:

```json
{
  "action_type": "MOVE_TO_ENTITY",
  "entityName": "player123",
  "entityType": "player",
  "followDistance": 3,
  "continuous": false
}
```

**实现要点**:

- 通过MovementUtils.moveToEntity()实现
- 支持不同实体类型的过滤
- 持续跟随模式需要额外处理

---

### 4. MoveToBlockAction - 移动到方块附近

**动作ID**: `MOVE_TO_BLOCK`

**描述**: 移动到指定类型的方块附近，便于交互

**使用场景**:

- 接近矿物进行挖掘
- 靠近箱子、熔炉等交互方块
- 寻找特定资源方块

**参数**:

```typescript
interface MoveToBlockParams {
  blockType: string; // 方块类型名称（必需）
  reachDistance?: number; // 交互距离（默认4，可选）
  searchRadius?: number; // 搜索半径（默认64，可选）
}
```

**示例**:

```json
{
  "action_type": "MOVE_TO_BLOCK",
  "blockType": "chest",
  "reachDistance": 4,
  "searchRadius": 50
}
```

**实现要点**:

- 通过MovementUtils.moveToBlock()实现
- 使用bot.findBlocks()查找目标方块
- 方块不存在时返回错误

---

## 实现规范

### 类结构

```typescript
export class MoveAction extends BaseAction<MoveParams> {
  readonly id = ActionIds.MOVE;
  readonly name = 'MoveAction';
  readonly description = '移动到指定坐标';

  async execute(context: RuntimeContext, params: MoveParams): Promise<ActionResult> {
    // 1. 参数验证
    // 2. 调用MovementUtils
    // 3. 结果处理和日志
    // 4. 返回ActionResult
  }

  getParamsSchema(): any {
    // 返回参数的JSON Schema
  }
}
```

### 统一错误处理

- **参数错误**: 返回具体的参数验证错误信息
- **执行错误**: 包含错误描述和可选的错误对象
- **状态报告**: 成功时包含详细的位置和状态信息

### 日志规范

```typescript
// 开始
context.logger.info(`开始移动: ${description}`);

// 成功
context.logger.info(`移动成功: ${details}`);

// 失败
context.logger.warn(`移动失败: ${error}`);
```

## 注册规范

### ActionIds定义

```typescript
// src/core/actions/ActionIds.ts
export const ActionIds = {
  // ... 其他动作
  MOVE: 'MOVE',
  MOVE_TO_LOCATION: 'MOVE_TO_LOCATION',
  MOVE_TO_ENTITY: 'MOVE_TO_ENTITY',
  MOVE_TO_BLOCK: 'MOVE_TO_BLOCK',
} as const;
```

### 动作注册

```typescript
// src/core/actions/implementations/index.ts
export { MoveAction } from './MoveAction';
export { MoveToLocationAction } from './MoveToLocationAction';
export { MoveToEntityAction } from './MoveToEntityAction';
export { MoveToBlockAction } from './MoveToBlockAction';
```

### 类型映射

```typescript
// src/core/actions/types.ts
export interface ActionParamsMap {
  // ... 其他动作
  [ActionIds.MOVE]: MoveParams;
  [ActionIds.MOVE_TO_LOCATION]: MoveToLocationParams;
  [ActionIds.MOVE_TO_ENTITY]: MoveToEntityParams;
  [ActionIds.MOVE_TO_BLOCK]: MoveToBlockParams;
}
```

## 文档更新

新增或修改动作时需要：

1. 更新本文档
2. 更新ActionIds常量
3. 更新类型映射
4. 更新导出列表
5. 添加相应的测试用例

---

## 设计决策记录

### 为什么选择多动作系统？

1. **LLM友好**: 动作名称直接表达意图，减少理解错误
2. **参数简洁**: 每个动作的参数组合简单明确
3. **易于维护**: 每个动作职责单一，便于测试和调试
4. **扩展性好**: 新增移动类型时不影响现有动作

### 为什么MovementUtils是共享的？

1. **避免重复**: 所有移动动作都依赖相同的底层路径寻找逻辑
2. **一致性**: 保证所有移动行为的一致性
3. **维护便利**: 路径寻找算法的改进会惠及所有动作
4. **测试简化**: 核心移动逻辑可以独立测试
