/**
 * 方块缓存
 * 
 * 用于缓存和记忆已探索的方块信息
 * - 减少重复查询
 * - 提供方块搜索能力
 * - 记录方块变化历史
 */

import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';

/**
 * 缓存的方块信息
 */
export interface CachedBlock {
  position: Vec3;
  blockType: string;
  canSee: boolean;
  timestamp: number;
  metadata?: any;
}

/**
 * 方块缓存类
 */
export class BlockCache {
  private cache: Map<string, CachedBlock> = new Map();
  private maxCacheSize: number = 10000;
  
  constructor(maxCacheSize: number = 10000) {
    this.maxCacheSize = maxCacheSize;
  }
  
  /**
   * 添加方块到缓存
   */
  addBlock(blockType: string, canSee: boolean, position: Vec3, metadata?: any): CachedBlock {
    const key = this.getKey(position);
    const cached: CachedBlock = {
      position: position.clone(),
      blockType,
      canSee,
      timestamp: Date.now(),
      metadata,
    };
    
    this.cache.set(key, cached);
    
    // 清理超出大小的缓存
    if (this.cache.size > this.maxCacheSize) {
      this.evictOldest();
    }
    
    return cached;
  }
  
  /**
   * 获取方块
   */
  getBlock(x: number, y: number, z: number): CachedBlock | undefined {
    const key = this.getKey(new Vec3(x, y, z));
    return this.cache.get(key);
  }
  
  /**
   * 获取方块（使用 Vec3）
   */
  getBlockAt(position: Vec3): CachedBlock | undefined {
    const key = this.getKey(position);
    return this.cache.get(key);
  }
  
  /**
   * 移除方块
   */
  removeBlock(position: Vec3): void {
    const key = this.getKey(position);
    this.cache.delete(key);
  }
  
  /**
   * 查找附近的方块
   */
  findNearby(center: Vec3, blockType: string, radius: number = 16): CachedBlock[] {
    const results: CachedBlock[] = [];
    
    for (const cached of this.cache.values()) {
      if (cached.blockType === blockType) {
        const distance = cached.position.distanceTo(center);
        if (distance <= radius) {
          results.push(cached);
        }
      }
    }
    
    // 按距离排序
    results.sort((a, b) => 
      a.position.distanceTo(center) - b.position.distanceTo(center)
    );
    
    return results;
  }
  
  /**
   * 查找可见的方块
   */
  findVisible(blockType: string, maxCount: number = 10): CachedBlock[] {
    const results: CachedBlock[] = [];
    
    for (const cached of this.cache.values()) {
      if (cached.blockType === blockType && cached.canSee) {
        results.push(cached);
        if (results.length >= maxCount) {
          break;
        }
      }
    }
    
    return results;
  }
  
  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * 生成位置键
   */
  private getKey(position: Vec3): string {
    return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
  }
  
  /**
   * 清理最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, cached] of this.cache.entries()) {
      if (cached.timestamp < oldestTime) {
        oldestTime = cached.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

