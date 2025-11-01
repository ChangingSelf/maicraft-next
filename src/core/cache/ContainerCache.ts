/**
 * 容器缓存
 * 
 * 用于缓存和记忆容器（箱子、熔炉等）的位置和内容
 * - 记录容器位置
 * - 缓存容器内容
 * - 提供容器搜索能力
 */

import { Vec3 } from 'vec3';

/**
 * 物品信息
 */
export interface ItemStack {
  name: string;
  count: number;
  slot: number;
}

/**
 * 容器类型
 */
export enum ContainerType {
  CHEST = 'chest',
  FURNACE = 'furnace',
  CRAFTING_TABLE = 'crafting_table',
  DISPENSER = 'dispenser',
  DROPPER = 'dropper',
  HOPPER = 'hopper',
  BARREL = 'barrel',
  SHULKER_BOX = 'shulker_box',
}

/**
 * 缓存的容器信息
 */
export interface CachedContainer {
  position: Vec3;
  type: ContainerType;
  items: ItemStack[];
  lastUpdated: number;
  metadata?: any;
}

/**
 * 容器缓存类
 */
export class ContainerCache {
  private cache: Map<string, CachedContainer> = new Map();
  
  /**
   * 添加或更新容器
   */
  addContainer(
    position: Vec3,
    type: ContainerType,
    items: ItemStack[],
    metadata?: any
  ): CachedContainer {
    const key = this.getKey(position);
    const cached: CachedContainer = {
      position: position.clone(),
      type,
      items: [...items],
      lastUpdated: Date.now(),
      metadata,
    };
    
    this.cache.set(key, cached);
    return cached;
  }
  
  /**
   * 获取容器
   */
  getContainer(position: Vec3): CachedContainer | undefined {
    const key = this.getKey(position);
    return this.cache.get(key);
  }
  
  /**
   * 移除容器
   */
  removeContainer(position: Vec3): void {
    const key = this.getKey(position);
    this.cache.delete(key);
  }
  
  /**
   * 查找附近的容器
   */
  findNearby(center: Vec3, radius: number = 16, type?: ContainerType): CachedContainer[] {
    const results: CachedContainer[] = [];
    
    for (const cached of this.cache.values()) {
      const distance = cached.position.distanceTo(center);
      if (distance <= radius) {
        if (!type || cached.type === type) {
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
   * 查找包含特定物品的容器
   */
  findWithItem(itemName: string, center?: Vec3): CachedContainer[] {
    const results: CachedContainer[] = [];
    
    for (const cached of this.cache.values()) {
      const hasItem = cached.items.some(item => item.name === itemName);
      if (hasItem) {
        results.push(cached);
      }
    }
    
    // 如果提供了中心点，按距离排序
    if (center) {
      results.sort((a, b) => 
        a.position.distanceTo(center) - b.position.distanceTo(center)
      );
    }
    
    return results;
  }
  
  /**
   * 获取附近容器的信息描述
   */
  getNearbyContainersInfo(center: Vec3, radius: number = 3): string {
    const nearby = this.findNearby(center, radius);
    
    if (nearby.length === 0) {
      return '';
    }
    
    const lines: string[] = ['附近的容器:'];
    
    for (const container of nearby) {
      const distance = container.position.distanceTo(center).toFixed(1);
      const itemCount = container.items.reduce((sum, item) => sum + item.count, 0);
      lines.push(`  ${container.type} 在 (${container.position.x}, ${container.position.y}, ${container.position.z}) - 距离: ${distance}格, 物品: ${itemCount}个`);
    }
    
    return lines.join('\n');
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
    return this.cache.size();
  }
  
  /**
   * 生成位置键
   */
  private getKey(position: Vec3): string {
    return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
  }
}

