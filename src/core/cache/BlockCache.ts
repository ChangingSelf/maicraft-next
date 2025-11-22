/**
 * 方块缓存系统
 * 提供 Minecraft 方块信息的缓存、查询和持久化功能
 */

import { promises as fs } from 'fs';
import { Vec3 } from 'vec3';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { BlockInfo, CacheConfig, CacheStats, BlockKeyGenerator } from './types';

export class BlockCache {
  private cache: Map<string, BlockInfo> = new Map();
  private chunkIndex: Map<string, Set<string>> = new Map(); // 🔧 区块索引：chunkKey -> Set<blockKey>
  private logger: Logger;
  private persistPath: string;
  private config: CacheConfig;
  private stats: CacheStats;
  private keyGenerator: BlockKeyGenerator;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(config?: Partial<CacheConfig>, persistPath?: string) {
    this.logger = getLogger('BlockCache');
    this.persistPath = persistPath || 'data/block_cache.json';
    this.keyGenerator = this.defaultKeyGenerator;

    // 默认配置
    this.config = {
      maxEntries: 0, // 🔧 设为0表示无限制，完全依赖区块卸载事件清理
      expirationTime: 30 * 60 * 1000, // 30分钟
      autoSaveInterval: 5 * 60 * 1000, // 5分钟
      enabled: true,
      updateStrategy: 'smart',
      onlyVisibleBlocks: true, // 🆕 只缓存可见方块（更拟人化，节省内存）
      ...config,
    };

    // 初始化统计信息
    this.stats = {
      totalEntries: 0,
      expiredEntries: 0,
      lastUpdate: Date.now(),
      hitRate: 0,
      totalQueries: 0,
      totalHits: 0,
    };

    this.logger.info('BlockCache 初始化完成', {
      config: this.config,
      persistPath: this.persistPath,
    });

    // 启动自动保存
    this.startAutoSave();
  }

  /**
   * 默认的缓存键生成器
   */
  private defaultKeyGenerator(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * 生成区块键
   */
  private getChunkKey(x: number, z: number): string {
    const chunkX = x >> 4; // 除以16
    const chunkZ = z >> 4;
    return `${chunkX},${chunkZ}`;
  }

  /**
   * 获取方块信息
   */
  getBlock(x: number, y: number, z: number): BlockInfo | null {
    if (!this.config.enabled) return null;

    const key = this.keyGenerator(x, y, z);
    this.stats.totalQueries++;

    const blockInfo = this.cache.get(key);
    if (!blockInfo) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(blockInfo)) {
      this.cache.delete(key);
      this.logger.debug(`方块缓存已过期，已移除: ${key}`);
      return null;
    }

    this.stats.totalHits++;
    this.stats.hitRate = this.stats.totalHits / this.stats.totalQueries;

    return blockInfo;
  }

  /**
   * 设置方块信息
   * 🔧 精简版：只存储必要信息，减少内存占用
   * 🆕 支持只缓存可见方块（onlyVisibleBlocks配置）
   */
  setBlock(x: number, y: number, z: number, block: Partial<BlockInfo> & { canSee?: boolean }): void {
    if (!this.config.enabled) return;

    // 🆕 如果启用"只缓存可见方块"且方块不可见，则跳过
    if (this.config.onlyVisibleBlocks && block.canSee === false) {
      return;
    }

    const key = this.keyGenerator(x, y, z);
    const now = Date.now();

    // 检查缓存大小限制（0表示无限制）
    if (this.config.maxEntries > 0 && this.cache.size >= this.config.maxEntries) {
      this.evictOldestEntries();
    }

    // 🔧 只存储必要字段，不存储 canSee（已通过过滤保证都是可见的）
    const blockInfo: BlockInfo = {
      name: block.name || 'unknown',
      type: block.type || 0,
      position: new Vec3(x, y, z),
      timestamp: now,
    };

    this.cache.set(key, blockInfo);

    // 🔧 更新区块索引
    const chunkKey = this.getChunkKey(x, z);
    if (!this.chunkIndex.has(chunkKey)) {
      this.chunkIndex.set(chunkKey, new Set());
    }
    this.chunkIndex.get(chunkKey)!.add(key);

    this.stats.totalEntries = this.cache.size;
    this.stats.lastUpdate = now;
  }

