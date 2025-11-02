# maicraft-next 核心模块

> Phase 1: 核心基础架构 ✅

---

## 📚 快速开始

### 安装依赖

```bash
npm install mineflayer vec3 prismarine-block prismarine-item prismarine-entity
```

### 基本使用

```typescript
import { createBot } from 'mineflayer';
import { globalGameState, ActionExecutor, ActionIds, BlockCache, ContainerCache, LocationManager } from './core';

// 1. 创建 bot
const bot = createBot({
  host: 'localhost',
  username: 'maicraft_bot',
});

// 2. 初始化全局游戏状态
bot.once('spawn', () => {
  globalGameState.initialize(bot);
});

// 3. 创建 ActionExecutor
const logger = console; // 或使用自定义 logger
const executor = new ActionExecutor(bot, logger);

// 4. 设置缓存管理器
executor.setBlockCache(new BlockCache());
executor.setContainerCache(new ContainerCache());
executor.setLocationManager(new LocationManager());

// 5. 注册动作（需要先实现具体动作）
// executor.register(new MoveAction());

// 6. 执行动作
// await executor.execute(ActionIds.MOVE, { x: 100, y: 64, z: 200 });
```

---

## 📦 核心组件

### GameState - 全局游戏状态

```typescript
import { globalGameState } from './core';

// 直接访问实时状态
console.log(globalGameState.health);
console.log(globalGameState.food);
console.log(globalGameState.inventory);
console.log(globalGameState.nearbyEntities);

// 获取格式化描述（用于 LLM）
console.log(globalGameState.getStatusDescription());
console.log(globalGameState.getInventoryDescription());
```

### EventManager - 事件系统

```typescript
// 订阅事件（保持 mineflayer 原始事件名）
const events = executor.getEventManager();

events.on('entityHurt', data => {
  console.log('实体受伤:', data.entity);
});

events.on('health', data => {
  console.log('健康变化:', data.health);
});

// 自定义事件
events.on('actionComplete', data => {
  console.log('动作完成:', data.actionName);
});
```

### ActionExecutor - 动作执行

```typescript
// 使用 ActionIds 常量（类型安全）
await executor.execute(ActionIds.MOVE, {
  x: 100,
  y: 64,
  z: 200,
});

// 中断动作
executor.interruptAll('受到攻击');

// 获取已注册的动作
const actions = executor.getRegisteredActions();
```

### BlockCache - 方块缓存

```typescript
const blockCache = new BlockCache();

// 添加方块
blockCache.addBlock('iron_ore', true, position);

// 查找附近方块
const ores = blockCache.findNearby(center, 'iron_ore', 16);

// 查找可见方块
const visible = blockCache.findVisible('diamond_ore');
```

### ContainerCache - 容器缓存

```typescript
const containerCache = new ContainerCache();

// 添加容器
containerCache.addContainer(position, ContainerType.CHEST, items);

// 查找附近容器
const chests = containerCache.findNearby(center, 16);

// 查找包含特定物品的容器
const withDiamond = containerCache.findWithItem('diamond');
```

### LocationManager - 地标管理

```typescript
const locationManager = new LocationManager();

// 设置地标
locationManager.setLocation('home', position, '我的家');

// 查找附近地标
const nearby = locationManager.findNearby(center, 100);

// 获取地标描述
console.log(locationManager.getAllLocationsString());
```

---

## 🎯 ActionIds 常量

15 个核心动作 ID：

```typescript
ActionIds.MOVE; // 移动
ActionIds.FIND_BLOCK; // 寻找方块
ActionIds.MINE_BLOCK; // 挖掘
ActionIds.MINE_BLOCK_BY_POSITION; // 按坐标挖掘
ActionIds.MINE_IN_DIRECTION; // 按方向挖掘
ActionIds.PLACE_BLOCK; // 放置方块
ActionIds.CRAFT; // 合成
ActionIds.USE_CHEST; // 使用箱子
ActionIds.USE_FURNACE; // 使用熔炉
ActionIds.EAT; // 吃食物
ActionIds.TOSS_ITEM; // 丢弃物品
ActionIds.KILL_MOB; // 击杀生物
ActionIds.SET_LOCATION; // 设置地标
ActionIds.CHAT; // 发送聊天
ActionIds.SWIM_TO_LAND; // 游到陆地
```

---

## 📖 完整示例

参见: `src/examples/core-usage-example.ts`

---

## 🚀 下一步

Phase 2 将实现 6 个 P0 核心动作：

1. MoveAction
2. FindBlockAction
3. MineBlockAction
4. MineBlockByPositionAction
5. PlaceBlockAction
6. CraftItemAction

---

## 📝 文档

- [核心架构设计](../../docs/design/core-architecture.md)
- [Phase 1 实施总结](../../docs/implementation-summary/phase1-core-implementation.md)

---

_版本: 1.0_  
_状态: ✅ Phase 1 完成_
