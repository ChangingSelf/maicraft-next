/**
 * 缓存管理器
 * 负责缓存的自动更新、过期清理和同步策略
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { getLogger, type Logger } from '@/utils/Logger';
import type { BlockCache } from './BlockCache';
import type { ContainerCache } from './ContainerCache';

export interface CacheManagerConfig {
  /** 方块扫描间隔（毫秒） */
  blockScanInterval: number;
  /** 方块扫描半径 */
  blockScanRadius: number;
  /** 容器更新间隔（毫秒） */
  containerUpdateInterval: number;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval: number;
  /** 启用自动扫描 */
  enableAutoScan: boolean;
  /** 启用自动保存 */
  enableAutoSave: boolean;
  /** 性能模式 */
  performanceMode: 'balanced' | 'performance' | 'memory';
}

export class CacheManager {
  private logger: Logger;
  private blockScanTimer?: NodeJS.Timeout;
  private containerUpdateTimer?: NodeJS.Timeout;
  private autoSaveTimer?: NodeJS.Timeout;
  private isScanning: boolean = false;
  private lastScanPosition: Vec3 = new Vec3(0, 0, 0);
  private config: CacheManagerConfig;

  constructor(
    private bot: Bot,
    private blockCache: BlockCache | null,
    private containerCache: ContainerCache | null,
    config?: Partial<CacheManagerConfig>,
  ) {
    this.logger = getLogger('CacheManager');
    this.config = {
      blockScanInterval: 1 * 1000, // 1秒
      blockScanRadius: 50, // 50格半径，确保能检测到容器
      containerUpdateInterval: 10 * 1000, // 10秒
      autoSaveInterval: 1 * 60 * 1000, // 1分钟
      enableAutoScan: true,
      enableAutoSave: true,
      performanceMode: 'balanced' as const,
      ...config,
    };

    this.logger.info('缓存管理器初始化完成', { config: this.config });
  }

  /**
   * 启动缓存管理器
   */
  start(): void {
    if (this.config.enableAutoScan) {
      this.startBlockScanning();
      this.startContainerUpdating();
    }

    if (this.config.enableAutoSave) {
      this.startAutoSave();
    }

    this.logger.info('缓存管理器已启动');
  }

  /**
   * 停止缓存管理器
   */
  stop(): void {
    this.stopBlockScanning();
    this.stopContainerUpdating();
    this.stopAutoSave();

    this.logger.info('缓存管理器已停止');
  }

  /**
   * 启动方块扫描
   */
  private startBlockScanning(): void {
    this.blockScanTimer = setInterval(() => {
      this.scanNearbyBlocks();
    }, this.config.blockScanInterval);

    this.logger.info(`✅ 方块扫描已启动，间隔: ${this.config.blockScanInterval}ms，半径: ${this.config.blockScanRadius}`);
  }

  /**
   * 停止方块扫描
   */
  private stopBlockScanning(): void {
    if (this.blockScanTimer) {
      clearInterval(this.blockScanTimer);
      this.blockScanTimer = undefined;
    }
  }

  /**
   * 启动容器更新
   */
  private startContainerUpdating(): void {
    this.containerUpdateTimer = setInterval(() => {
      this.updateNearbyContainers();
    }, this.config.containerUpdateInterval);

    this.logger.debug(`容器更新已启动，间隔: ${this.config.containerUpdateInterval}ms`);
  }

