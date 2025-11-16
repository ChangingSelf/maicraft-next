# 挖掘(MineBlock)动作设计文档

## 概述

本文档定义了挖掘(MineBlock)相关动作的设计规范，基于maicraft-next的一体化agent架构理念，充分吸收了maicraft和maicraft-mcp-server项目的经验。设计遵循简单易用、语义明确的原则，提供三个核心挖掘动作，支持简化的安全检查机制，覆盖绝大多数挖掘场景，让agent能够高效地进行资源获取和环境改造。

## 设计原则

1. **单一职责** - 每个动作专注于一种挖掘场景，避免参数复杂化
2. **语义明确** - 动作名称直接表达挖掘方式和意图，消除歧义
3. **参数简洁** - 只包含必要参数，避免复杂组合，超时由动作系统统一管理
4. **智能决策** - 自动处理工具选择、安全检查等细节
5. **安全可控** - 提供简化的安全检查机制，支持必要的绕过功能
6. **容错友好** - 提供清晰的错误信息和解决建议
7. **中文支持** - 完整的中文方块名称支持
8. **一体化集成** - 与GameState无缝集成，状态透明访问

## 挖掘动作架构

### 简化架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Mine Action Family                      │
│                       (挖掘动作家族)                         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ MineAt      │  │ MineBy      │  │ MineIn      │          │
│  │ Position    │  │ Type        │  │ Direction   │          │
│  │ Action      │  │ Action      │  │ Action      │          │
│  │             │  │             │  │             │          │
│  │ 坐标精准挖掘  │  │ 类型批量挖掘  │  │ 方向连续挖掘  │          │
│  │ 指定位置     │  │ 附近搜索     │  │ 隧道挖掘     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────────────────────┐
              │         MineUtils                     │
              │      (挖掘工具类 - 共享基础设施)       │
              │                                      │
              │  ┌────────────────────────────────┐  │
              │  │   Block Analysis               │  │
              │  │  方块分析 - 类型检查、位置验证   │  │
              │  └────────────────────────────────┘  │
              │                                      │
              │  ┌────────────────────────────────┐  │
              │  │   Tool Management              │  │
              │  │  工具管理 - 自动选择、装备验证   │  │
              │  └────────────────────────────────┘  │
              │                                      │
              │  ┌────────────────────────────────┐  │
              │  │   Safety Checker              │  │
              │  │  安全检查 - 简化验证、强制绕过   │  │
              │  └────────────────────────────────┘  │
              │                                      │
              │  ┌────────────────────────────────┐  │
              │  │   Collection Logic             │  │
              │  │  收集逻辑 - 掉落物处理           │  │
              │  └────────────────────────────────┘  │
              └──────────────────────────────────────┘
