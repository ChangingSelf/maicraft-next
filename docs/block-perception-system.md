# 方块感知系统

## 概述

全新的方块感知系统，参考 maicraft 项目实现，提供了更智能、更全面的环境感知能力，让 AI 能够准确理解周围环境。

## 问题背景

### 之前的问题

1. **方块信息被过度过滤**：只显示"重要方块"（chest、ore等），忽略了water、lava等环境方块
2. **缓存系统也过滤空气**：`scanNearbyBlocks` 跳过了 type=0 的方块
3. **环境感知不足**：AI 经常在水中游泳而不自知，无法准确判断所处环境

### 解决方案

参考 maicraft 项目的 `nearby_block.py` 实现，构建了完整的方块感知系统。

## 核心组件

### 1. NearbyBlockManager (`src/core/cache/NearbyBlockManager.ts`)

新增的方块管理器，负责智能地收集、格式化和展示方块信息。

#### 主要功能

- **环境状况检测**：特别关注水、岩浆等环境方块
- **方块分组展示**：按类型分组，智能压缩坐标信息
- **优先级排序**：重要方块优先展示
- **可放置位置检测**：分析哪些位置可以放置方块

#### 核心方法

```typescript
// 获取可见方块信息（格式化的字符串）
getVisibleBlocksInfo(position: BlockPosition, distance: number = 16): string

// 获取可放置方块的位置
getPlaceablePositions(position: BlockPosition, distance: number = 5): string
```

#### 输出格式示例

```
【环境状况】
⚠️ 警告：你正在水中！(x=100, y=65, z=200)
  - 在水中移动速度会变慢
  - 需要注意氧气值，避免溺水
脚下方块：dirt (x=100, y=64, z=200)
周围有大量水方块(156个)，你可能在海洋、河流或湖泊中

【周围方块】
  water (156个): 最近(100,65,200), 范围[x=92~108, y=62~68, z=192~208]
  dirt (45个): 最近(100,64,200), 范围[x=95~105, y=60~65, z=195~205]
  stone (89个): 最近(98,59,199), 范围[x=90~110, y=50~60, z=190~210]
  ...

【位置信息】
玩家所在位置: x=100, y=65, z=200
玩家头部位置: x=100, y=66, z=200
方块总数: 342 | 方块种类: 12
```

### 2. GameState 更新

#### 修改点

1. **导入 NearbyBlockManager**

```typescript
import { NearbyBlockManager } from '@/core/cache/NearbyBlockManager';
```

2. **添加实例属性**

```typescript
nearbyBlockManager: NearbyBlockManager | null = null;
```

3. **初始化方法**

```typescript
this.nearbyBlockManager = new NearbyBlockManager(this.blockCache);
```

4. **添加访问方法**

```typescript
getNearbyBlockManager(): NearbyBlockManager | null {
  return this.nearbyBlockManager;
}
```

#### scanNearbyBlocks 更新

**之前**：

```typescript
if (block && block.type !== 0) {
  // 不是空气方块
  blocks.push(...);
}
```

**现在**：

```typescript
if (block) {
  // 缓存所有方块，包括空气方块
  // 这对环境感知非常重要（如检测水、岩浆等）
  blocks.push(...);
}
```

### 3. PromptDataCollector 更新

#### 之前的逻辑

```typescript
// 过滤重要方块
const importantPatterns = [
  'chest', 'furnace', 'ore', 'log', ...
];
const importantBlocks = nearbyBlocks.filter(block =>
  importantPatterns.some(pattern => block.name.includes(pattern))
);
```

#### 现在的逻辑

```typescript
// 优先使用 NearbyBlockManager
const nearbyBlockManager = gameState.getNearbyBlockManager?.();
if (nearbyBlockManager) {
  return nearbyBlockManager.getVisibleBlocksInfo({ x: blockPosition.x, y: blockPosition.y, z: blockPosition.z }, 16);
}

// 降级方案：不过滤方块，显示所有方块（除了普通空气）
const validBlocks = nearbyBlocks.filter(block => block.name !== 'air');
```

### 4. 提示词模板优化

在 `main_thinking.ts` 中增强了游戏指南：

```typescript
**游戏指南**
3.**仔细阅读"周围方块的信息"和"环境状况"**，这非常重要：
  - 如果提示你在水中，说明你正在游泳，移动速度会很慢，需要尽快离开水体
  - 如果周围有大量水方块，你可能在海洋、河流或湖泊中
  - 如果脚下是水方块，你可能正漂浮在水面上
  - 注意岩浆方块的位置，避免靠近以免受伤
4.根据你的**位置信息**和**周围方块信息**，准确评估所处环境：建筑物/洞穴/矿道/地面/森林/冰原/沙漠/水体/海洋
```

## 技术细节

### 方块分组策略

1. **跳过普通空气**：过滤 `air` 方块，但保留 `cave_air`（可能有特殊意义）
2. **优先级方块**：水、岩浆、箱子、矿石等优先显示
3. **数量排序**：其他方块按数量从多到少排序
4. **限制显示**：最多显示前20种其他方块类型，避免信息过载

### 坐标压缩算法

