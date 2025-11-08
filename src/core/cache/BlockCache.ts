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
      maxEntries: 10000,
      expirationTime: 30 * 60 * 1000, // 30分钟
      autoSaveInterval: 5 * 60 * 1000, // 5分钟
      enabled: true,
      updateStrategy: 'smart',
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
   */
  setBlock(x: number, y: number, z: number, block: Partial<BlockInfo>): void {
    if (!this.config.enabled) return;

    const key = this.keyGenerator(x, y, z);
    const now = Date.now();

    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldestEntries();
    }

    const blockInfo: BlockInfo = {
      name: block.name || 'unknown',
      type: block.type || 0,
      position: new Vec3(x, y, z),
      timestamp: now,
      ...block,
    };

    this.cache.set(key, blockInfo);
    this.stats.totalEntries = this.cache.size;
    this.stats.lastUpdate = now;
  }

  /**
   * 批量设置方块信息
   */
  setBlocks(blocks: Array<{ x: number; y: number; z: number; block: Partial<BlockInfo> }>): void {
    if (!this.config.enabled) return;

    for (const { x, y, z, block } of blocks) {
      this.setBlock(x, y, z, block);
    }
  }

  /**
   * 删除方块缓存
   */
  removeBlock(x: number, y: number, z: number): boolean {
    const key = this.keyGenerator(x, y, z);
    const deleted = this.cache.delete(key);

    if (deleted) {
      this.stats.totalEntries = this.cache.size;
      this.logger.debug(`方块缓存已删除: ${key}`);
    }

    return deleted;
  }

  /**
   * 获取指定范围内的方块
   */
  getBlocksInRadius(centerX: number, centerY: number, centerZ: number, radius: number): BlockInfo[] {
    const blocks: BlockInfo[] = [];
    let expired = 0;
    let outOfRange = 0;

    for (const [key, blockInfo] of this.cache) {
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

    if (blocks.length < 100) {
      // 只有在结果很少时才记录，避免日志过多
      this.logger.warn(
        `⚠️ getBlocksInRadius结果少: 中心(${centerX},${centerY},${centerZ}) 半径:${radius} 找到:${blocks.length} 过期:${expired} 超出范围:${outOfRange} 总缓存:${this.cache.size}`,
      );

      // 采样显示缓存中的方块位置
      if (this.cache.size > 0) {
        const samples = Array.from(this.cache.values())
          .slice(0, 3)
          .map(b => `(${b.position.x},${b.position.y},${b.position.z}):${b.name}`)
          .join(', ');
        this.logger.warn(`缓存示例: ${samples}`);
      }
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
  private evictOldestEntries(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const evictCount = Math.floor(this.config.maxEntries * 0.1); // 驱逐10%的旧条目
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.stats.totalEntries = this.cache.size;
    this.logger.info(`已驱逐 ${evictCount} 个最旧的方块缓存`);
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
      this.logger.info(`BlockCache 加载完成，已加载 ${this.cache.size} 个方块缓存`);
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