  /**
   * 批量设置方块信息
   * 🔧 精简版：只存储必要信息，减少内存占用
   */
  setBlocks(blocks: Array<{ x: number; y: number; z: number; block: Partial<BlockInfo> & { canSee?: boolean } }>): void {
    if (!this.config.enabled) return;

    const now = Date.now();

    // 🔧 优化：批量添加前检查一次容量，避免频繁驱逐（0表示无限制）
    if (this.config.maxEntries > 0) {
      const spaceNeeded = this.cache.size + blocks.length - this.config.maxEntries;
      if (spaceNeeded > 0) {
        // 一次性驱逐足够的空间
        this.evictOldestEntries(Math.max(spaceNeeded, 5000));
      }
    }

    // 批量添加（只存储必要字段）
    for (const { x, y, z, block } of blocks) {
      // 🆕 如果启用"只缓存可见方块"且方块不可见，则跳过
      if (this.config.onlyVisibleBlocks && block.canSee === false) {
        continue;
      }

      const key = this.keyGenerator(x, y, z);
      const blockInfo: BlockInfo = {
        name: block.name || 'unknown',
        type: block.type || 0,
        position: new Vec3(x, y, z),
        timestamp: now,
      };
      this.cache.set(key, blockInfo);

      // 🔧 更新区块索引
      const chunkKey = this.getChunkKey(x, z);
      if (!this.chunkIndex.has(chunkKey)) {
        this.chunkIndex.set(chunkKey, new Set());
      }
      this.chunkIndex.get(chunkKey)!.add(key);
    }

    this.stats.totalEntries = this.cache.size;
    this.stats.lastUpdate = now;
  }

  /**
   * 删除方块缓存
   */
  removeBlock(x: number, y: number, z: number): boolean {
    const key = this.keyGenerator(x, y, z);
    const deleted = this.cache.delete(key);

    if (deleted) {
      // 🔧 更新区块索引
      const chunkKey = this.getChunkKey(x, z);
      const chunkSet = this.chunkIndex.get(chunkKey);
      if (chunkSet) {
        chunkSet.delete(key);
        // 如果区块为空，删除区块索引
        if (chunkSet.size === 0) {
          this.chunkIndex.delete(chunkKey);
        }
      }

      this.stats.totalEntries = this.cache.size;
      this.logger.debug(`方块缓存已删除: ${key}`);
    }

    return deleted;
  }

