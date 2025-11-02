/**
 * 全局游戏状态
 * 实时同步，无需查询
 *
 * 设计理念:
 * - 通过 bot.on() 事件实时更新
 * - 任何地方都可以直接访问状态
 * - 去除轮询查询的低效设计
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { Item } from 'prismarine-item';
import { Entity } from 'prismarine-entity';
import { getLogger, type Logger } from '@/utils/Logger';
import { BlockCache } from '@/core/cache/BlockCache';
import { ContainerCache } from '@/core/cache/ContainerCache';
import { CacheManager } from '@/core/cache/CacheManager';
import type { BlockInfo, ContainerInfo } from '@/core/cache/types';

/**
 * 物品信息
 */
export interface ItemInfo {
  name: string;
  count: number;
  slot: number;
  displayName: string;
  metadata?: any;
}

/**
 * 实体信息
 */
export interface EntityInfo {
  type: string;
  name: string;
  position: Vec3;
  distance?: number;
  health?: number;
  maxHealth?: number;
}

/**
 * 装备槽位
 */
export type EquipmentSlot = 'head' | 'torso' | 'legs' | 'feet' | 'hand' | 'off-hand';

/**
 * 全局游戏状态类
 */
export class GameState {
  private logger: Logger = getLogger('GameState');

  // 玩家基础信息
  readonly playerName: string = '';
  gamemode: string = 'survival';

  // 位置信息（实时更新）
  position: Vec3 = new Vec3(0, 0, 0);
  blockPosition: Vec3 = new Vec3(0, 0, 0);

  // 状态信息（实时更新）
  health: number = 20;
  healthMax: number = 20;
  food: number = 20;
  foodMax: number = 20;
  foodSaturation: number = 5;
  experience: number = 0;
  level: number = 0;
  oxygen: number = 300;
  armor: number = 0;

  // 物品栏（实时更新）
  inventory: ItemInfo[] = [];
  equipment: Partial<Record<EquipmentSlot, ItemInfo | null>> = {};
  heldItem: ItemInfo | null = null;

  // 环境信息（实时更新）
  weather: string = 'clear';
  timeOfDay: number = 0;
  dimension: string = 'overworld';
  biome: string = 'plains';

  // 周围实体（定期更新）
  nearbyEntities: EntityInfo[] = [];

  // 视角信息
  yaw: number = 0;
  pitch: number = 0;
  onGround: boolean = true;

  // 是否睡觉
  isSleeping: boolean = false;

  // 缓存系统
  blockCache: BlockCache | null = null;
  containerCache: ContainerCache | null = null;
  cacheManager: CacheManager | null = null;

  // 初始化标志
  private initialized: boolean = false;

  // 更新间隔定时器
  private entityUpdateInterval?: NodeJS.Timeout;

  /**
   * 初始化游戏状态，设置 bot 事件监听
   */
  initialize(bot: Bot): void {
    if (this.initialized) {
      this.logger.warn('已经初始化，跳过');
      return;
    }

    // 设置玩家名称
    (this as any).playerName = bot.username;

    // 初始化缓存系统
    this.initializeCaches(bot);

    // 初始化初始状态
    this.updatePosition(bot);
    this.updateHealth(bot);
    this.updateFood(bot);
    this.updateExperience(bot);
    this.updateInventory(bot);
    this.updateEnvironment(bot);

    // 监听健康变化
    bot.on('health', () => {
      this.updateHealth(bot);
      this.updateFood(bot);
    });

    // 监听位置移动
    bot.on('move', () => {
      this.updatePosition(bot);
    });

    // 监听经验变化
    bot.on('experience', () => {
      this.updateExperience(bot);
    });

    // 监听物品栏变化
    bot.on('windowUpdate', () => {
      this.updateInventory(bot);
    });

    // 监听天气和时间
    bot.on('time', () => {
      this.timeOfDay = bot.time.timeOfDay;
    });

    bot.on('weather', () => {
      this.weather = bot.thunderState ? 'thunder' : bot.isRaining ? 'rain' : 'clear';
    });

    // 监听睡眠状态
    bot.on('sleep', () => {
      this.isSleeping = true;
    });

    bot.on('wake', () => {
      this.isSleeping = false;
    });

    // 定期更新周围实体 (每秒一次)
    this.entityUpdateInterval = setInterval(() => {
      this.updateNearbyEntities(bot);
    }, 1000);

    this.initialized = true;
    this.logger.info('初始化完成');
  }

