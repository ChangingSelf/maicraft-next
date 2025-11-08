/**
 * 附近方块管理器
 * 提供智能的方块信息收集和格式化展示
 * 参考 maicraft 项目的 nearby_block.py 实现
 */

import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';
import type { BlockCache } from './BlockCache';
import type { BlockInfo } from './types';

/**
 * 方块位置
 */
export interface BlockPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * 附近方块管理器
 */
export class NearbyBlockManager {
  private logger: Logger;
  private blockCache: BlockCache;

  constructor(blockCache: BlockCache) {
    this.logger = getLogger('NearbyBlockManager');
    this.blockCache = blockCache;
  }

  /**
   * 获取可见方块的字符串表示
   * @param position 中心位置
   * @param distance 搜索距离
   * @returns 格式化的方块信息字符串
   */
  getVisibleBlocksInfo(position: BlockPosition, distance: number = 16): string {
    try {
      // 检查缓存状态
      const cacheSize = this.blockCache.size();
      this.logger.debug(`🔍 缓存状态: 共有 ${cacheSize} 个方块缓存`);

      // 获取距离范围内的所有方块
      const blocks = this.blockCache.getBlocksInRadius(position.x, position.y, position.z, distance);

      // 统计方块类型
      const blockTypes = new Map<string, number>();
      for (const b of blocks) {
        const count = blockTypes.get(b.name) || 0;
        blockTypes.set(b.name, count + 1);
      }
      const topTypes = Array.from(blockTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `${name}:${count}`)
        .join(', ');

      this.logger.warn(`🔍 [查询缓存] 位置:(${position.x},${position.y},${position.z}) 半径:${distance} 找到:${blocks.length}个 类型:[${topTypes}]`);

      if (blocks.length === 0) {
        // 尝试扩大搜索范围
        const blocksExtended = this.blockCache.getBlocksInRadius(position.x, position.y, position.z, 100);
        this.logger.error(`🔍 扩大搜索范围到100格: 找到 ${blocksExtended.length} 个方块`);

        // 获取缓存中任意一个方块的位置来诊断问题
        const allBlocks = Array.from(this.blockCache['cache'].values()).slice(0, 5);
        const samplePositions = allBlocks.map(b => `(${b.position.x},${b.position.y},${b.position.z})`).join(', ');
        this.logger.error(`🔍 缓存示例位置: ${samplePositions}`);

        return `玩家位置: x=${position.x}, y=${position.y}, z=${position.z}\n⚠️ 在半径${distance}格内未找到方块 (缓存总大小: ${cacheSize})\n⚠️ 扩大到100格: 找到 ${blocksExtended.length} 个方块\n\n❌ 问题：扫描位置和当前位置相差太远！\n📍 缓存示例位置: ${samplePositions}\n💡 解决：实时扫描模式(0.5秒/次)应该很快更新，请查看日志中的扫描位置是否正确。`;
      }

      // 按方块类型分组
      const groupedBlocks = this.groupBlocksByType(blocks, position);

      // 格式化输出
      const lines: string[] = [];

      // 环境信息（特别重要）
      const environmentInfo = this.getEnvironmentInfo(position, groupedBlocks);
      if (environmentInfo) {
        lines.push('【环境状况】');
        lines.push(environmentInfo);
        lines.push('');
      }

      // 方块列表
      lines.push('【周围方块分布】');
      const blockLines = this.formatGroupedBlocks(groupedBlocks);
      if (blockLines.length > 0) {
        lines.push(...blockLines);
      } else {
        lines.push('  周围都是空气方块');
      }

      // 位置信息
      lines.push('');
      lines.push('【当前位置】');
      lines.push(`玩家位置: (${position.x}, ${position.y}, ${position.z})`);
      lines.push(`头部位置: (${position.x}, ${position.y + 1}, ${position.z})`);

      // 统计信息
      const totalBlocks = blocks.length;
      const uniqueTypes = Object.keys(groupedBlocks).length;
      lines.push('');
      lines.push(`📊 统计: 共检测到 ${totalBlocks} 个方块，包含 ${uniqueTypes} 种不同类型`);

      return lines.join('\n');
    } catch (error) {
      this.logger.error('获取可见方块信息失败', undefined, error as Error);
      return `获取方块信息失败: ${error instanceof Error ? error.message : '未知错误'}`;
    }
  }