对于大量同类方块，智能压缩坐标表示：

- **少量方块（≤3个）**：直接列出坐标
- **中等数量（≤6个）**：列出最近的几个
- **大量方块（>6个）**：显示最近3个 + 范围表示

示例：

```
water (156个): 最近(100,65,200), (101,65,200), (100,66,200), 范围[x=92~108, y=62~68, z=192~208]
```

### 环境检测逻辑

```typescript
// 1. 检查脚下方块（玩家所在位置）
const blockAtFeet = this.blockCache.getBlock(position.x, position.y, position.z);
if (blockAtFeet.name === 'water') {
  // 警告：正在水中
}

// 2. 检查脚下支撑方块
const blockBelow = this.blockCache.getBlock(position.x, position.y - 1, position.z);
if (!blockBelow || blockBelow.name === 'air') {
  // 警告：可能在空中或正在下坠
}

// 3. 统计周围水方块数量
const waterBlocks = groupedBlocks['water'] || [];
if (waterBlocks.length > 10) {
  // 提示：可能在海洋、河流或湖泊中
}
```

## 使用效果

### Before（旧系统）

```
**周围方块的信息**
附近没有重要方块
```

AI 无法感知到周围的水，持续在海洋中游泳。

### After（新系统）

```
**周围方块的信息**

【环境状况】
⚠️ 警告：你正在水中！(x=100, y=65, z=200)
  - 在水中移动速度会变慢
  - 需要注意氧气值，避免溺水
脚下方块：water (x=100, y=64, z=200)
周围有大量水方块(156个)，你可能在海洋、河流或湖泊中

【周围方块】
  water (156个): 最近(100,65,200), (101,65,200), (100,66,200), 范围[x=92~108, y=62~68, z=192~208]
  sand (32个): 最近(95,63,198), 范围[x=90~100, y=60~65, z=195~205]
  kelp (15个): 最近(98,62,197), 范围[x=95~105, y=60~65, z=195~200]
  ...

【位置信息】
玩家所在位置: x=100, y=65, z=200
玩家头部位置: x=100, y=66, z=200
方块总数: 342 | 方块种类: 12
```

AI 能够清楚地知道自己在水中，并采取行动离开。

## 性能考虑

### 内存优化

1. **缓存大小限制**：`maxEntries: 5000`
2. **过期时间**：1小时自动清理
3. **智能扫描**：15秒扫描一次，半径12格

### 计算优化

1. **按需格式化**：只在需要时格式化坐标字符串
2. **分组策略**：先分组再格式化，减少重复计算
3. **限制显示**：最多显示前20种方块类型

## 对比 maicraft 项目

### 相同点

1. ✅ 不过滤方块类型
2. ✅ 特别关注环境方块（水、岩浆）
3. ✅ 智能坐标压缩
4. ✅ 方块分组展示
5. ✅ 可放置位置检测

### 差异点

| 特性         | maicraft (Python)      | maicraft-next (TypeScript) |
| ------------ | ---------------------- | -------------------------- |
| 实现语言     | Python                 | TypeScript                 |
| 架构         | MCP协议                | 单体架构                   |
| 可见方块检测 | 使用 `can_see` 字段    | 暂未实现（可扩展）         |
| 坐标压缩     | 多种策略（高度/层/列） | 简化版压缩算法             |
| 方块范围     | 全范围16格 + 可见32格  | 统一16格范围               |

### 未来扩展

1. **可见方块检测**：实现 `can_see` 字段，区分完全显示和可见范围
2. **更多压缩策略**：按高度、层、列分组的智能选择
3. **动态范围调整**：根据环境自动调整扫描范围
4. **方块状态信息**：显示方块的额外状态（如熔炉燃烧状态）

## 测试建议

### 1. 水体环境测试

```bash
# 让 bot 进入水中，观察输出
/tp @p ~ 65 ~ # 传送到水面高度
```

期望输出：

- ✅ 警告提示在水中
- ✅ 显示大量水方块
- ✅ 脚下方块信息正确

### 2. 岩浆环境测试

```bash
# 在岩浆附近测试
/setblock ~ ~ ~ lava
```

期望输出：

- ✅ 危险警告
- ✅ 岩浆方块位置
- ✅ 建议远离

### 3. 空中测试

```bash
# 传送到空中
/tp @p ~ 100 ~
```

期望输出：

- ✅ 警告脚下没有方块
- ✅ 提示可能在下坠
- ✅ 周围都是空气

### 4. 正常陆地测试

期望输出：

- ✅ 显示脚下的 dirt/stone/grass 等方块
- ✅ 附近的树木、矿石等资源
- ✅ 统计信息准确

## 总结

新的方块感知系统：

1. ✅ **解决了过度过滤问题**：不再忽略环境方块
2. ✅ **增强了环境感知**：AI 能准确判断所处环境
3. ✅ **优化了信息展示**：分层展示，重点突出
4. ✅ **提升了决策质量**：AI 能根据环境做出正确决策
5. ✅ **保持了性能**：智能扫描和缓存策略

这是一个参考 maicraft 项目、适配 TypeScript 架构的完整方块感知解决方案！
