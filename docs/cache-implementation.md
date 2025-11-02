# 方块缓存系统实现文档

## 概述

本实现为 maicraft-next 项目添加了完整的方块和容器缓存系统，用于提升 Minecraft AI 代理的环境感知和决策能力。

## 架构设计

### 核心组件

1. **类型定义** (`src/core/cache/types.ts`)
   - `BlockInfo`: 方块信息接口
   - `ContainerInfo`: 容器信息接口
   - `ContainerItem`: 容器物品接口
   - `CacheConfig`: 缓存配置接口
   - `CacheStats`: 缓存统计信息接口

2. **BlockCache** (`src/core/cache/BlockCache.ts`)
   - 方块信息的缓存、查询和持久化
   - 支持按名称、模式查找方块
   - 支持按位置范围查询
   - 自动过期和清理机制
   - 统计信息收集

3. **ContainerCache** (`src/core/cache/ContainerCache.ts`)
   - 容器信息的缓存和管理
   - 支持物品的增删改操作
   - 按物品查找容器功能
   - 支持多种容器类型（箱子、熔炉等）

4. **CacheManager** (`src/core/cache/CacheManager.ts`)
   - 缓存自动更新和管理
   - 定时扫描周围方块
   - 容器位置更新
   - 自动保存机制

5. **GameState 集成** (`src/core/state/GameState.ts`)
   - 缓存系统与游戏状态的集成
   - 提供统一的缓存访问接口
   - 自动生命周期管理

### 主要特性

#### 方块缓存功能
- ✅ 基础 CRUD 操作（创建、读取、更新、删除）
- ✅ 按名称精确查找方块
- ✅ 按正则表达式模糊匹配查找
- ✅ 按位置范围查询方块
- ✅ 批量操作支持
- ✅ 自动过期清理（默认30分钟）
- ✅ 缓存大小限制（默认10000条）
- ✅ 持久化存储（JSON格式）
- ✅ 统计信息收集（命中率、查询次数等）

#### 容器缓存功能
- ✅ 多种容器类型支持（箱子、熔炉、酿造台等）
- ✅ 容器物品的增删改操作
- ✅ 按物品查找容器
- ✅ 按物品名称模糊查找
- ✅ 容器状态管理（如熔炉进度）
- ✅ 自动过期清理（默认1小时）
- ✅ 持久化存储
- ✅ 统计信息收集

#### 缓存管理功能
- ✅ 自动方块扫描（每10秒，半径8格）
- ✅ 智能扫描策略（位置变化触发）
- ✅ 容器位置自动更新
- ✅ 自动保存机制（每5分钟）
- ✅ 可配置的扫描间隔和半径
- ✅ 启动/停止自动管理

## 集成方式

### GameState 接口

```typescript
// 方块缓存操作
gameState.getBlockInfo(x, y, z): BlockInfo | null
gameState.setBlockInfo(x, y, z, blockInfo): void
gameState.getNearbyBlocks(radius): BlockInfo[]
gameState.findBlocksByName(name): BlockInfo[]

// 容器缓存操作
gameState.getContainerInfo(x, y, z, type?): ContainerInfo | null
gameState.setContainerInfo(x, y, z, type, containerInfo): void
gameState.getNearbyContainers(radius): ContainerInfo[]
gameState.findContainersWithItem(itemId, minCount): ContainerInfo[]

// 缓存管理
gameState.triggerCacheScan(radius?): Promise<void>
gameState.triggerContainerUpdate(): Promise<void>
gameState.getCacheStats(): any
gameState.setCacheAutoManagement(enabled): void
```

### PromptDataCollector 集成

缓存信息已集成到提示词数据收集中：
- `getNearbyBlocksInfo()`: 获取附近重要方块信息
- `getContainerCacheInfo()`: 获取附近容器信息

这些信息会自动包含在 AI 决策的提示词中。

## 配置选项

### BlockCache 配置
```typescript
{
  maxEntries: 10000,              // 最大缓存条目数
  expirationTime: 30 * 60 * 1000, // 过期时间（30分钟）
  autoSaveInterval: 5 * 60 * 1000, // 自动保存间隔（5分钟）
  enabled: true,                  // 是否启用
  updateStrategy: 'smart'         // 更新策略
}
```