```

## 三个核心挖掘动作设计

### 1. MineAtPositionAction - 在指定位置精准挖掘

**动作ID**: `MINE_AT_POSITION`

**描述**: 在指定三维坐标位置精准挖掘方块，名称明确表示"在位置"挖掘

**使用场景**:
- 挖掘特定位置的矿物（钻石矿、铁矿等）
- 清理建筑中的特定方块
- 精准破坏障碍物
- 测试和调试特定坐标

**参数**:
```typescript
interface MineAtPositionParams {
  x: number;                    // 目标X坐标（必需）
  y: number;                    // 目标Y坐标（必需）
  z: number;                    // 目标Z坐标（必需）
  count?: number;               // 挖掘数量（默认1，可选）
  force?: boolean;              // 强制挖掘，绕过安全检查（默认false，可选）
  collect?: boolean;            // 是否收集掉落物（默认true，可选）
}
```

**示例**:
```json
{
  "action_type": "MINE_AT_POSITION",
  "x": 100,
  "y": 64,
  "z": 200,
  "count": 3
}
```

```json
{
  "action_type": "MINE_AT_POSITION",
  "x": 50,
  "y": 12,
  "z": -30,
  "force": true
}
```

**实现要点**:
- **坐标验证**: 检查坐标的有效性和方块存在性
- **安全检查**: 简化的安全检查，支持force参数强制绕过
- **工具选择**: 自动装备最合适的挖掘工具
- **精确挖掘**: 直接挖掘目标位置的方块
- **批量支持**: 支持在相同位置连续挖掘多个方块

---

### 2. MineByTypeAction - 按类型挖掘方块

**动作ID**: `MINE_BY_TYPE`

**描述**: 按方块类型搜索并挖掘方块，支持附近搜索和方向性挖掘

**使用场景**:
- 批量收集矿物资源（铁矿、煤矿等）
- 清理指定类型的方块（清理圆石、泥土等）
- 收集建筑材料（木头、石头等）
- 环境清理和改造
- 定向资源收集

**参数**:
```typescript
interface MineByTypeParams {
  blockType: string;            // 方块类型名称（必需）
  count?: number;               // 挖掘数量（默认1，可选）
  radius?: number;              // 搜索半径（默认32，可选）
  direction?: string;           // 挖掘方向（可选，支持"+x","-x","+y","-y","+z","-z"）
  force?: boolean;              // 强制挖掘，绕过安全检查（默认false，可选）
  collect?: boolean;            // 是否收集掉落物（默认true，可选）
}
```

**参数说明**:
- `blockType`: 方块类型名称，支持中文和英文名称（如"钻石矿"、"diamond_ore"）
- `count`: 挖掘数量，默认为1，支持批量挖掘
- `radius`: 搜索半径，默认32格，限制搜索范围提高效率
- `direction`: 可选的方向参数，支持定向挖掘
- `force`: 强制挖掘参数，绕过安全检查
- `collect`: 是否收集掉落物，默认true

**示例**:
```json
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "iron_ore",
  "count": 5
}
```

```json
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "橡木",
  "count": 10,
  "radius": 50
}
```

```json
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "stone",
  "direction": "+y",
  "count": 20
}
```

**实现要点**:
- **智能搜索**: 在指定半径内高效搜索目标方块
- **方向支持**: 支持沿指定方向进行定向挖掘
- **批量优化**: 优化挖掘路径，提高批量挖掘效率
- **中文支持**: 完整的中文方块名称映射

---

### 3. MineInDirectionAction - 沿方向连续挖掘

**动作ID**: `MINE_IN_DIRECTION`

**描述**: 沿指定方向连续挖掘，创建隧道或矿井

**使用场景**:
- 开采水平隧道（+x, -x, +z, -z方向）
- 挖掘垂直矿井（+y向上, -y向下）
- 大规模地形改造
- 创建建筑空间

**参数**:
```typescript
interface MineInDirectionParams {
  direction: string;            // 挖掘方向（必需，支持"+x","-x","+y","-y","+z","-z"）
  count?: number;               // 挖掘数量（默认10，可选）
  force?: boolean;              // 强制挖掘，绕过安全检查（默认false，可选）
  collect?: boolean;            // 是否收集掉落物（默认true，可选）
}
```

**示例**:
```json
{
  "action_type": "MINE_IN_DIRECTION",
  "direction": "+x",
  "count": 20
}
```

```json
{
  "action_type": "MINE_IN_DIRECTION",
  "direction": "-y",
  "count": 30,
  "collect": true
}
```

**实现要点**:
- **方向计算**: 精确计算六轴方向的挖掘路径
- **连续挖掘**: 沿方向逐个挖掘，支持大量连续操作
- **智能跳过**: 自动跳过空气、流体等无需挖掘的方块
- **进度跟踪**: 实时反馈挖掘进度和状态

---

## 简化的安全检查系统

### 核心安全原则
1. **默认最安全**: 默认启用完整安全检查，适合生产环境
2. **简单控制**: 通过`force`参数提供绕过机制，给LLM二次确认机会
3. **明确风险**: 绕过安全检查时提供明确的警告信息

### 安全检查内容
- **流体检查**: 防止挖掘水、岩浆等流体方块
- **掉落物检查**: 防止被上方掉落的方块砸伤
- **工具检查**: 确保有合适的挖掘工具
- **不可破坏检查**: 防止尝试挖掘基岩等不可破坏方块
- **可见性检查**: 防止挖掘不可见的方块

### 简化参数设计
```typescript
interface MineSafetyOptions {
  force?: boolean;     // 强制挖掘，绕过所有安全检查（默认false）
  collect?: boolean;   // 是否收集掉落物（默认true）
}
```

### 安全级别

#### 1. 标准模式（force: false，默认）
- **完整安全检查**: 所有安全检查都启用
- **推荐场景**: 生产环境、自动挖掘、未知环境
- **安全性**: 高风险防护，适合AI自主操作

#### 2. 强制模式（force: true）
- **绕过所有检查**: 仅保留最基本的验证
- **使用场景**: 明确知道需要绕过检查的特殊情况
- **安全警告**: 系统会记录并警告强制模式的使用

### 实际使用建议

```typescript
// 推荐：标准模式（默认）
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "iron_ore",
  "count": 5
}