  /**
   * 获取环境信息（水、岩浆等）
   */
  private getEnvironmentInfo(position: BlockPosition, groupedBlocks: Record<string, BlockInfo[]>): string {
    const lines: string[] = [];

    // 检查脚下方块
    const blockAtFeet = this.blockCache.getBlock(position.x, position.y, position.z);
    if (blockAtFeet && blockAtFeet.name !== 'air' && blockAtFeet.name !== 'cave_air') {
      if (blockAtFeet.name === 'water') {
        lines.push(`⚠️ 警告：你正在水中！(x=${position.x}, y=${position.y}, z=${position.z})`);
        lines.push(`  - 在水中移动速度会变慢`);
        lines.push(`  - 需要注意氧气值，避免溺水`);
      } else if (blockAtFeet.name === 'lava') {
        lines.push(`🔥 危险：你正在岩浆中！立即离开！(x=${position.x}, y=${position.y}, z=${position.z})`);
      } else {
        lines.push(`你正站在方块内部：${blockAtFeet.name} (x=${position.x}, y=${position.y}, z=${position.z})`);
      }
    }

    // 检查脚下支撑方块
    const blockBelow = this.blockCache.getBlock(position.x, position.y - 1, position.z);
    if (blockBelow) {
      if (blockBelow.name === 'water') {
        lines.push(`脚下是水方块，你可能正在水面上或游泳`);
      } else if (blockBelow.name === 'lava') {
        lines.push(`⚠️ 脚下是岩浆，非常危险！`);
      } else if (blockBelow.name !== 'air' && blockBelow.name !== 'cave_air') {
        lines.push(`脚下方块：${blockBelow.name} (x=${blockBelow.position.x}, y=${blockBelow.position.y}, z=${blockBelow.position.z})`);
      } else {
        lines.push(`⚠️ 脚下没有固体方块，你可能在空中或正在下坠`);
      }
    } else {
      lines.push(`⚠️ 脚下没有方块信息，可能在悬空`);
    }

    // 检查周围是否有大量水
    const waterBlocks = groupedBlocks['water'] || [];
    if (waterBlocks.length > 10) {
      lines.push(`周围有大量水方块(${waterBlocks.length}个)，你可能在海洋、河流或湖泊中`);
    } else if (waterBlocks.length > 0) {
      lines.push(`附近有${waterBlocks.length}个水方块`);
    }

    // 检查周围岩浆
    const lavaBlocks = groupedBlocks['lava'] || [];
    if (lavaBlocks.length > 0) {
      lines.push(`⚠️ 附近有${lavaBlocks.length}个岩浆方块，注意安全！`);
    }

    return lines.join('\n');
  }

  /**
   * 按方块类型分组
   */
  private groupBlocksByType(blocks: BlockInfo[], centerPos: BlockPosition): Record<string, BlockInfo[]> {
    const grouped: Record<string, BlockInfo[]> = {};

    for (const block of blocks) {
      // 跳过普通空气（但保留cave_air，可能有用）
      if (block.name === 'air') {
        continue;
      }

      // 计算距离，用于排序
      const distance = Math.sqrt(
        Math.pow(block.position.x - centerPos.x, 2) + Math.pow(block.position.y - centerPos.y, 2) + Math.pow(block.position.z - centerPos.z, 2),
      );
      (block as any).distance = distance;

      if (!grouped[block.name]) {
        grouped[block.name] = [];
      }
      grouped[block.name].push(block);
    }

    return grouped;
  }