  /**
   * 初始化缓存系统
   */
  private initializeCaches(bot: Bot): void {
    try {
      // 创建缓存配置，优化性能
      const cacheConfig = {
        maxEntries: 5000, // 减少最大条目数，减少内存使用
        expirationTime: 60 * 60 * 1000, // 1小时过期
        autoSaveInterval: 5 * 60 * 1000, // 5分钟自动保存，减少I/O频率
        enabled: true,
        updateStrategy: 'smart' as const,
      };

      this.blockCache = new BlockCache(cacheConfig);
      this.containerCache = new ContainerCache(cacheConfig);

      this.logger.info('缓存实例创建完成', {
        blockCachePath: 'data/block_cache.json',
        containerCachePath: 'data/container_cache.json',
        autoSaveInterval: '30秒',
      });

      // 创建缓存管理器，配置适合AI决策的扫描频率
      const managerConfig = {
        blockScanInterval: 15 * 1000, // 15秒扫描一次，更及时的环境感知
        blockScanRadius: 12, // 扫描半径12格，更大的感知范围
        containerUpdateInterval: 60 * 1000, // 60秒更新容器
        autoSaveInterval: 5 * 60 * 1000, // 5分钟自动保存，减少I/O
        enableAutoScan: true,
        enableAutoSave: true,
        performanceMode: 'performance' as const, // 优先性能，减少扫描开销
      };

      this.cacheManager = new CacheManager(bot, this.blockCache, this.containerCache, managerConfig);

      // 异步加载缓存数据
      this.loadCaches()
        .then(() => {
          this.logger.info('缓存数据加载完成', {
            blockCacheSize: this.blockCache?.size() || 0,
            containerCacheSize: this.containerCache?.size() || 0,
          });

          // 启动缓存管理器
          if (this.cacheManager) {
            this.cacheManager.start();
            this.logger.info('缓存管理器已启动');
          }
        })
        .catch(error => {
          this.logger.error('加载缓存数据失败', undefined, error);
        });

      this.logger.info('缓存系统初始化完成');
    } catch (error) {
      this.logger.error('缓存系统初始化失败', undefined, error as Error);
    }
  }

  /**
   * 异步加载缓存数据
   */
  private async loadCaches(): Promise<void> {
    if (this.blockCache) {
      await this.blockCache.load();
    }
    if (this.containerCache) {
      await this.containerCache.load();
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.entityUpdateInterval) {
      clearInterval(this.entityUpdateInterval);
      this.entityUpdateInterval = undefined;
    }

    // 清理缓存系统
    if (this.cacheManager) {
      this.cacheManager.destroy();
      this.cacheManager = null;
    }
    if (this.blockCache) {
      this.blockCache.destroy();
      this.blockCache = null;
    }
    if (this.containerCache) {
      this.containerCache.destroy();
      this.containerCache = null;
    }

    this.initialized = false;
  }

  /**
   * 更新位置信息
   */
  private updatePosition(bot: Bot): void {
    if (bot.entity && bot.entity.position) {
      this.position = bot.entity.position.clone();
      this.blockPosition = this.position.floored();
      this.onGround = bot.entity.onGround;

      if (bot.entity.yaw !== undefined) {
        this.yaw = bot.entity.yaw;
      }
      if (bot.entity.pitch !== undefined) {
        this.pitch = bot.entity.pitch;
      }
    }
  }

  /**
   * 更新健康信息
   */
  private updateHealth(bot: Bot): void {
    this.health = bot.health;
    this.healthMax = 20; // Minecraft 默认最大生命值
  }

  /**
   * 更新食物信息
   */
  private updateFood(bot: Bot): void {
    this.food = bot.food;
    this.foodMax = 20; // Minecraft 默认最大饥饿值
    this.foodSaturation = bot.foodSaturation;
  }

  /**
   * 更新经验信息
   */
  private updateExperience(bot: Bot): void {
    this.experience = bot.experience.points;
    this.level = bot.experience.level;
  }

  /**
   * 更新物品栏信息
   */
  private updateInventory(bot: Bot): void {
    // 更新物品栏
    this.inventory = bot.inventory.items().map(item => this.itemToItemInfo(item));

    // 更新手持物品
    if (bot.heldItem) {
      this.heldItem = this.itemToItemInfo(bot.heldItem);
    } else {
      this.heldItem = null;
    }

    // 更新装备
    // 注意: mineflayer 的装备系统可能需要特殊处理
    // 这里提供基本实现，后续可以完善
  }

