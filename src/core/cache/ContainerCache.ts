/**
 * 容器缓存系统
 * 提供 Minecraft 容器信息的缓存、查询和持久化功能
 */

import { promises as fs } from 'fs';
import { Vec3 } from 'vec3';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { ContainerInfo, ContainerItem, CacheConfig, CacheStats, ContainerKeyGenerator } from './types';

export class ContainerCache {
  private cache: Map<string, ContainerInfo> = new Map();
  private logger: Logger;
  private persistPath: string;
  private config: CacheConfig;
  private stats: CacheStats;
  private keyGenerator: ContainerKeyGenerator;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(config?: Partial<CacheConfig>, persistPath?: string) {
    this.logger = getLogger('ContainerCache');
    this.persistPath = persistPath || 'data/container_cache.json';
    this.keyGenerator = this.defaultKeyGenerator;

    // 默认配置
    this.config = {
      maxEntries: 1000,
      expirationTime: 60 * 60 * 1000, // 1小时
      autoSaveInterval: 10 * 60 * 1000, // 10分钟
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

    this.logger.info('ContainerCache 初始化完成', {
      config: this.config,
      persistPath: this.persistPath,
    });

    // 启动自动保存
    this.startAutoSave();
  }

  /**
   * 默认的缓存键生成器
   */
  private defaultKeyGenerator(x: number, y: number, z: number, type: string): string {
    return `${type}:${x},${y},${z}`;
  }

  /**
   * 获取容器信息
   */
  getContainer(x: number, y: number, z: number, type?: string): ContainerInfo | null {
    if (!this.config.enabled) return null;

    this.stats.totalQueries++;

    // 如果没有指定类型，尝试所有可能的类型
    if (!type) {
      const possibleTypes = ['chest', 'furnace', 'brewing_stand', 'dispenser', 'hopper', 'shulker_box'];
      for (const containerType of possibleTypes) {
        const key = this.keyGenerator(x, y, z, containerType);
        const containerInfo = this.cache.get(key);
        if (containerInfo && !this.isExpired(containerInfo)) {
          this.stats.totalHits++;
          this.stats.hitRate = this.stats.totalHits / this.stats.totalQueries;
          return containerInfo;
        }
      }
      return null;
    }

    const key = this.keyGenerator(x, y, z, type);
    const containerInfo = this.cache.get(key);

    if (!containerInfo) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(containerInfo)) {
      this.cache.delete(key);
      this.logger.debug(`容器缓存已过期，已移除: ${key}`);
      return null;
    }

    this.stats.totalHits++;
    this.stats.hitRate = this.stats.totalHits / this.stats.totalQueries;

    return containerInfo;
  }

  /**
   * 设置容器信息
   */
  setContainer(x: number, y: number, z: number, type: string, container: Partial<ContainerInfo>): void {
    if (!this.config.enabled) return;

    const key = this.keyGenerator(x, y, z, type);
    const now = Date.now();

    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldestEntries();
    }

    const containerInfo: ContainerInfo = {
      type: type as ContainerInfo['type'],
      position: new Vec3(x, y, z),
      items: container.items || [],
      lastAccessed: now,
      size: container.size || this.getDefaultContainerSize(type),
      ...container,
    };

    this.cache.set(key, containerInfo);
    this.stats.totalEntries = this.cache.size;
    this.stats.lastUpdate = now;

