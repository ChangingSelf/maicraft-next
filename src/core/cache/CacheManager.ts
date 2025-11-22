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
  /** 启用定期扫描（推荐关闭，区块事件已足够） */
  enablePeriodicScan: boolean;
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
  private isPaused: boolean = false; // 🔧 新增：暂停扫描标志
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
      blockScanInterval: 5 * 1000, // 5秒（仅在启用定期扫描时使用）
      blockScanRadius: 50, // 50格半径
      containerUpdateInterval: 10 * 1000, // 10秒
      autoSaveInterval: 1 * 60 * 1000, // 1分钟
      enablePeriodicScan: false, // 🔧 默认关闭定期扫描，使用区块事件
      enableAutoSave: true,
      performanceMode: 'balanced' as const,
      ...config,
    };

    this.logger.info('缓存管理器初始化完成', {
      config: this.config,
      scanMode: this.config.enablePeriodicScan ? '定期扫描+区块事件' : '仅区块事件（推荐）',
    });

    // 🔧 监听区块加载/卸载事件，实时扫描和清理
    this.setupChunkListeners();
  }

  /**
   * 设置区块监听器
   */
  private setupChunkListeners(): void {
    // 监听区块加载事件
    this.bot.on('chunkColumnLoad', (point: Vec3) => {
      this.onChunkLoad(point);
    });

    // 监听区块卸载事件
    this.bot.on('chunkColumnUnload', (point: Vec3) => {
      this.onChunkUnload(point);
    });

    this.logger.info('✅ 区块监听器已设置（加载/卸载）');
  }

  /**
   * 暂停方块扫描（用于 GUI 模式等需要避免事件循环占用的场景）
   */
  pauseScanning(): void {
    this.isPaused = true;
    this.logger.debug('⏸️ 方块扫描已暂停');
  }

  /**
   * 恢复方块扫描
   */
  resumeScanning(): void {
    this.isPaused = false;
    this.logger.debug('▶️ 方块扫描已恢复');
  }

  /**
   * 处理区块加载事件
   */
  private async onChunkLoad(chunkCorner: Vec3): Promise<void> {
    if (!this.blockCache || this.isPaused) return; // 🔧 检查暂停标志

    try {
      // 区块坐标（每个区块16×16）
      const chunkX = chunkCorner.x >> 4; //右移4位，相当于除以16
      const chunkZ = chunkCorner.z >> 4; //右移4位，相当于除以16

      this.logger.debug(`📦 区块加载: chunk(${chunkX}, ${chunkZ}) 开始扫描...`);

      const blocks: Array<{ x: number; y: number; z: number; block: any }> = [];
      let scannedCount = 0;
      let skipCount = 0;

      // 遍历区块内的所有方块（16×16×世界高度）
      // 使用世界坐标，不是相对坐标
      const startX = chunkX * 16;
      const startZ = chunkZ * 16;

      // 限制Y轴扫描范围（只扫描bot附近的高度层，避免扫描整个世界高度）
      const botY = this.bot.entity?.position?.y || 64;
      const minY = Math.max(-64, Math.floor(botY) - 16); // bot下方16格
      const maxY = Math.min(320, Math.floor(botY) + 16); // bot上方16格

      for (let x = startX; x < startX + 16; x++) {
        for (let z = startZ; z < startZ + 16; z++) {
          for (let y = minY; y <= maxY; y++) {
            try {
              scannedCount++;
              const block = this.bot.blockAt(new Vec3(x, y, z));

              if (block) {
                // 🆕 检查方块可视性
                let canSee: boolean | undefined = undefined;
                // 使用 mineflayer 的 canSeeBlock 方法检查可视性
                canSee = this.bot.canSeeBlock(block);

                blocks.push({
                  x,
                  y,
                  z,
                  block: {
                    name: block.name || 'unknown',
                    type: block.type,
                    metadata: block.metadata,
                    hardness: (block as any).hardness,
                    lightLevel: (block as any).lightLevel,
                    transparent: (block as any).transparent,
                    state: this.getBlockState(block),
                    canSee, // 🆕 添加可视性信息
                  },
                });
              } else {
                skipCount++;
              }
            } catch (error) {
              skipCount++;
            }
          }
        }
      }

      // 批量更新缓存
      if (blocks.length > 0) {
        this.blockCache.setBlocks(blocks);

        // 统计方块类型
        const blockTypes = new Map<string, number>();
        for (const b of blocks) {
          const count = blockTypes.get(b.block.name) || 0;
          blockTypes.set(b.block.name, count + 1);
        }
        const topTypes = Array.from(blockTypes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, count]) => `${name}:${count}`)
          .join(', ');

        this.logger.debug(`✅ 区块加载扫描: chunk(${chunkX},${chunkZ}) 缓存${blocks.length}个方块 [${topTypes}]`);

        // 同步容器
        this.syncContainersFromBlocks(blocks, chunkCorner);
      } else {
        this.logger.warn(`⚠️ 区块扫描无结果: chunk(${chunkX},${chunkZ}) 扫描${scannedCount}个位置`);
      }
    } catch (error) {
      this.logger.error('区块扫描失败', undefined, error as Error);
    }
  }

  /**
   * 处理区块卸载事件
   */
  private onChunkUnload(chunkCorner: Vec3): void {
    if (!this.blockCache) return;

    try {
      // 区块坐标
      const chunkX = chunkCorner.x >> 4;
      const chunkZ = chunkCorner.z >> 4;

      this.logger.debug(`📤 区块卸载: chunk(${chunkX}, ${chunkZ}) 开始清理缓存...`);

      // 计算该区块的世界坐标范围
      const startX = chunkX * 16;
      const startZ = chunkZ * 16;
      const endX = startX + 15;
      const endZ = startZ + 15;

      // 清理该区块范围内的所有缓存
      let removedCount = 0;
      let removedContainers = 0;

      // 遍历整个Y轴范围（-64到320）
      for (let x = startX; x <= endX; x++) {
        for (let z = startZ; z <= endZ; z++) {
          for (let y = -64; y <= 320; y++) {
            // 删除方块缓存
            if (this.blockCache.removeBlock(x, y, z)) {
              removedCount++;
            }

            // 同时清理容器缓存
            if (this.containerCache) {
              const containerInfo = this.containerCache.getContainer(x, y, z);
              if (containerInfo) {
                this.containerCache.removeContainer(x, y, z, containerInfo.type);
                removedContainers++;
              }
            }
          }
        }
      }

      if (removedCount > 0 || removedContainers > 0) {
        this.logger.debug(`🗑️ 区块卸载清理: chunk(${chunkX},${chunkZ}) 移除${removedCount}个方块, ${removedContainers}个容器`);
      }
    } catch (error) {
      this.logger.error('区块卸载清理失败', undefined, error as Error);
    }
  }

  /**
   * 启动缓存管理器
   */
  start(): void {
    // 定期扫描（可选，默认关闭）
    if (this.config.enablePeriodicScan) {
      this.startBlockScanning();
      this.startContainerUpdating();
      this.logger.info('📊 定期扫描已启用（可在配置中关闭以节省性能）');
    } else {
      this.logger.info('✅ 定期扫描已禁用，完全依赖区块事件（推荐模式）');
    }

    // 自动保存
    if (this.config.enableAutoSave) {
      this.startAutoSave();
    }

    // 🔧 初始扫描：bot启动时周围区块可能已加载，主动扫描一次
    setTimeout(() => {
      this.performInitialScan();
    }, 2000); // 等待2秒，确保bot完全初始化

    this.logger.info('缓存管理器已启动');
  }

  /**
   * 执行初始扫描
   * 扫描bot周围已加载的区块，避免错过已加载区块
   */
  private async performInitialScan(): Promise<void> {
    if (!this.bot.entity || !this.blockCache) return;

    try {
      const botPos = this.bot.entity.position.floored();
      const chunkRadiusX = 3; // 扫描bot周围±3个区块（约48格）
      const chunkRadiusZ = 3;
      const centerChunkX = botPos.x >> 4;
      const centerChunkZ = botPos.z >> 4;

      this.logger.info(`🔍 开始初始扫描: bot位置(${botPos.x},${botPos.y},${botPos.z}) 区块(${centerChunkX},${centerChunkZ})`);

      let scannedChunks = 0;
      let totalBlocks = 0;

      for (let chunkX = centerChunkX - chunkRadiusX; chunkX <= centerChunkX + chunkRadiusX; chunkX++) {
        for (let chunkZ = centerChunkZ - chunkRadiusZ; chunkZ <= centerChunkZ + chunkRadiusZ; chunkZ++) {
          // 测试区块是否加载
          const testX = chunkX * 16;
          const testZ = chunkZ * 16;
          const testBlock = this.bot.blockAt(new Vec3(testX, botPos.y, testZ));

          if (testBlock) {
            // 区块已加载，扫描它
            const chunkCorner = new Vec3(chunkX * 16, 0, chunkZ * 16);
            await this.onChunkLoad(chunkCorner);
            scannedChunks++;
            totalBlocks += 8448; // 估计值
          }
        }
      }

      this.logger.info(`✅ 初始扫描完成: 扫描${scannedChunks}个区块, 约${totalBlocks}个方块`);
    } catch (error) {
      this.logger.error('初始扫描失败', undefined, error as Error);
    }
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
   * 🔧 作为区块卸载的补充，定期清理远距离缓存防止无限增长
   */
  private cleanupExpiredCache(): void {
    if (!this.blockCache || !this.bot.entity) return;

    const currentPos = this.bot.entity.position.floored();
    const cacheSize = this.blockCache.size();

    // 只有当缓存过大时才清理（避免频繁清理）
    if (cacheSize > 500000) {
      // 超过50万个方块时，清理距离200格以外的
      const removed = this.blockCache.clearOutOfRange(currentPos.x, currentPos.y, currentPos.z, 200);
      if (removed > 0) {
        this.logger.warn(`⚠️ 缓存过大(${cacheSize})，清理200格外方块: 移除${removed}个`);
      }
    } else if (cacheSize > 200000) {
      // 超过20万个方块时，清理距离400格以外的
      const removed = this.blockCache.clearOutOfRange(currentPos.x, currentPos.y, currentPos.z, 400);
      if (removed > 0) {
        this.logger.info(`🧹 定期清理: 缓存${cacheSize}，移除400格外方块${removed}个`);
      }
    }
    // 否则不清理，让区块卸载事件自然清理
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
   * 扫描周围方块 - 基于区块的智能扫描
   * 🔧 优化：只扫描已加载的区块，避免大量null返回
   */
  private async scanNearbyBlocks(): Promise<void> {
    if (!this.blockCache || !this.bot.entity || this.isScanning || this.isPaused) {
      return; // 🔧 添加暂停检查
    }

    const currentPosition = this.bot.entity.position;
    this.isScanning = true;
    this.lastScanPosition = currentPosition.clone();

    try {
      const blocks: Array<{ x: number; y: number; z: number; block: any }> = [];
      const radius = this.config.blockScanRadius;
      const centerPos = currentPosition.floored();

      // 计算需要扫描的区块范围
      const chunkRadiusX = Math.ceil(radius / 16);
      const chunkRadiusZ = Math.ceil(radius / 16);
      const centerChunkX = centerPos.x >> 4;
      const centerChunkZ = centerPos.z >> 4;

      this.logger.debug(`🔍 开始区块扫描: 中心区块(${centerChunkX},${centerChunkZ}) 范围±${chunkRadiusX}区块 (约${radius}格)`);

      let scannedChunks = 0;
      let loadedChunks = 0;
      let scannedBlocks = 0;

      // 限制Y轴扫描范围（只扫描bot周围，不是整个世界高度）
      const minY = Math.max(-64, centerPos.y - 32); // bot下方32格
      const maxY = Math.min(320, centerPos.y + 32); // bot上方32格

      // 按区块扫描
      for (let chunkX = centerChunkX - chunkRadiusX; chunkX <= centerChunkX + chunkRadiusX; chunkX++) {
        for (let chunkZ = centerChunkZ - chunkRadiusZ; chunkZ <= centerChunkZ + chunkRadiusZ; chunkZ++) {
          scannedChunks++;

          // 检查区块是否加载（使用区块内的任意一个方块测试）
          const testX = chunkX * 16;
          const testZ = chunkZ * 16;
          const testBlock = this.bot.blockAt(new Vec3(testX, centerPos.y, testZ));

          if (!testBlock) {
            // 区块未加载，跳过
            continue;
          }

          loadedChunks++;

          // 扫描该区块内的方块
          for (let x = chunkX * 16; x < (chunkX + 1) * 16; x++) {
            for (let z = chunkZ * 16; z < (chunkZ + 1) * 16; z++) {
              // 检查是否在圆形范围内（优化：避免扫描角落）
              const distXZ = Math.sqrt(Math.pow(x - centerPos.x, 2) + Math.pow(z - centerPos.z, 2));
              if (distXZ > radius) continue;

              for (let y = minY; y <= maxY; y++) {
                try {
                  scannedBlocks++;
                  const block = this.bot.blockAt(new Vec3(x, y, z));

                  if (block) {
                    blocks.push({
                      x,
                      y,
                      z,
                      block: {
                        name: block.name || 'unknown',
                        type: block.type,
                        metadata: block.metadata,
                        hardness: (block as any).hardness,
                        lightLevel: (block as any).lightLevel,
                        transparent: (block as any).transparent,
                        state: this.getBlockState(block),
                      },
                    });
                  }
                } catch (error) {
                  // 忽略单个方块的错误
                }
              }
            }
          }
        }
      }

      // 批量更新缓存
      if (blocks.length > 0) {
        this.blockCache.setBlocks(blocks);

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

        this.logger.info(
          `✅ 定期扫描完成: ${loadedChunks}/${scannedChunks}区块已加载, 缓存${blocks.length}个方块 (检查${scannedBlocks}次) [${topTypes}]`,
        );

        // 同步容器
        this.syncContainersFromBlocks(blocks, centerPos);
      } else {
        this.logger.warn(
          `⚠️ 定期扫描无结果: 位置(${centerPos.x},${centerPos.y},${centerPos.z}) ${loadedChunks}/${scannedChunks}区块已加载, 检查${scannedBlocks}次`,
        );
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