  /**
   * 格式化分组后的方块信息
   */
  private formatGroupedBlocks(groupedBlocks: Record<string, BlockInfo[]>): string[] {
    const lines: string[] = [];

    // 定义方块优先级（重要的方块优先显示）
    const priorityBlocks = [
      'water',
      'lava',
      'chest',
      'furnace',
      'crafting_table',
      'bed',
      'diamond_ore',
      'emerald_ore',
      'gold_ore',
      'iron_ore',
      'coal_ore',
      'redstone_ore',
      'oak_log',
      'birch_log',
      'spruce_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'oak_leaves',
      'oak_sapling',
      'door',
      'torch',
      'stone',
      'cobblestone',
      'dirt',
      'grass_block',
      'sand',
      'gravel',
      'clay',
      'kelp',
      'seagrass',
    ];

    // 先显示优先级方块
    const displayedTypes = new Set<string>();
    for (const blockType of priorityBlocks) {
      if (groupedBlocks[blockType]) {
        const blocks = groupedBlocks[blockType];
        const coordStr = this.formatCoordinates(blocks);
        const emoji = this.getBlockEmoji(blockType);
        lines.push(`  ${emoji} ${blockType} (${blocks.length}个): ${coordStr}`);
        displayedTypes.add(blockType);
      }
    }

    // 按数量排序显示其他方块
    const otherBlocks = Object.entries(groupedBlocks)
      .filter(([type]) => !displayedTypes.has(type))
      .sort((a, b) => b[1].length - a[1].length);

    // 限制显示数量，避免信息过载
    const maxOtherTypes = 30; // 增加到30种
    const displayOtherBlocks = otherBlocks.slice(0, maxOtherTypes);

    for (const [blockType, blocks] of displayOtherBlocks) {
      const coordStr = this.formatCoordinates(blocks);
      const emoji = this.getBlockEmoji(blockType);
      lines.push(`  ${emoji} ${blockType} (${blocks.length}个): ${coordStr}`);
    }

    if (otherBlocks.length > maxOtherTypes) {
      lines.push(`  ... 还有 ${otherBlocks.length - maxOtherTypes} 种方块未显示`);
    }

    return lines;
  }

  /**
   * 格式化坐标列表（智能压缩）
   */
  private formatCoordinates(blocks: BlockInfo[]): string {
    if (blocks.length === 0) return '无';

    // 如果方块很少，直接列出坐标
    if (blocks.length <= 3) {
      return blocks.map(b => `(${b.position.x},${b.position.y},${b.position.z})`).join(', ');
    }

    // 如果方块较多，显示范围
    const sortedBlocks = blocks.sort((a, b) => (a as any).distance - (b as any).distance);

    // 显示最近的3个
    const nearestBlocks = sortedBlocks.slice(0, 3);
    const nearestStr = nearestBlocks.map(b => `(${b.position.x},${b.position.y},${b.position.z})`).join(', ');

    // 计算范围
    const xValues = blocks.map(b => b.position.x);
    const yValues = blocks.map(b => b.position.y);
    const zValues = blocks.map(b => b.position.z);

    const xRange = `x=${Math.min(...xValues)}~${Math.max(...xValues)}`;
    const yRange = `y=${Math.min(...yValues)}~${Math.max(...yValues)}`;
    const zRange = `z=${Math.min(...zValues)}~${Math.max(...zValues)}`;

    if (blocks.length <= 6) {
      return nearestStr;
    }

    return `最近${nearestStr}, 范围[${xRange}, ${yRange}, ${zRange}]`;
  }

