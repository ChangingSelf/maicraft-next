# 状态管理 (State Management)

> 本文档介绍 Maicraft-Next 的状态管理系统，包括 GameState 和各种缓存系统

---

## 🎯 核心理念：实时状态，零查询

### Maicraft Python 的问题

```python
# ❌ 需要频繁调用查询动作
status = await mcp_client.call_tool("query_player_status", {})
health = status['data']['health']
food = status['data']['food']

inventory = await mcp_client.call_tool("query_inventory", {})
items = inventory['data']['items']

entities = await mcp_client.call_tool("query_nearby_entities", {})
```

**问题**：

- 每次获取状态都需要跨进程调用
- 占用 LLM 的工具调用额度
- 增加延迟和复杂度

### Maicraft-Next 的改进

```typescript
// ✅ 状态实时访问，零开销
const health = context.gameState.health;
const food = context.gameState.food;
const items = context.gameState.inventory;
const entities = context.gameState.nearbyEntities;
```

**优势**：

- 状态通过 mineflayer 事件自动同步
- 任何地方都可以直接访问
- 零轮询开销
- LLM 可以在 prompt 中直接包含所有状态

---

## 📦 核心组件

### 1. GameState - 全局游戏状态

**职责**：实时同步游戏状态，提供统一的状态访问接口

#### 状态分类

| 类别         | 属性             | 说明                                   |
| ------------ | ---------------- | -------------------------------------- |
| **玩家信息** | `playerName`     | 玩家名称                               |
|              | `gamemode`       | 游戏模式 (survival/creative/adventure) |
| **位置**     | `position`       | 精确坐标 (Vec3)                        |
|              | `blockPosition`  | 方块坐标 (Vec3)                        |
|              | `yaw`, `pitch`   | 视角方向                               |
|              | `onGround`       | 是否在地面                             |
| **生命值**   | `health`         | 当前生命值                             |
|              | `healthMax`      | 最大生命值                             |
|              | `armor`          | 护甲值                                 |
| **饥饿度**   | `food`           | 当前饥饿度                             |
|              | `foodMax`        | 最大饥饿度 (20)                        |
|              | `foodSaturation` | 饱和度                                 |
| **经验**     | `level`          | 等级                                   |
|              | `experience`     | 当前经验值                             |
| **氧气**     | `oxygen`         | 氧气值 (最大 300)                      |
| **物品栏**   | `inventory`      | 物品列表                               |
|              | `equipment`      | 装备 (头盔/胸甲/护腿/鞋子/手持)        |
|              | `heldItem`       | 当前手持物品                           |
| **环境**     | `weather`        | 天气 (clear/rain/thunder)              |
|              | `timeOfDay`      | 游戏时间 (0-24000)                     |
|              | `dimension`      | 维度 (overworld/nether/end)            |
|              | `biome`          | 生物群系                               |
| **周围实体** | `nearbyEntities` | 附近的玩家和生物                       |
| **状态**     | `isSleeping`     | 是否在睡觉                             |

#### 基本使用

```typescript
import { globalGameState } from '@/core/state/GameState';

// 初始化（在 bot spawn 后）
bot.once('spawn', () => {
  globalGameState.initialize(bot);
});

// 访问状态
const health = globalGameState.health;
const position = globalGameState.position;
const inventory = globalGameState.inventory;

// 获取格式化描述（用于 LLM）
const statusDesc = globalGameState.getStatusDescription();
const inventoryDesc = globalGameState.getInventoryDescription();
const equipmentDesc = globalGameState.getEquipmentDescription();
```

#### 自动同步机制

GameState 通过 mineflayer 事件自动同步：

```typescript
// 内部实现（用户无需关心）
bot.on('health', () => {
  this.updateHealth(bot);
  this.updateFood(bot);
});

bot.on('move', () => {
  this.updatePosition(bot);
});

bot.on('experience', () => {
  this.updateExperience(bot);
});

bot.on('windowUpdate', () => {
  this.updateInventory(bot);
});

// 周围实体每 2 秒更新一次
setInterval(() => {
  this.updateNearbyEntities(bot);
}, 2000);
```

#### 用于 LLM 的格式化输出

```typescript
// 状态描述
const statusDesc = globalGameState.getStatusDescription();
// 输出:
// 位置: (100.0, 64.0, 200.0)
// 生命值: 20/20
// 饥饿度: 18/20 (饱和度: 5.0)
// 经验等级: 5 (经验值: 150)
// ...

// 物品栏描述
const inventoryDesc = globalGameState.getInventoryDescription();
// 输出:
// 物品栏 (共 15 种物品):
//   - iron_ore x 10
//   - coal x 32
//   - wooden_pickaxe x 1
// ...

// 装备描述
const equipmentDesc = globalGameState.getEquipmentDescription();
// 输出:
// 装备:
//   - 手持: wooden_pickaxe
//   - 头盔: 无
//   - 胸甲: leather_chestplate
// ...
```

### 2. BlockCache - 方块缓存

**职责**：缓存已发现的方块位置，避免重复搜索

#### 基本使用

```typescript
import { BlockCache } from '@/core/cache/BlockCache';

const blockCache = new BlockCache();

// 设置方块
blockCache.setBlock(100, 64, 200, blockData);

// 获取方块
const block = blockCache.getBlock(100, 64, 200);

// 清空缓存
blockCache.clear();

// 持久化
await blockCache.save();
await blockCache.load();
```

⚠️ **注意**：当前为简化实现，完整的缓存功能（如查找附近方块）待完善。

### 3. ContainerCache - 容器缓存

**职责**：缓存已知容器（箱子、熔炉等）的位置和内容

#### 基本使用