// 特殊情况：强制模式（需要明确理由）
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "diamond_ore",
  "count": 1,
  "force": true  // 仅在确实需要时使用
}
```

## 核心实现系统

### 1. MineUtils - 挖掘工具类

```typescript
export class MineUtils {
  private bot: Bot;
  private logger: Logger;
  private blockNames: Map<string, string>; // 中文到英文名称映射
  private safetyChecker: MineSafetyChecker;

  constructor(bot: Bot, logger: Logger) {
    this.bot = bot;
    this.logger = logger;
    this.blockNames = this.loadBlockNameMapping();
    this.safetyChecker = new MineSafetyChecker(bot, logger);
  }

  // 主要挖掘方法
  async digBlock(position: Vec3, options: MineOptions = {}): Promise<ActionResult> {
    try {
      // 1. 获取目标方块
      const block = this.bot.blockAt(position);
      if (!block || block.name === 'air') {
        return this.createErrorResult('目标位置没有方块或为空气', 'NO_BLOCK');
      }

      // 2. 安全检查（简化版本）
      const safetyCheck = await this.safetyChecker.performSafetyCheck(block, position, options.force || false);
      if (!safetyCheck.safe) {
        const message = `${safetyCheck.reason}。${safetyCheck.suggestion || ''}`;
        return this.createErrorResult(message, 'SAFETY_CHECK_FAILED');
      }

      // 3. 警告记录
      if (safetyCheck.warnings) {
        for (const warning of safetyCheck.warnings) {
          this.logger.warn(`⚠️  ${warning}`);
        }
      }

      // 4. 工具装备（仅在非强制模式）
      if (!options.force) {
        const toolResult = await this.equipBestTool(block);
        if (!toolResult.success) {
          return this.createErrorResult(toolResult.message, 'TOOL_ERROR');
        }
      }

      // 5. 执行挖掘
      await this.bot.dig(block);

      // 6. 收集掉落物（可选）
      if (options.collect !== false) {
        await this.collectDrops();
      }

      return this.createSuccessResult(`成功挖掘 ${block.name}`, {
        blockType: block.name,
        position: position
      });
    } catch (error) {
      const err = error as Error;
      return this.createErrorResult(`挖掘失败: ${err.message}`, 'DIG_ERROR', err);
    }
  }

  // 搜索附近方块
  async findNearbyBlocks(blockType: string, radius: number = 32): Promise<Vec3[]> {
    const normalizedType = this.normalizeBlockName(blockType);
    const positions = this.bot.findBlocks({
      matching: this.bot.registry.blocksByName[normalizedType]?.id,
      maxDistance: radius,
      count: 100
    });

    return positions.map(pos => new Vec3(pos.x, pos.y, pos.z));
  }

  // 方块名称标准化
  normalizeBlockName(name: string): string {
    const normalizedName = name.toLowerCase().trim();
    return this.blockNames.get(normalizedName) || normalizedName;
  }
}

// 挖掘选项接口
interface MineOptions {
  force?: boolean;     // 强制挖掘，绕过安全检查
  collect?: boolean;   // 是否收集掉落物
}
```

### 2. MineSafetyChecker - 安全检查器

```typescript
class MineSafetyChecker {
  async performSafetyCheck(block: Block, position: Vec3, force: boolean = false): Promise<SafetyResult> {
    // 强制模式：绕过所有安全检查
    if (force) {
      return { safe: true, warnings: ['已绕过所有安全检查'] };
    }

    // 标准模式：完整安全检查
    const checks = [
      () => this.checkFluidBlock(block),
      () => this.checkUnbreakableBlock(block),
      () => this.checkFallingBlock(position),
      () => this.checkToolAvailability(block),
      () => this.checkVisibility(block)
    ];

    for (const check of checks) {
      const result = await check();
      if (!result.safe) {
        return result;
      }
    }

    return { safe: true };
  }

  private checkFluidBlock(block: Block): SafetyResult {
    if (BlockAnalyzer.isFluidBlock(block)) {
      return {
        safe: false,
        reason: `无法挖掘流体方块: ${block.name}`,
        suggestion: '请先处理流体，或使用force参数强制挖掘'
      };
    }
    return { safe: true };
  }

  private checkUnbreakableBlock(block: Block): SafetyResult {
    if (BlockAnalyzer.isUnbreakableBlock(block)) {
      return {
        safe: false,
        reason: `无法破坏的方块: ${block.name}`,
        suggestion: '此方块无法被破坏，请选择其他目标'
      };
    }
    return { safe: true };
  }