  /**
   * 获取可放置方块的位置
   */
  getPlaceablePositions(position: BlockPosition, distance: number = 5): string {
    try {
      const blocks = this.blockCache.getBlocksInRadius(position.x, position.y, position.z, distance);

      // 创建位置映射
      const blockMap = new Map<string, BlockInfo>();
      for (const block of blocks) {
        const key = `${block.position.x},${block.position.y},${block.position.z}`;
        blockMap.set(key, block);
      }

      const placeablePositions: BlockPosition[] = [];
      const waterPositions: BlockPosition[] = [];
      const lavaPositions: BlockPosition[] = [];

      // 6个相邻方向
      const directions = [
        [0, 1, 0], // 上
        [0, -1, 0], // 下
        [1, 0, 0], // 右
        [-1, 0, 0], // 左
        [0, 0, 1], // 前
        [0, 0, -1], // 后
      ];

      // 检查每个位置
      for (let x = position.x - distance; x <= position.x + distance; x++) {
        for (let y = position.y - distance; y <= position.y + distance; y++) {
          for (let z = position.z - distance; z <= position.z + distance; z++) {
            const currentKey = `${x},${y},${z}`;
            const currentBlock = blockMap.get(currentKey);

            if (!currentBlock) continue;

            // 只检查空气、水或岩浆位置
            if (!['air', 'cave_air', 'water', 'lava'].includes(currentBlock.name)) {
              continue;
            }

            // 计算相邻固体方块数量
            let solidCount = 0;
            for (const [dx, dy, dz] of directions) {
              const adjKey = `${x + dx},${y + dy},${z + dz}`;
              const adjBlock = blockMap.get(adjKey);
              if (adjBlock && !['air', 'cave_air', 'water', 'lava'].includes(adjBlock.name)) {
                solidCount++;
              }
            }

            // 需要至少1个相邻固体方块
            if (solidCount >= 1 && solidCount <= 5) {
              if (currentBlock.name === 'air' || currentBlock.name === 'cave_air') {
                placeablePositions.push({ x, y, z });
              } else if (currentBlock.name === 'water') {
                waterPositions.push({ x, y, z });
              } else if (currentBlock.name === 'lava') {
                lavaPositions.push({ x, y, z });
              }
            }
          }
        }
      }

      const lines: string[] = [];
      if (placeablePositions.length > 0) {
        const coordStr = this.formatSimpleCoordinates(placeablePositions);
        lines.push(`可直接放置: ${coordStr}`);
      }
      if (waterPositions.length > 0) {
        const coordStr = this.formatSimpleCoordinates(waterPositions);
        lines.push(`可放置(会替换水): ${coordStr}`);
      }
      if (lavaPositions.length > 0) {
        const coordStr = this.formatSimpleCoordinates(lavaPositions);
        lines.push(`可放置(会替换岩浆): ${coordStr}`);
      }

      return lines.length > 0 ? lines.join('\n') : '附近没有合适的放置位置';
    } catch (error) {
      this.logger.error('获取可放置位置失败', undefined, error as Error);
      return '获取可放置位置失败';
    }
  }

  /**
   * 格式化简单坐标列表
   */
  private formatSimpleCoordinates(positions: BlockPosition[]): string {
    if (positions.length === 0) return '无';
    if (positions.length <= 5) {
      return positions.map(p => `(${p.x},${p.y},${p.z})`).join(', ');
    }

    // 显示前5个
    const shown = positions.slice(0, 5);
    const shownStr = shown.map(p => `(${p.x},${p.y},${p.z})`).join(', ');
    return `${shownStr} 等${positions.length}个位置`;
  }

  /**
   * 获取方块的表情符号（增加可读性）
   */
  private getBlockEmoji(blockType: string): string {
    const emojiMap: Record<string, string> = {
      water: '💧',
      lava: '🔥',
      chest: '📦',
      furnace: '⚙️',
      crafting_table: '🔨',
      bed: '🛏️',
      diamond_ore: '💎',
      emerald_ore: '💚',
      gold_ore: '🟡',
      iron_ore: '⚪',
      coal_ore: '⚫',
      stone: '🪨',
      dirt: '🟤',
      grass_block: '🌱',
      sand: '🟨',
      gravel: '⚪',
      oak_log: '🪵',
      oak_leaves: '🍃',
      torch: '🔦',
      door: '🚪',
      kelp: '🌿',
      seagrass: '🌿',
    };

    return emojiMap[blockType] || '▪️';
  }
}