  /**
   * 获取指定范围内的方块
   * 🔧 优化：使用区块索引，只查询附近区块，而不是遍历所有缓存
   */
  getBlocksInRadius(centerX: number, centerY: number, centerZ: number, radius: number): BlockInfo[] {
    const blocks: BlockInfo[] = [];
    let expired = 0;
    let outOfRange = 0;
    let checkedBlocks = 0;

    // 计算需要检查的区块范围
    const centerChunkX = Math.floor(centerX / 16);
    const centerChunkZ = Math.floor(centerZ / 16);
    const chunkRadius = Math.ceil(radius / 16) + 1; // 多查1个区块确保覆盖

    // 只遍历附近的区块
    for (let chunkX = centerChunkX - chunkRadius; chunkX <= centerChunkX + chunkRadius; chunkX++) {
      for (let chunkZ = centerChunkZ - chunkRadius; chunkZ <= centerChunkZ + chunkRadius; chunkZ++) {
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunkBlockKeys = this.chunkIndex.get(chunkKey);

        if (!chunkBlockKeys) continue;

        // 遍历该区块内的方块
        for (const blockKey of chunkBlockKeys) {
          const blockInfo = this.cache.get(blockKey);
          if (!blockInfo) continue;

          checkedBlocks++;

          if (this.isExpired(blockInfo)) {
            expired++;
            continue;
          }

          const distance = Math.sqrt(
            Math.pow(blockInfo.position.x - centerX, 2) + Math.pow(blockInfo.position.y - centerY, 2) + Math.pow(blockInfo.position.z - centerZ, 2),
          );

          if (distance <= radius) {
            blocks.push(blockInfo);
          } else {
            outOfRange++;
          }
        }
      }
    }

    if (blocks.length < 100) {
      // 只有在结果很少时才记录，避免日志过多
      this.logger.warn(
        `⚠️ getBlocksInRadius结果少: 中心(${centerX},${centerY},${centerZ}) 半径:${radius} 找到:${blocks.length} 检查:${checkedBlocks} 过期:${expired} 超出范围:${outOfRange} 总缓存:${this.cache.size}`,
      );

      // 采样显示缓存中的方块位置
      if (this.cache.size > 0 && checkedBlocks > 0) {
        // 显示检查的区块范围
        this.logger.warn(
          `查询区块范围: chunk(${centerChunkX - chunkRadius},${centerChunkZ - chunkRadius}) 到 chunk(${centerChunkX + chunkRadius},${centerChunkZ + chunkRadius})`,
        );
      }
    } else {
      this.logger.debug(`查询成功: 位置(${centerX},${centerY},${centerZ}) 半径${radius} 找到${blocks.length}个方块 (检查${checkedBlocks}个)`);
    }

    return blocks;
  }

  /**
   * 按方块类型查找方块
   */
  findBlocksByName(name: string): BlockInfo[] {
    const blocks: BlockInfo[] = [];

    for (const blockInfo of this.cache.values()) {
      if (this.isExpired(blockInfo)) {
        continue;
      }

      if (blockInfo.name === name) {
        blocks.push(blockInfo);
      }
    }

    return blocks;
  }

  /**
   * 按方块类型查找方块 (支持模糊匹配)
   */
  findBlocksByPattern(pattern: string): BlockInfo[] {
    const regex = new RegExp(pattern, 'i');
    const blocks: BlockInfo[] = [];

    for (const blockInfo of this.cache.values()) {
      if (this.isExpired(blockInfo)) {
        continue;
      }

      if (regex.test(blockInfo.name)) {
        blocks.push(blockInfo);
      }
    }

    return blocks;
  }

  /**
   * 检查方块信息是否过期
   */
  private isExpired(blockInfo: BlockInfo): boolean {
    // 🔧 如果 expirationTime 为 0，表示永不过期，完全依赖区块卸载清理
    if (this.config.expirationTime === 0) {
      return false;
    }
    return Date.now() - blockInfo.timestamp > this.config.expirationTime;
  }