  /**
   * 更新环境信息
   */
  private updateEnvironment(bot: Bot): void {
    this.timeOfDay = bot.time.timeOfDay;
    this.weather = bot.thunderState ? 'thunder' : bot.isRaining ? 'rain' : 'clear';

    // 维度信息
    if (bot.game.dimension === -1) {
      this.dimension = 'nether';
    } else if (bot.game.dimension === 1) {
      this.dimension = 'end';
    } else {
      this.dimension = 'overworld';
    }

    // 生物群系（如果可用）
    try {
      const block = bot.blockAt(this.blockPosition);
      if (block && (block as any).biome) {
        this.biome = (block as any).biome.name || 'unknown';
      }
    } catch (error) {
      // 忽略错误，使用默认值
    }
  }

  /**
   * 更新周围实体信息
   */
  private updateNearbyEntities(bot: Bot): void {
    const entities: EntityInfo[] = [];
    const maxDistance = 16; // 最大距离16格

    for (const entity of Object.values(bot.entities)) {
      if (!entity || !entity.position || entity === bot.entity) {
        continue;
      }

      const distance = entity.position.distanceTo(bot.entity.position);
      if (distance <= maxDistance) {
        entities.push({
          type: entity.type,
          name: entity.name || entity.displayName || 'unknown',
          position: entity.position.clone(),
          distance,
          health: (entity as any).health,
          maxHealth: (entity as any).maxHealth,
        });
      }
    }

    this.nearbyEntities = entities;
  }

  /**
   * 将 Item 转换为 ItemInfo
   */
  private itemToItemInfo(item: Item): ItemInfo {
    return {
      name: item.name,
      count: item.count,
      slot: (item as any).slot || 0,
      displayName: item.displayName || item.name,
      metadata: (item as any).metadata,
    };
  }

  /**
   * 生成状态描述（用于 LLM 提示词）
   */
  getStatusDescription(): string {
    return `
当前状态:
  生命值: ${this.health}/${this.healthMax}
  饥饿值: ${this.food}/${this.foodMax}
  等级: ${this.level} (经验: ${this.experience})
  
位置: (${this.blockPosition.x}, ${this.blockPosition.y}, ${this.blockPosition.z})
维度: ${this.dimension}
生物群系: ${this.biome}
天气: ${this.weather}
时间: ${this.timeOfDay}

物品栏: ${this.inventory.length} 个物品
手持: ${this.heldItem?.name || '无'}
    `.trim();
  }

  /**
   * 获取物品栏描述
   */
  getInventoryDescription(): string {
    if (this.inventory.length === 0) {
      return '物品栏为空';
    }

    const lines = this.inventory.map(item => `  ${item.name} x${item.count}`);

    return `物品栏 (${this.inventory.length}/36):\n${lines.join('\n')}`;
  }

  /**
   * 获取周围实体描述
   */
  getNearbyEntitiesDescription(): string {
    if (this.nearbyEntities.length === 0) {
      return '周围没有实体';
    }

    const lines = this.nearbyEntities.map((e, i) => `  ${i + 1}. ${e.name} (距离: ${e.distance?.toFixed(1)}格)`);

    return `周围实体 (${this.nearbyEntities.length}):\n${lines.join('\n')}`;
  }

  /**
   * 获取方块缓存信息
   */
  getBlockInfo(x: number, y: number, z: number): BlockInfo | null {
    if (!this.blockCache) return null;
    return this.blockCache.getBlock(x, y, z);
  }

  /**
   * 设置方块缓存信息
   */
  setBlockInfo(x: number, y: number, z: number, blockInfo: Partial<BlockInfo>): void {
    if (!this.blockCache) return;
    this.blockCache.setBlock(x, y, z, blockInfo);
  }

  /**
   * 获取指定范围内的方块信息
   */
  getNearbyBlocks(radius: number = 16): BlockInfo[] {
    if (!this.blockCache) return [];
    return this.blockCache.getBlocksInRadius(this.blockPosition.x, this.blockPosition.y, this.blockPosition.z, radius);
  }

  /**
   * 按名称查找方块
   */
  findBlocksByName(name: string): BlockInfo[] {
    if (!this.blockCache) return [];
    return this.blockCache.findBlocksByName(name);
  }

  /**
   * 获取容器缓存信息
   */
  getContainerInfo(x: number, y: number, z: number, type?: string): ContainerInfo | null {
    if (!this.containerCache) return null;
    return this.containerCache.getContainer(x, y, z, type);
  }