```typescript
import { ContainerCache } from '@/core/cache/ContainerCache';

const containerCache = new ContainerCache();

// 记录容器
containerCache.addContainer(position, 'chest', items);

// 查找附近容器
const chests = containerCache.findNearby(position, 32);

// 查找包含特定物品的容器
const withDiamond = containerCache.findWithItem('diamond');

// 持久化
await containerCache.save();
await containerCache.load();
```

⚠️ **注意**：当前为简化实现，完整功能待完善。

### 4. LocationManager - 地标管理

**职责**：管理玩家设置的地标（如家、矿洞入口等）

#### 基本使用

```typescript
import { LocationManager } from '@/core/location/LocationManager';

const locationManager = new LocationManager();

// 设置地标
locationManager.setLocation('home', position, '我的家');
locationManager.setLocation('mine_entrance', position, '矿洞入口');

// 获取地标
const home = locationManager.getLocation('home');

// 删除地标
locationManager.deleteLocation('home');

// 查找附近地标
const nearby = locationManager.findNearby(position, 100);

// 获取所有地标描述（用于 LLM）
const locationsDesc = locationManager.getAllLocationsString();
// 输出:
// 已保存的地标 (共 2 个):
//   - home: (100, 64, 200) - 我的家
//   - mine_entrance: (150, 60, 250) - 矿洞入口

// 持久化
await locationManager.save();
await locationManager.load();
```

---

## 🔄 与 Maicraft Python 的对比

### 状态访问方式

| 方面         | Maicraft Python              | Maicraft-Next              |
| ------------ | ---------------------------- | -------------------------- |
| **玩家状态** | `query_player_status` 工具   | `gameState.health` 等属性  |
| **物品栏**   | `query_inventory` 工具       | `gameState.inventory`      |
| **周围实体** | `query_nearby_entities` 工具 | `gameState.nearbyEntities` |
| **环境信息** | `query_game_state` 工具      | `gameState.weather` 等属性 |
| **同步方式** | 需要主动查询                 | 事件驱动自动同步           |
| **性能开销** | 跨进程调用                   | 零开销内存访问             |

### 架构对比

**Maicraft Python**:

```
Python Agent
    ↓ (调用 query_player_status)
MCP Client
    ↓ (IPC)
MCP Server
    ↓
Mineflayer Bot
    ↓
返回状态数据 (跨进程)
```

**Maicraft-Next**:

```
Mineflayer Bot
    ↓ (事件触发)
GameState 自动更新
    ↓
Agent 直接访问 (内存读取)
```

---

## 💻 在动作中使用状态

### 示例：在动作执行中访问状态

```typescript
export class MyAction extends BaseAction {
  async execute(context: RuntimeContext, params: any): Promise<ActionResult> {
    // 1. 检查生命值
    if (context.gameState.health < 10) {
      return this.failure('生命值过低，拒绝执行');
    }

    // 2. 检查物品栏
    const hasPickaxe = context.gameState.inventory.some(item => item.name.includes('pickaxe'));
    if (!hasPickaxe) {
      return this.failure('没有镐子');
    }

    // 3. 检查位置
    const pos = context.gameState.position;
    context.logger.info(`当前位置: ${pos.x}, ${pos.y}, ${pos.z}`);

    // 4. 检查环境
    if (context.gameState.weather === 'thunder') {
      context.logger.warn('当前正在打雷，注意安全');
    }

    // 5. 执行动作逻辑
    // ...

    return this.success('执行成功');
  }
}
```

---

## 📚 在 LLM Prompt 中使用状态

### 示例：生成包含状态的 Prompt

```typescript
import { globalGameState } from '@/core/state/GameState';

function generatePrompt(): string {
  return `
你是一个 Minecraft AI 代理。

## 当前状态

${globalGameState.getStatusDescription()}

${globalGameState.getInventoryDescription()}

${globalGameState.getEquipmentDescription()}

${globalGameState.getEnvironmentDescription()}

${locationManager.getAllLocationsString()}

## 任务

请决定下一步行动。
  `.trim();
}
```

这样 LLM 就可以在一次调用中获得所有必要的状态信息，而无需使用工具查询。

---

## 🚀 最佳实践

### 1. 总是在 bot spawn 后初始化

```typescript
bot.once('spawn', () => {
  globalGameState.initialize(bot);
  console.log('GameState 已初始化');
});
```

### 2. 使用格式化输出用于 LLM

```typescript
// ✅ 推荐：使用格式化方法
const prompt = globalGameState.getStatusDescription();

// ❌ 不推荐：手动拼接
const prompt = `生命值: ${globalGameState.health}, 饥饿度: ${globalGameState.food}...`;
```

### 3. 在动作中检查关键状态

```typescript
// ✅ 在动作开始前检查状态
if (context.gameState.health < 5) {
  return this.failure('生命值过低');
}

// ✅ 在长时间执行中定期检查
for (let i = 0; i < 100; i++) {
  if (context.gameState.health < 5) {
    return this.failure('生命值过低，中止执行');
  }
  await doSomething();
}
```

### 4. 利用缓存系统

```typescript
// ✅ 记录发现的资源
context.blockCache.setBlock(x, y, z, blockData);

// ✅ 记录容器位置
context.containerCache.addContainer(position, 'chest', items);

// ✅ 设置重要地标
context.locationManager.setLocation('home', position, '我的家');
```

---

## 📚 相关文档

- [架构概览](architecture-overview.md) - 了解状态管理在整体架构中的位置
- [动作系统](action-system.md) - 了解如何在动作中使用状态
- [事件系统](event-system.md) - 了解 GameState 如何通过事件同步

---

_最后更新: 2025-11-01_