    this.logger.debug(`容器缓存已更新: ${key} -> ${containerInfo.type}`);
  }

  /**
   * 获取默认容器大小
   */
  private getDefaultContainerSize(type: string): number {
    const sizes: Record<string, number> = {
      chest: 27,
      furnace: 3,
      brewing_stand: 5,
      dispenser: 9,
      hopper: 5,
      shulker_box: 27,
    };
    return sizes[type] || 9;
  }

  /**
   * 更新容器物品
   */
  updateContainerItems(x: number, y: number, z: number, type: string, items: ContainerItem[]): void {
    const existingContainer = this.getContainer(x, y, z, type);
    if (existingContainer) {
      existingContainer.items = items;
      existingContainer.lastAccessed = Date.now();
      const key = this.keyGenerator(x, y, z, type);
      this.cache.set(key, existingContainer);
      this.logger.debug(`容器物品已更新: ${key}`);
    } else {
      this.setContainer(x, y, z, type, { items });
    }
  }

  /**
   * 添加物品到容器
   */
  addItemToContainer(x: number, y: number, z: number, type: string, item: ContainerItem): boolean {
    const container = this.getContainer(x, y, z, type);
    if (!container) {
      return false;
    }

    // 查找是否有相同的物品可以堆叠
    const existingItem = container.items.find(existing => existing.itemId === item.itemId && existing.name === item.name);

    if (existingItem) {
      existingItem.count += item.count;
    } else {
      container.items.push(item);
    }

    container.lastAccessed = Date.now();
    const key = this.keyGenerator(x, y, z, type);
    this.cache.set(key, container);

    return true;
  }

  /**
   * 从容器移除物品
   */
  removeItemFromContainer(x: number, y: number, z: number, type: string, itemId: number, count: number = 1): boolean {
    const container = this.getContainer(x, y, z, type);
    if (!container) {
      return false;
    }

    const itemIndex = container.items.findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return false;
    }

    const item = container.items[itemIndex];
    if (item.count <= count) {
      container.items.splice(itemIndex, 1);
    } else {
      item.count -= count;
    }

    container.lastAccessed = Date.now();
    const key = this.keyGenerator(x, y, z, type);
    this.cache.set(key, container);

    return true;
  }

  /**
   * 删除容器缓存
   */
  removeContainer(x: number, y: number, z: number, type: string): boolean {
    const key = this.keyGenerator(x, y, z, type);
    const deleted = this.cache.delete(key);

    if (deleted) {
      this.stats.totalEntries = this.cache.size;
      this.logger.debug(`容器缓存已删除: ${key}`);
    }

    return deleted;
  }

  /**
   * 获取指定范围内的容器
   */
  getContainersInRadius(centerX: number, centerY: number, centerZ: number, radius: number): ContainerInfo[] {
    const containers: ContainerInfo[] = [];

    for (const [key, containerInfo] of this.cache) {
      if (this.isExpired(containerInfo)) {
        continue;
      }

      const distance = Math.sqrt(
        Math.pow(containerInfo.position.x - centerX, 2) +
          Math.pow(containerInfo.position.y - centerY, 2) +
          Math.pow(containerInfo.position.z - centerZ, 2),
      );

      if (distance <= radius) {
        containers.push(containerInfo);
      }
    }

    return containers;
  }

  /**
   * 按类型查找容器
   */
  findContainersByType(type: string): ContainerInfo[] {
    const containers: ContainerInfo[] = [];

    for (const containerInfo of this.cache.values()) {
      if (this.isExpired(containerInfo)) {
        continue;
      }

      if (containerInfo.type === type) {
        containers.push(containerInfo);
      }
    }

    return containers;
  }

  /**
   * 按物品查找容器
   */
  findContainersWithItem(itemId: number, minCount: number = 1): ContainerInfo[] {
    const containers: ContainerInfo[] = [];

    for (const containerInfo of this.cache.values()) {
      if (this.isExpired(containerInfo)) {
        continue;
      }

      const totalItems = containerInfo.items.filter(item => item.itemId === itemId).reduce((sum, item) => sum + item.count, 0);

      if (totalItems >= minCount) {
        containers.push(containerInfo);
      }
    }

    return containers;
  }

  /**
   * 按物品名称查找容器
   */
  findContainersWithItemName(itemName: string, minCount: number = 1): ContainerInfo[] {
    const containers: ContainerInfo[] = [];

    for (const containerInfo of this.cache.values()) {
      if (this.isExpired(containerInfo)) {
        continue;
      }

      const totalItems = containerInfo.items
        .filter(item => item.name.toLowerCase().includes(itemName.toLowerCase()))
        .reduce((sum, item) => sum + item.count, 0);

      if (totalItems >= minCount) {
        containers.push(containerInfo);
      }
    }

    return containers;
  }

  /**
   * 检查容器信息是否过期
   */
  private isExpired(containerInfo: ContainerInfo): boolean {
    return Date.now() - containerInfo.lastAccessed > this.config.expirationTime;
  }

  /**
   * 清理过期的缓存条目
   */
  cleanupExpiredEntries(): number {
    let cleanedCount = 0;

    for (const [key, containerInfo] of this.cache) {
      if (this.isExpired(containerInfo)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    this.stats.totalEntries = this.cache.size;
    this.stats.expiredEntries = cleanedCount;

    if (cleanedCount > 0) {
      this.logger.info(`已清理 ${cleanedCount} 个过期的容器缓存`);
    }

    return cleanedCount;
  }

  /**
   * 驱逐最旧的缓存条目
   */
  private evictOldestEntries(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const evictCount = Math.floor(this.config.maxEntries * 0.1); // 驱逐10%的旧条目
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.stats.totalEntries = this.cache.size;
    this.logger.info(`已驱逐 ${evictCount} 个最旧的容器缓存`);
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
      this.logger.info(`ContainerCache 保存完成，已保存 ${data.length} 个容器缓存`);
    } catch (error) {
      this.logger.error('保存 ContainerCache 失败', undefined, error as Error);
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
      this.logger.info(`ContainerCache 加载完成，已加载 ${this.cache.size} 个容器缓存`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('ContainerCache 文件不存在，跳过加载');
      } else {
        this.logger.error('加载 ContainerCache 失败', undefined, error as Error);
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
    this.logger.info('ContainerCache 已清空');
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
    this.logger.info(`ContainerCache ${enabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 销毁缓存实例
   */
  destroy(): void {
    this.stopAutoSave();
    this.clear();
    this.logger.info('ContainerCache 已销毁');
  }
}
