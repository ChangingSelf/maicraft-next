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
      blockScanInterval: 10 * 1000, // 10秒
      blockScanRadius: 8, // 8格半径
      containerUpdateInterval: 30 * 1000, // 30秒
      autoSaveInterval: 5 * 60 * 1000, // 5分钟
      enableAutoScan: true,
      enableAutoSave: true,
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

    this.logger.debug(`方块扫描已启动，间隔: ${this.config.blockScanInterval}ms，半径: ${this.config.blockScanRadius}`);
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
      this.saveCaches().catch(error => {
        this.logger.error('自动保存失败', undefined, error);
      });
    }, this.config.autoSaveInterval);

    this.logger.debug(`自动保存已启动，间隔: ${this.config.autoSaveInterval}ms`);
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
   * 扫描周围方块
   */
  private async scanNearbyBlocks(): Promise<void> {
    if (!this.blockCache || !this.bot.entity || this.isScanning) {
      return;
    }

    // 检查位置是否变化（移动超过5格才重新扫描，减少频繁扫描）
    const currentPosition = this.bot.entity.position;
    const distance = currentPosition.distanceTo(this.lastScanPosition);

    if (distance < 5) {
      return; // 位置变化不大，跳过扫描
    }

    this.isScanning = true;
    this.lastScanPosition = currentPosition.clone();

    this.logger.debug(`开始扫描方块，位置: ${currentPosition.toString()}, 半径: ${this.config.blockScanRadius}`);

    try {
      const blocks: Array<{ x: number; y: number; z: number; block: any }> = [];
      const radius = this.config.blockScanRadius;
      const centerPos = currentPosition.floored();
      let totalBlocks = 0;
      let importantBlocks = 0;

      // 性能控制：限制扫描时间和方块数量 (为AI决策优化)
      const maxScanTime = 200; // 最大扫描时间200ms，允许更详细的扫描
      const maxImportantBlocks = 100; // 最多缓存100个重要方块，提供更丰富的环境信息
      const scanStartTime = Date.now();

      // 扫描周围的方块（优化性能）
      const scanStartY = Math.max(0, centerPos.y - 4); // 不扫描过深的地底
      const scanEndY = Math.min(centerPos.y + 8, 255); // 不扫描过高的天空

      scanLoop: for (let x = -radius; x <= radius; x++) {
        for (let y = scanEndY; y >= scanStartY; y--) {
          // 限制扫描高度范围
          for (let z = -radius; z <= radius; z++) {
            // 性能控制：检查扫描时间
            if (Date.now() - scanStartTime > maxScanTime) {
              this.logger.debug(`扫描超时，已扫描 ${totalBlocks} 个方块`);
              break scanLoop;
            }

            // 性能控制：限制重要方块数量
            if (importantBlocks >= maxImportantBlocks) {
              this.logger.debug(`已达到最大重要方块数量 ${maxImportantBlocks}，停止扫描`);
              break scanLoop;
            }

            const worldX = centerPos.x + x;
            const worldY = centerPos.y + y;
            const worldZ = centerPos.z + z;

            try {
              totalBlocks++;
              const block = this.bot.blockAt(new Vec3(worldX, worldY, worldZ));
              if (block && block.type !== 0) {
                // 不是空气方块
                // 只缓存重要的方块
                if (this.isImportantBlock(block)) {
                  importantBlocks++;
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
                      state: this.getBlockState(block),
                    },
                  });
                }
              }
            } catch (error) {
              // 忽略单个方块的错误
            }
          }
        }
      }

      // 批量更新缓存
      if (blocks.length > 0) {
        this.blockCache.setBlocks(blocks);
        this.logger.info(`扫描完成: 总方块 ${totalBlocks}, 重要方块 ${importantBlocks}, 已缓存 ${blocks.length} 个`);
      } else {
        this.logger.debug(`扫描完成: 总方块 ${totalBlocks}, 没有发现重要方块`);
      }
    } catch (error) {
      this.logger.error('方块扫描失败', undefined, error as Error);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * 判断是否为重要方块
   */
  private isImportantBlock(block: any): boolean {
    // 扩展重要方块列表，包含更多常见方块
    const importantPatterns = [
      'chest',
      'furnace',
      'crafting_table',
      'workbench',
      'bed',
      'door',
      'torch',
      'lantern',
      'ore',
      'log',
      'wood',
      'sapling',
      'diamond',
      'emerald',
      'gold',
      'iron',
      'coal',
      'stone',
      'crop',
      'farm',
      'flower',
      'tree',
      'leaves',
      'grass',
      'dirt',
      'sand',
      'gravel',
      'water',
      'lava',
      'cobblestone',
      'planks',
      'glass',
      'brick',
      'wool',
      'bookshelf',
      'ender_chest',
      'hopper',
      'dispenser',
      'dropper',
      'brewing_stand',
      'anvil',
      'enchanting_table',
      'beacon',
      'jukebox',
      'note_block',
    ];

    const blockName = block.name.toLowerCase();
    const isImportant = importantPatterns.some(pattern => blockName.includes(pattern));

    // 调试日志：记录所有扫描到的方块
    if (!isImportant) {
      this.logger.debug(`跳过非重要方块: ${block.name} (${block.type})`);
    } else {
      this.logger.debug(`缓存重要方块: ${block.name} (${block.type})`);
    }

    return isImportant;
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
   * 更新附近容器信息
   */
  private async updateNearbyContainers(): Promise<void> {
    if (!this.containerCache || !this.bot.entity) {
      return;
    }

    try {
      const centerPos = this.bot.entity.position;
      const radius = 16; // 容器搜索半径
      const containerPositions = this.findContainerBlocks(centerPos, radius);

      for (const pos of containerPositions) {
        try {
          // 尝试打开容器获取信息
          const containerBlock = this.bot.blockAt(pos);
          if (!containerBlock) continue;

          const containerType = this.getContainerType(containerBlock);
          if (!containerType) continue;

          // 记录容器位置，但不实际打开（避免干扰游戏）
          // 这里可以后续实现更智能的容器更新策略
          this.containerCache.setContainer(pos.x, pos.y, pos.z, containerType, {
            type: containerType as any,
            position: pos,
            items: [], // 空物品列表，需要实际打开才能获取
            lastAccessed: Date.now(),
            size: this.getContainerSize(containerType),
          });
        } catch (error) {
          // 忽略单个容器的错误
        }
      }

      this.logger.debug(`更新了 ${containerPositions.length} 个容器的位置信息`);
    } catch (error) {
      this.logger.error('容器更新失败', undefined, error as Error);
    }
  }

  /**
   * 查找容器方块
   */
  private findContainerBlocks(centerPos: Vec3, radius: number): Vec3[] {
    const containers: Vec3[] = [];
    const containerTypes = ['chest', 'furnace', 'brewing_stand', 'dispenser', 'hopper'];

    // 使用 bot.findBlocks 查找容器方块
    for (const type of containerTypes) {
      try {
        const blocks = this.bot.findBlocks({
          matching: this.bot.registry.blocksByName[type]?.id || 0,
          maxDistance: radius,
          count: 10, // 最多找10个
        });

        for (const blockPos of blocks) {
          containers.push(blockPos);
        }
      } catch (error) {
        // 忽略查找错误
      }
    }

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