  /**
   * 停止容器更新
   */
  private stopContainerUpdating(): void {
    if (this.containerUpdateTimer) {
      clearInterval(this.containerUpdateTimer);
      this.containerUpdateTimer = undefined;
    }
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      // 保存前清理过期缓存
      this.cleanupExpiredCache();

      this.saveCaches().catch(error => {
        this.logger.error('自动保存失败', undefined, error);
      });
    }, this.config.autoSaveInterval);

    this.logger.debug(`自动保存已启动，间隔: ${this.config.autoSaveInterval}ms`);
  }

  /**
   * 清理过期的缓存
   */
  private cleanupExpiredCache(): void {
    if (!this.blockCache || !this.bot.entity) return;

    // 使用与查询相同的坐标系（整数坐标），避免坐标系不一致问题
    const currentPos = this.bot.entity.position.floored();

    // 扩大清理范围到1000格，避免频繁清理影响缓存效果
    const removed = this.blockCache.clearOutOfRange(currentPos.x, currentPos.y, currentPos.z, 1000);

    if (removed > 0) {
      this.logger.info(`🧹 定期清理: 移除 ${removed} 个超出范围(1000格)的方块缓存`);
    }
  }

  /**
   * 停止自动保存
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * 扫描周围方块 - 实时模式，每次都扫描
   */
  private async scanNearbyBlocks(): Promise<void> {
    if (!this.blockCache || !this.bot.entity || this.isScanning) {
      return;
    }

    // 不检查移动阈值，每次都扫描（实时更新模式）
    const currentPosition = this.bot.entity.position;

    this.isScanning = true;
    this.lastScanPosition = currentPosition.clone();

    try {
      const blocks: Array<{ x: number; y: number; z: number; block: any }> = [];
      const radius = this.config.blockScanRadius;
      const centerPos = currentPosition.floored();
      let totalBlocks = 0;

      // 性能控制：限制扫描时间和方块数量 (为AI决策优化)
      const maxScanTime = 800; // 最大扫描时间800ms，允许扫描大范围
      const maxBlocks = 10000; // 最多缓存10000个方块，50格半径需要更多容量
      const scanStartTime = Date.now();

      // 扫描周围的方块（全范围Y轴扫描）
      const scanStartY = Math.max(0, centerPos.y - radius); // 下方扫描半径格
      const scanEndY = Math.min(centerPos.y + radius, 255); // 上方扫描半径格

      let airCount = 0;
      let skipCount = 0;

      scanLoop: for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
          for (let y = scanStartY; y <= scanEndY; y++) {
            // 性能控制：检查扫描时间
            if (Date.now() - scanStartTime > maxScanTime) {
              break scanLoop;
            }

            // 性能控制：限制方块数量
            if (blocks.length >= maxBlocks) {
              break scanLoop;
            }

            const worldX = centerPos.x + x;
            const worldY = y; // 直接使用y，因为scanStartY和scanEndY已经是绝对坐标
            const worldZ = centerPos.z + z;

            try {
              totalBlocks++;
              const block = this.bot.blockAt(new Vec3(worldX, worldY, worldZ));
              if (block) {
                // 缓存所有方块（包括空气），这对环境感知至关重要
                const blockName = block.name || 'unknown';

                // 统计空气方块
                if (blockName === 'air' || blockName === 'cave_air') {
                  airCount++;
                }

                blocks.push({
                  x: worldX,
                  y: worldY,
                  z: worldZ,
                  block: {
                    name: blockName,
                    type: block.type,
                    metadata: block.metadata,
                    hardness: (block as any).hardness,
                    lightLevel: (block as any).lightLevel,
                    transparent: (block as any).transparent,
                    state: this.getBlockState(block),
                  },
                });
              } else {
                skipCount++;
              }
            } catch (error) {
              skipCount++;
              // 忽略单个方块的错误
            }
          }
        }
      }

      // 批量更新缓存
      if (blocks.length > 0) {
        // 统计方块类型
        const blockTypes = new Map<string, number>();
        for (const b of blocks) {
          const count = blockTypes.get(b.block.name) || 0;
          blockTypes.set(b.block.name, count + 1);
        }
        const topTypes = Array.from(blockTypes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => `${name}:${count}`)
          .join(', ');

        this.blockCache.setBlocks(blocks);

        // 🔧 修复：扫描方块的同时，立即同步更新容器缓存
        // 这样可以确保BlockCache和ContainerCache同步，bot不会"看不到"面前的箱子
        this.syncContainersFromBlocks(blocks, centerPos);
      } else {
        this.logger.error(`⚠️ 扫描完成但未缓存任何方块! 位置:(${centerPos.x},${centerPos.y},${centerPos.z}) 总检查:${totalBlocks}`);
      }
    } catch (error) {
      this.logger.error('方块扫描失败', undefined, error as Error);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * 获取方块状态
   */
  private getBlockState(block: any): Record<string, any> {
    const state: Record<string, any> = {};

    try {
      // 获取方块的状态信息
      if (block.metadata !== undefined) {
        state.metadata = block.metadata;
      }

      // 获取朝向信息
      if (block.name.includes('door') || block.name.includes('chest') || block.name.includes('furnace')) {
        state.facing = this.getBlockFacing(block);
      }

      // 获取开关状态
      if (block.name.includes('door') || block.name.includes('gate') || block.name.includes('lever')) {
        state.open = this.isBlockOpen(block);
      }
    } catch (error) {
      // 忽略状态获取错误
    }

    return state;
  }

  /**
   * 获取方块朝向
   */
  private getBlockFacing(block: any): string {
    // 简化的朝向判断，可以根据 metadata 确定
    const metadata = block.metadata || 0;
    const directions = ['north', 'east', 'south', 'west'];
    return directions[metadata % 4] || 'north';
  }

  /**
   * 判断方块是否开启
   */
  private isBlockOpen(block: any): boolean {
    // 简化的开启状态判断
    const metadata = block.metadata || 0;
    return (metadata & 0x4) !== 0; // 通常第3位表示开启状态
  }

  /**
   * 从方块列表中同步容器到ContainerCache
   * 🔧 修复：确保BlockCache和ContainerCache实时同步
   */
  private syncContainersFromBlocks(blocks: Array<{ x: number; y: number; z: number; block: any }>, centerPos: Vec3): void {
    if (!this.containerCache) return;

    const containerTypes = ['chest', 'furnace', 'brewing_stand', 'dispenser', 'hopper', 'shulker_box'];
    let syncedCount = 0;

    for (const { x, y, z, block } of blocks) {
      const blockName = block.name;

      // 检查是否是容器类型
      if (containerTypes.some(type => blockName.includes(type))) {
        const containerType = this.getContainerType({ name: blockName });

        if (containerType) {
          // 计算距离
          const distance = Math.sqrt(Math.pow(x - centerPos.x, 2) + Math.pow(y - centerPos.y, 2) + Math.pow(z - centerPos.z, 2));

          // 同步到ContainerCache
          this.containerCache.setContainer(x, y, z, containerType, {
            type: containerType as any,
            position: new Vec3(x, y, z),
            items: [], // 空物品列表，需要实际打开才能获取
            lastAccessed: Date.now(),
            size: this.getContainerSize(containerType),
          });

          syncedCount++;

          this.logger.debug(`✅ 同步容器到缓存: ${containerType} at (${x},${y},${z}), 距离${distance.toFixed(1)}格`);
        }
      }
    }

    if (syncedCount > 0) {
      this.logger.info(`📦 方块扫描同步: 发现并缓存了 ${syncedCount} 个容器`);
    }
  }

  /**
   * 更新附近容器信息
   */
  private async updateNearbyContainers(): Promise<void> {
    if (!this.containerCache || !this.bot.entity) {
      return;
    }

    try {
      const centerPos = this.bot.entity.position;
      const radius = 32; // 增加容器搜索半径到32格
      const containerPositions = this.findContainerBlocks(centerPos, radius);

      this.logger.debug(
        `🔍 开始容器更新: 中心位置(${Math.floor(centerPos.x)}, ${Math.floor(centerPos.y)}, ${Math.floor(centerPos.z)}), 搜索半径${radius}, 找到${containerPositions.length}个候选位置`,
      );

      let updatedCount = 0;
      for (const pos of containerPositions) {
        try {
          // 尝试打开容器获取信息
          const containerBlock = this.bot.blockAt(pos);
          if (!containerBlock) {
            this.logger.debug(`❌ 位置(${pos.x},${pos.y},${pos.z})没有方块，跳过`);
            continue;
          }

          const containerType = this.getContainerType(containerBlock);
          if (!containerType) {
            this.logger.debug(`❌ 位置(${pos.x},${pos.y},${pos.z})的方块${containerBlock.name}不是容器，跳过`);
            continue;
          }

          // 计算距离
          const distance = Math.sqrt(Math.pow(pos.x - centerPos.x, 2) + Math.pow(pos.y - centerPos.y, 2) + Math.pow(pos.z - centerPos.z, 2));

          // 记录容器位置，但不实际打开（避免干扰游戏）
          this.containerCache.setContainer(pos.x, pos.y, pos.z, containerType, {
            type: containerType as any,
            position: pos,
            items: [], // 空物品列表，需要实际打开才能获取
            lastAccessed: Date.now(),
            size: this.getContainerSize(containerType),
          });

          updatedCount++;
          this.logger.debug(`✅ 更新容器: ${containerType} at (${pos.x},${pos.y},${pos.z}), 距离${distance.toFixed(1)}格`);
        } catch (error) {
          this.logger.warn(`⚠️ 更新容器位置(${pos.x},${pos.y},${pos.z})失败: ${error}`);
        }
      }

      this.logger.info(`📦 容器更新完成: 更新了 ${updatedCount}/${containerPositions.length} 个容器的位置信息`);
    } catch (error) {
      this.logger.error('容器更新失败', undefined, error as Error);
    }
  }

  /**
   * 查找容器方块
   */
  private findContainerBlocks(centerPos: Vec3, radius: number): Vec3[] {
    const containers: Vec3[] = [];
    const containerTypes = ['chest', 'furnace', 'brewing_stand', 'dispenser', 'hopper', 'shulker_box'];

    this.logger.debug(`🔍 开始查找容器: 中心位置(${Math.floor(centerPos.x)}, ${Math.floor(centerPos.y)}, ${Math.floor(centerPos.z)}), 半径${radius}`);

    // 方法1: 使用 bot.findBlocks 查找容器方块
    let findBlocksCount = 0;
    for (const type of containerTypes) {
      try {
        const blockId = this.bot.registry.blocksByName[type]?.id;
        if (!blockId) {
          this.logger.warn(`⚠️ 找不到方块ID: ${type}`);
          continue;
        }

        const blocks = this.bot.findBlocks({
          point: centerPos, // 明确指定搜索中心位置
          matching: blockId,
          maxDistance: radius,
          count: 50, // 增加查找数量到50个
        });

        for (const blockPos of blocks) {
          containers.push(blockPos);
          findBlocksCount++;
        }

        if (blocks.length > 0) {
          this.logger.debug(`📦 findBlocks找到 ${blocks.length} 个 ${type}`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ findBlocks查找 ${type} 失败: ${error}`);
      }
    }

    // 方法2: 如果findBlocks没有找到足够多的容器，使用BlockCache作为备用
    if (containers.length < 5 && this.blockCache) {
      this.logger.debug(`🔄 findBlocks只找到${containers.length}个容器，尝试使用BlockCache备用查找`);

      const centerX = Math.floor(centerPos.x);
      const centerY = Math.floor(centerPos.y);
      const centerZ = Math.floor(centerPos.z);

      // 从BlockCache中查找容器
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          for (let z = -radius; z <= radius; z++) {
            const worldX = centerX + x;
            const worldY = centerY + y;
            const worldZ = centerZ + z;

            const blockInfo = this.blockCache.getBlock(worldX, worldY, worldZ);
            if (blockInfo && containerTypes.includes(blockInfo.name)) {
              // 检查是否已经添加过
              const alreadyExists = containers.some(pos => pos.x === worldX && pos.y === worldY && pos.z === worldZ);

              if (!alreadyExists) {
                containers.push(new Vec3(worldX, worldY, worldZ));
                this.logger.debug(`📦 BlockCache找到额外容器: ${blockInfo.name} at (${worldX},${worldY},${worldZ})`);
              }
            }
          }
        }
      }
    }

    this.logger.debug(`📦 容器查找完成: findBlocks找到${findBlocksCount}个, 总共${containers.length}个容器`);
    return containers;
  }

  /**
   * 获取容器类型
   */
  private getContainerType(block: any): string | null {
    const name = block.name.toLowerCase();
    if (name.includes('chest')) return 'chest';
    if (name.includes('furnace')) return 'furnace';
    if (name.includes('brewing')) return 'brewing_stand';
    if (name.includes('dispenser')) return 'dispenser';
    if (name.includes('hopper')) return 'hopper';
    if (name.includes('shulker')) return 'shulker_box';
    return null;
  }

  /**
   * 获取容器大小
   */
  private getContainerSize(type: string): number {
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
   * 手动触发方块扫描
   */
  async triggerBlockScan(radius?: number): Promise<void> {
    if (radius) {
      const originalRadius = this.config.blockScanRadius;
      this.config.blockScanRadius = radius;
      await this.scanNearbyBlocks();
      this.config.blockScanRadius = originalRadius;
    } else {
      await this.scanNearbyBlocks();
    }
  }

  /**
   * 手动触发容器更新
   */
  async triggerContainerUpdate(): Promise<void> {
    await this.updateNearbyContainers();
  }

  /**
   * 保存所有缓存
   */
  async saveCaches(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.blockCache) {
      promises.push(this.blockCache.save());
    }
    if (this.containerCache) {
      promises.push(this.containerCache.save());
    }

    try {
      await Promise.all(promises);
      this.logger.debug('缓存自动保存完成');
    } catch (error) {
      this.logger.error('缓存自动保存失败', undefined, error as Error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): any {
    const stats: any = {
      isScanning: this.isScanning,
      lastScanPosition: this.lastScanPosition,
      config: this.config,
    };

    if (this.blockCache) {
      stats.blockCache = this.blockCache.getStats();
    }
    if (this.containerCache) {
      stats.containerCache = this.containerCache.getStats();
    }

    return stats;
  }

  /**
   * 销毁缓存管理器
   */
  destroy(): void {
    this.stop();
    this.saveCaches().catch(error => {
      this.logger.error('最终保存失败', undefined, error);
    });
    this.logger.info('缓存管理器已销毁');
  }
}