  private checkFallingBlock(position: Vec3): SafetyResult {
    const aboveBlock = this.bot.blockAt(position.offset(0, 1, 0));
    if (aboveBlock && BlockAnalyzer.isFallingBlock(aboveBlock)) {
      return {
        safe: false,
        reason: `上方有掉落方块: ${aboveBlock.name}`,
        suggestion: '请先清理上方掉落物，或使用force参数强制挖掘'
      };
    }
    return { safe: true };
  }

  private checkToolAvailability(block: Block): SafetyResult {
    const tool = this.bot.pathfinder.bestHarvestTool(block);
    if (!tool && block.hardness > 0) {
      return {
        safe: false,
        reason: `需要合适工具挖掘: ${block.name}`,
        suggestion: '请装备合适的工具，或使用force参数强制挖掘'
      };
    }
    return { safe: true };
  }

  private checkVisibility(block: Block): SafetyResult {
    if (!this.bot.canSeeBlock(block)) {
      return {
        safe: false,
        reason: '目标方块不可见',
        suggestion: '请移动到可见位置，或使用force参数强制挖掘'
      };
    }
    return { safe: true };
  }
}

// 安全检查结果接口
interface SafetyResult {
  safe: boolean;
  reason?: string;
  suggestion?: string;
  warnings?: string[];
}
```

### 3. BlockAnalyzer - 方块分析器

```typescript
export class BlockAnalyzer {
  // 检查是否为流体方块
  static isFluidBlock(block: Block): boolean {
    const fluidTypes = ['water', 'lava', 'flowing_water', 'flowing_lava'];
    return fluidTypes.includes(block.name);
  }

  // 检查是否为不可破坏方块
  static isUnbreakableBlock(block: Block): boolean {
    const unbreakableTypes = ['bedrock', 'end_portal', 'end_portal_frame', 'command_block', 'barrier'];
    return unbreakableTypes.includes(block.name);
  }

  // 检查是否为掉落方块
  static isFallingBlock(block: Block): boolean {
    const fallingTypes = ['sand', 'gravel', 'anvil', 'white_concrete_powder'];
    return fallingTypes.some(type => block.name.includes(type));
  }
}
```

## 简化后的设计优势

### 1. **参数大幅简化**
- **原设计**: 14个复杂参数，多层嵌套选项
- **新设计**: 最多6个简单参数，见名知义

### 2. **安全检查简化**
- **原设计**: 3个安全级别 × 6个绕过选项 = 18种组合
- **新设计**: 1个`force`参数，0或1的简单选择

### 3. **语义更清晰**
```typescript
// 原设计 - 复杂难懂
{
  safetyLevel: "adventure",
  bypassFluidCheck: true,
  bypassToolCheck: true,
  enableXRay: true
}

// 新设计 - 简单明了
{
  force: true  // 强制挖掘，绕过所有安全检查
}
```

### 4. **LLM友好**
- **参数数量减少**: 降低LLM理解难度
- **命名更直观**: `force`比`safetyLevel`更容易理解
- **默认值合理**: 大多数情况下使用默认值即可

### 5. **实际使用场景覆盖**
基于maicraft-mcp-server的实际使用分析，新设计覆盖了所有高频使用场景：

```typescript
// 1. 基础挖掘（80%的使用场景）
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "iron_ore",
  "count": 5
}

// 2. 方向挖掘（15%的使用场景）
{
  "action_type": "MINE_BY_TYPE",
  "blockType": "stone",
  "direction": "+y",
  "count": 10
}

// 3. 强制挖掘（5%的使用场景）
{
  "action_type": "MINE_AT_POSITION",
  "x": 100, "y": 12, "z": -50,
  "force": true
}
```

## 注册规范

### ActionIds定义

```typescript
// src/core/actions/ActionIds.ts
export const ActionIds = {
  // ... 其他动作
  MINE_AT_POSITION: 'MINE_AT_POSITION',
  MINE_BY_TYPE: 'MINE_BY_TYPE',
  MINE_IN_DIRECTION: 'MINE_IN_DIRECTION',
} as const;
```

### 动作注册

```typescript
// src/core/actions/implementations/index.ts
export { MineAtPositionAction } from './MineAtPositionAction';
export { MineByTypeAction } from './MineByTypeAction';
export { MineInDirectionAction } from './MineInDirectionAction';
```

### 类型映射

```typescript
// src/core/actions/types.ts
export interface ActionParamsMap {
  // ... 其他动作
  [ActionIds.MINE_AT_POSITION]: MineAtPositionParams;
  [ActionIds.MINE_BY_TYPE]: MineByTypeParams;
  [ActionIds.MINE_IN_DIRECTION]: MineInDirectionParams;
}
```

---

_设计文档版本: 2.0_
_创建日期: 2025-11-15_