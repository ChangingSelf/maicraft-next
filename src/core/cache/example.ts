/**
 * 缓存系统使用示例
 * 演示如何使用方块和容器缓存功能
 */

// 注意：这是一个示例文件，展示如何使用缓存系统
// 在实际使用中，这些功能已经集成到 GameState 中

/*
import { BlockCache } from './BlockCache';
import { ContainerCache } from './ContainerCache';
import { CacheManager } from './CacheManager';
import type { BlockInfo, ContainerInfo } from './types';

// ===== 方块缓存使用示例 =====

// 创建方块缓存
const blockCache = new BlockCache({
  maxEntries: 10000,
  expirationTime: 30 * 60 * 1000, // 30分钟过期
  autoSaveInterval: 5 * 60 * 1000, // 5分钟自动保存
  enabled: true,
  updateStrategy: 'smart'
}, 'data/block_cache.json');

// 加载现有缓存
await blockCache.load();

// 添加方块到缓存
blockCache.setBlock(100, 64, 200, {
  name: 'oak_log',
  type: 17,
  position: { x: 100, y: 64, z: 200 },
  hardness: 2,
  transparent: false,
  lightLevel: 0,
  timestamp: Date.now(),
  state: {
    facing: 'north',
    metadata: 0
  }
});

// 批量添加方块
blockCache.setBlocks([
  { x: 101, y: 64, z: 200, block: { name: 'oak_log', type: 17 } },
  { x: 102, y: 64, z: 200, block: { name: 'oak_log', type: 17 } },
  { x: 103, y: 64, z: 200, block: { name: 'stone', type: 1 } }
]);

// 获取方块信息
const block = blockCache.getBlock(100, 64, 200);
if (block) {
  console.log(`找到方块: ${block.name}, 硬度: ${block.hardness}`);
}

// 查找所有原木
const oakLogs = blockCache.findBlocksByName('oak_log');
console.log(`找到 ${oakLogs.length} 个橡木原木`);

// 模糊匹配查找所有矿石
const ores = blockCache.findBlocksByPattern('ore');
console.log(`找到 ${ores.length} 个矿石方块`);

// 获取指定范围内的方块
const nearbyBlocks = blockCache.getBlocksInRadius(100, 64, 200, 16);
console.log(`16格范围内有 ${nearbyBlocks.length} 个方块`);

// 删除方块缓存
blockCache.removeBlock(100, 64, 200);

// 获取缓存统计信息
const stats = blockCache.getStats();
console.log(`缓存统计: ${stats.totalEntries} 个条目, 命中率: ${(stats.hitRate * 100).toFixed(2)}%`);

// 保存缓存到文件
await blockCache.save();


// ===== 容器缓存使用示例 =====

// 创建容器缓存
const containerCache = new ContainerCache({
  maxEntries: 1000,
  expirationTime: 60 * 60 * 1000, // 1小时过期
  autoSaveInterval: 10 * 60 * 1000, // 10分钟自动保存
  enabled: true,
  updateStrategy: 'smart'
}, 'data/container_cache.json');

// 加载现有缓存
await containerCache.load();

// 添加箱子到缓存
containerCache.setContainer(100, 64, 200, 'chest', {
  type: 'chest',
  position: { x: 100, y: 64, z: 200 },
  name: '宝箱',
  items: [
    {
      itemId: 264,
      name: 'diamond',
      count: 5,
      durability: undefined,
      enchantments: [
        { name: 'efficiency', level: 3 }
      ],
      customName: '超级钻石'
    },
    {
      itemId: 1,
      name: 'stone',
      count: 64
    }
  ],
  lastAccessed: Date.now(),
  size: 27,
  locked: false
});

// 获取容器信息
const chest = containerCache.getContainer(100, 64, 200, 'chest');
if (chest) {
  console.log(`容器: ${chest.name}, 物品数量: ${chest.items.length}`);
  chest.items.forEach(item => {
    console.log(`  - ${item.name} x${item.count}`);
  });
}

// 按类型查找容器
const chests = containerCache.findContainersByType('chest');
console.log(`找到 ${chests.length} 个箱子`);

// 按物品查找容器（包含钻石的容器）
const containersWithDiamond = containerCache.findContainersWithItem(264, 1);
console.log(`${containersWithDiamond.length} 个容器包含钻石`);

// 按物品名称查找容器
const containersWithStone = containerCache.findContainersWithItemName('stone', 32);
console.log(`${containersWithStone.length} 个容器包含至少32个石头`);

// 更新容器物品
containerCache.updateContainerItems(100, 64, 200, 'chest', [
  { itemId: 264, name: 'diamond', count: 3 }, // 消耗了2个钻石
  { itemId: 1, name: 'stone', count: 32 } // 消耗了32个石头
]);

// 添加物品到容器
containerCache.addItemToContainer(100, 64, 200, 'chest', {
  itemId: 265,
  name: 'iron_ingot',
  count: 16
});

// 从容器移除物品
containerCache.removeItemFromContainer(100, 64, 200, 'chest', 1, 16);

// 获取指定范围内的容器
const nearbyContainers = containerCache.getContainersInRadius(100, 64, 200, 32);
console.log(`32格范围内有 ${nearbyContainers.length} 个容器`);

// 删除容器缓存
containerCache.removeContainer(100, 64, 200, 'chest');

// 保存容器缓存
await containerCache.save();


// ===== 缓存管理器使用示例 =====

// 注意：缓存管理器需要 Bot 实例，这里只是示例
const bot = null as any; // 在实际使用中传入真实的 Bot 实例

if (bot) {
  // 创建缓存管理器
  const cacheManager = new CacheManager(bot, blockCache, containerCache, {
    blockScanInterval: 10 * 1000, // 10秒扫描一次方块
    blockScanRadius: 8, // 扫描半径8格
    containerUpdateInterval: 30 * 1000, // 30秒更新一次容器
    autoSaveInterval: 5 * 60 * 1000, // 5分钟自动保存
    enableAutoScan: true,
    enableAutoSave: true
  });

  // 启动缓存管理器
  cacheManager.start();

  // 手动触发方块扫描
  await cacheManager.triggerBlockScan(16); // 扫描16格半径

  // 手动触发容器更新
  await cacheManager.triggerContainerUpdate();

  // 获取管理器统计信息
  const managerStats = cacheManager.getStats();
  console.log('缓存管理器统计:', managerStats);

  // 停止缓存管理器
  cacheManager.stop();
}

// ===== 在 GameState 中使用缓存 =====

// 在实际使用中，缓存系统已经集成到 GameState 中
// 可以通过以下方式使用：

// 获取方块缓存
// const gameState = getGameState(); // 获取 GameState 实例
// const blockInfo = gameState.getBlockInfo(100, 64, 200);

// 设置方块缓存
// gameState.setBlockInfo(100, 64, 200, {
//   name: 'oak_log',
//   type: 17,
//   hardness: 2
// });

// 获取附近方块
// const nearbyBlocks = gameState.getNearbyBlocks(16);

// 按名称查找方块
// const diamonds = gameState.findBlocksByName('diamond_ore');

// 获取容器缓存
// const container = gameState.getContainerInfo(100, 64, 200, 'chest');

// 设置容器缓存
// gameState.setContainerInfo(100, 64, 200, 'chest', {
//   type: 'chest',
//   items: [...],
//   size: 27
// });

// 获取附近容器
// const nearbyContainers = gameState.getNearbyContainers(32);

// 按物品查找容器
// const chestsWithDiamonds = gameState.findContainersWithItem(264, 5);

// 手动触发缓存扫描
// await gameState.triggerCacheScan(16);

// 获取缓存统计信息
// const cacheStats = gameState.getCacheStats();
// const managerStats = gameState.getCacheManagerStats();

console.log('缓存系统示例演示完成');
*/

export default function cacheExample() {
  console.log('缓存系统示例 - 请参考文件中的注释了解如何使用');
}