### ContainerCache 配置
```typescript
{
  maxEntries: 1000,               // 最大缓存条目数
  expirationTime: 60 * 60 * 1000, // 过期时间（1小时）
  autoSaveInterval: 10 * 60 * 1000, // 自动保存间隔（10分钟）
  enabled: true,                  // 是否启用
  updateStrategy: 'smart'         // 更新策略
}
```

### CacheManager 配置
```typescript
{
  blockScanInterval: 10 * 1000,   // 方块扫描间隔（10秒）
  blockScanRadius: 8,             // 扫描半径（8格）
  containerUpdateInterval: 30 * 1000, // 容器更新间隔（30秒）
  autoSaveInterval: 5 * 60 * 1000,    // 自动保存间隔（5分钟）
  enableAutoScan: true,           // 启用自动扫描
  enableAutoSave: true            // 启用自动保存
}
```

## 使用示例

### 基础使用

```typescript
// 获取方块信息
const block = gameState.getBlockInfo(100, 64, 200);
if (block) {
  console.log(`方块: ${block.name}, 类型: ${block.type}`);
}

// 查找附近的钻石矿石
const diamondOres = gameState.findBlocksByName('diamond_ore');
console.log(`找到 ${diamondOres.length} 个钻石矿石`);

// 获取附近的箱子
const nearbyChests = gameState.getNearbyContainers(16);
console.log(`附近有 ${nearbyChests.length} 个箱子`);

// 查找包含钻石的容器
const containersWithDiamond = gameState.findContainersWithItem(264, 1);
```

### 高级使用

```typescript
// 手动触发大范围扫描
await gameState.triggerCacheScan(32);

// 获取缓存统计信息
const stats = gameState.getCacheStats();
console.log(`方块缓存命中率: ${(stats.blockCache.hitRate * 100).toFixed(2)}%`);

// 临时禁用自动管理
gameState.setCacheAutoManagement(false);
// 执行一些操作...
gameState.setCacheAutoManagement(true);
```

## 性能考虑

### 内存使用
- 方块缓存默认限制 10000 条目
- 容器缓存默认限制 1000 条目
- 自动清理过期条目
- LRU 驱逐策略

### 磁盘 I/O
- 异步保存，不阻塞主线程
- 增量更新，减少磁盘写入
- JSON 格式，易于调试

### CPU 使用
- 智能扫描策略，避免重复扫描
- 缓存命中减少重复计算
- 批量操作优化

## 数据存储

### 文件位置
- 方块缓存：`data/block_cache.json`
- 容器缓存：`data/container_cache.json`

### 数据格式
```json
{
  "version": "1.0",
  "timestamp": 1699123456789,
  "stats": {
    "totalEntries": 100,
    "hitRate": 0.75,
    "totalQueries": 400,
    "totalHits": 300
  },
  "entries": [
    ["key", { /* 缓存数据 */ }]
  ]
}
```

## 测试

### 单元测试
- 位置：`src/core/cache/__tests__/CacheSystem.test.ts`
- 测试覆盖：基本功能、过期机制、统计信息、数据结构验证

### 测试结果
```
√ BlockCache 基本功能 (3 ms)
√ ContainerCache 基本功能 (1 ms)
√ 缓存过期机制 (1 ms)
√ 缓存统计信息
√ 方块信息结构验证 (5 ms)
√ 容器信息结构验证 (1 ms)
√ 缓存配置验证 (1 ms)
```

## 未来扩展

### 计划功能
- [ ] 缓存预热策略
- [ ] 多维度索引优化
- [ ] 分布式缓存支持
- [ ] 缓存可视化工具
- [ ] 更智能的扫描策略
- [ ] 缓存压缩存储

### 优化方向
- [ ] 内存使用优化
- [ ] 查询性能提升
- [ ] 网络同步支持
- [ ] 缓存一致性保证

## 总结

本实现为 maicraft-next 项目提供了一个功能完整、性能优化的缓存系统。通过智能的缓存策略和自动管理机制，显著提升了 AI 代理对游戏环境的感知能力，为更智能的决策提供了基础支持。

缓存系统的模块化设计确保了良好的可维护性和扩展性，而完善的测试覆盖则保证了功能的稳定性和可靠性。