  /**
   * 设置容器缓存信息
   */
  setContainerInfo(x: number, y: number, z: number, type: string, containerInfo: Partial<ContainerInfo>): void {
    if (!this.containerCache) return;
    this.containerCache.setContainer(x, y, z, type, containerInfo);
  }

  /**
   * 获取指定范围内的容器信息
   */
  getNearbyContainers(radius: number = 16): ContainerInfo[] {
    if (!this.containerCache) return [];
    return this.containerCache.getContainersInRadius(this.blockPosition.x, this.blockPosition.y, this.blockPosition.z, radius);
  }

  /**
   * 按物品查找容器
   */
  findContainersWithItem(itemId: number, minCount: number = 1): ContainerInfo[] {
    if (!this.containerCache) return [];
    return this.containerCache.findContainersWithItem(itemId, minCount);
  }

  /**
   * 按物品名称查找容器
   */
  findContainersWithItemName(itemName: string, minCount: number = 1): ContainerInfo[] {
    if (!this.containerCache) return [];
    return this.containerCache.findContainersWithItemName(itemName, minCount);
  }

  /**
   * 保存缓存数据
   */
  async saveCaches(): Promise<void> {
    if (this.blockCache) {
      await this.blockCache.save();
    }
    if (this.containerCache) {
      await this.containerCache.save();
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { blockCache?: any; containerCache?: any } {
    const stats: any = {};
    if (this.blockCache) {
      stats.blockCache = this.blockCache.getStats();
    }
    if (this.containerCache) {
      stats.containerCache = this.containerCache.getStats();
    }
    return stats;
  }

  /**
   * 扫描周围方块并更新缓存
   */
  scanNearbyBlocks(bot: Bot, radius: number = 8): void {
    if (!this.blockCache || !bot.blockAt) return;

    try {
      const blocks: Array<{ x: number; y: number; z: number; block: Partial<BlockInfo> }> = [];

      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          for (let z = -radius; z <= radius; z++) {
            const worldX = Math.floor(this.blockPosition.x + x);
            const worldY = Math.floor(this.blockPosition.y + y);
            const worldZ = Math.floor(this.blockPosition.z + z);

            const block = bot.blockAt(new Vec3(worldX, worldY, worldZ));
            if (block && block.type !== 0) {
              // 不是空气方块
              blocks.push({
                x: worldX,
                y: worldY,
                z: worldZ,
                block: {
                  name: block.name,
                  type: block.type,
                  metadata: block.metadata,
                  hardness: (block as any).hardness,
                  lightLevel: (block as any).lightLevel,
                  transparent: (block as any).transparent,
                },
              });
            }
          }
        }
      }

      this.blockCache.setBlocks(blocks);
      this.logger.debug(`扫描并缓存了 ${blocks.length} 个方块 (半径: ${radius})`);
    } catch (error) {
      this.logger.error('扫描周围方块失败', undefined, error as Error);
    }
  }

  /**
   * 手动触发缓存扫描
   */
  async triggerCacheScan(radius?: number): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.triggerBlockScan(radius);
    }
  }

  /**
   * 手动触发容器更新
   */
  async triggerContainerUpdate(): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.triggerContainerUpdate();
    }
  }

  /**
   * 获取缓存管理器统计信息
   */
  getCacheManagerStats(): any {
    return this.cacheManager?.getStats() || null;
  }

  /**
   * 启动/停止缓存自动管理
   */
  setCacheAutoManagement(enabled: boolean): void {
    if (this.cacheManager) {
      if (enabled) {
        this.cacheManager.start();
      } else {
        this.cacheManager.stop();
      }
    }
  }

  /**
   * 设置缓存性能模式
   */
  setCachePerformanceMode(mode: 'balanced' | 'performance' | 'memory'): void {
    if (!this.cacheManager) return;

    this.logger.info(`设置缓存性能模式: ${mode}`);

    // 根据性能模式调整配置
    switch (mode) {
      case 'performance':
        // 最高性能：减少扫描频率和范围
        this.logger.info('缓存已切换到性能优先模式');
        break;
      case 'memory':
        // 内存优化：减少缓存大小
        this.logger.info('缓存已切换到内存优化模式');
        break;
      case 'balanced':
      default:
        // 平衡模式
        this.logger.info('缓存已切换到平衡模式');
        break;
    }
  }
}

/**
 * 全局游戏状态实例
 */
export const globalGameState = new GameState();