  /**
   * 清理过期的缓存条目
   */
  cleanupExpiredEntries(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, blockInfo] of this.cache) {
      if (this.isExpired(blockInfo)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    this.stats.totalEntries = this.cache.size;
    this.stats.expiredEntries = cleanedCount;

    if (cleanedCount > 0) {
      this.logger.info(`已清理 ${cleanedCount} 个过期的方块缓存`);
    }

    return cleanedCount;
  }

  /**
   * 驱逐最旧的缓存条目
   */
  private evictOldestEntries(count?: number): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const evictCount = count || Math.floor(this.config.maxEntries * 0.1); // 默认驱逐10%的旧条目
    let actualEvicted = 0;
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
      actualEvicted++;
    }

    this.stats.totalEntries = this.cache.size;
    if (actualEvicted > 0) {
      this.logger.info(`已驱逐 ${actualEvicted} 个最旧的方块缓存`);
    }
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    if (this.config.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        this.save().catch(error => {
          this.logger.error('自动保存失败', undefined, error as Error);
        });
      }, this.config.autoSaveInterval);
    }
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * 保存缓存到文件
   */
  async save(): Promise<void> {
    // 🔧 如果 autoSaveInterval 为 0，则跳过保存（禁用持久化）
    if (this.config.autoSaveInterval === 0) {
      this.logger.debug('持久化已禁用，跳过保存');
      return;
    }

    try {
      // 清理过期条目
      this.cleanupExpiredEntries();

      const data = Array.from(this.cache.entries());
      const saveData = {
        version: '1.0',
        timestamp: Date.now(),
        stats: this.stats,
        entries: data,
      };

      await fs.writeFile(this.persistPath, JSON.stringify(saveData, null, 2), 'utf-8');
      this.logger.info(`BlockCache 保存完成，已保存 ${data.length} 个方块缓存`);
    } catch (error) {
      this.logger.error('保存 BlockCache 失败', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 从文件加载缓存
   */
  async load(): Promise<void> {
    // 🔧 如果 autoSaveInterval 为 0，则跳过加载（禁用持久化）
    if (this.config.autoSaveInterval === 0) {
      this.logger.info('持久化已禁用，跳过加载，使用空缓存');
      return;
    }

    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      const saveData = JSON.parse(content);

      if (saveData.version && saveData.entries) {
        // 新版本格式
        this.cache = new Map(saveData.entries);
        if (saveData.stats) {
          this.stats = { ...this.stats, ...saveData.stats };
        }
      } else {
        // 旧版本兼容
        this.cache = new Map(saveData);
      }

      this.stats.totalEntries = this.cache.size;

      // 🔧 重建区块索引
      this.rebuildChunkIndex();

      this.logger.info(`BlockCache 加载完成，已加载 ${this.cache.size} 个方块缓存，区块索引 ${this.chunkIndex.size} 个区块`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('BlockCache 文件不存在，跳过加载');
      } else {
        this.logger.error('加载 BlockCache 失败', undefined, error as Error);
        throw error;
      }
    }
  }

  /**
   * 重建区块索引
   * 在加载缓存或清理后需要调用
   */
  private rebuildChunkIndex(): void {
    this.chunkIndex.clear();

    for (const [key, blockInfo] of this.cache) {
      const chunkKey = this.getChunkKey(blockInfo.position.x, blockInfo.position.z);
      if (!this.chunkIndex.has(chunkKey)) {
        this.chunkIndex.set(chunkKey, new Set());
      }
      this.chunkIndex.get(chunkKey)!.add(key);
    }

    this.logger.debug(`区块索引重建完成: ${this.chunkIndex.size} 个区块`);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalEntries = 0;
    this.stats.lastUpdate = Date.now();
    this.logger.info('BlockCache 已清空');
  }

  /**
   * 清除超出指定范围的方块缓存
   * @param centerX 中心X坐标
   * @param centerY 中心Y坐标
   * @param centerZ 中心Z坐标
   * @param maxDistance 最大保留距离
   * @returns 清除的方块数量
   */
  clearOutOfRange(centerX: number, centerY: number, centerZ: number, maxDistance: number): number {
    if (!this.config.enabled) return 0;

    let removedCount = 0;
    const keysToRemove: string[] = [];

    for (const [key, blockInfo] of this.cache) {
      const distance = Math.sqrt(
        Math.pow(blockInfo.position.x - centerX, 2) + Math.pow(blockInfo.position.y - centerY, 2) + Math.pow(blockInfo.position.z - centerZ, 2),
      );

      if (distance > maxDistance) {
        keysToRemove.push(key);
      }
    }

    // 批量删除
    for (const key of keysToRemove) {
      this.cache.delete(key);
      removedCount++;
    }

    this.stats.totalEntries = this.cache.size;

    if (removedCount > 0) {
      this.logger.info(`🗑️ 清除了 ${removedCount} 个超出范围(${maxDistance}格)的方块缓存`);
    }

    return removedCount;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 启用/禁用缓存
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.logger.info(`BlockCache ${enabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 销毁缓存实例
   */
  destroy(): void {
    this.stopAutoSave();
    this.clear();
    this.logger.info('BlockCache 已销毁');
  }
}
