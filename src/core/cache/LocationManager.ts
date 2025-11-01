/**
 * 地标管理器
 * 
 * 用于记录和管理重要位置的地标
 * - 记录地标位置
 * - 提供地标搜索
 * - 生成地标描述
 */

import { Vec3 } from 'vec3';

/**
 * 地标信息
 */
export interface Location {
  name: string;
  position: Vec3;
  info: string;
  createdAt: number;
  updatedAt: number;
  metadata?: any;
}

/**
 * 地标管理器类
 */
export class LocationManager {
  private locations: Map<string, Location> = new Map();
  
  /**
   * 设置地标
   */
  setLocation(name: string, position: Vec3, info: string, metadata?: any): Location {
    const existing = this.locations.get(name);
    const now = Date.now();
    
    const location: Location = {
      name,
      position: position.clone(),
      info,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      metadata,
    };
    
    this.locations.set(name, location);
    return location;
  }
  
  /**
   * 获取地标
   */
  getLocation(name: string): Location | undefined {
    return this.locations.get(name);
  }
  
  /**
   * 删除地标
   */
  deleteLocation(name: string): boolean {
    return this.locations.delete(name);
  }
  
  /**
   * 更新地标信息
   */
  updateLocation(name: string, info: string): boolean {
    const location = this.locations.get(name);
    if (!location) {
      return false;
    }
    
    location.info = info;
    location.updatedAt = Date.now();
    return true;
  }
  
  /**
   * 获取所有地标
   */
  getAllLocations(): Location[] {
    return Array.from(this.locations.values());
  }
  
  /**
   * 查找附近的地标
   */
  findNearby(center: Vec3, radius: number = 100): Location[] {
    const results: Location[] = [];
    
    for (const location of this.locations.values()) {
      const distance = location.position.distanceTo(center);
      if (distance <= radius) {
        results.push(location);
      }
    }
    
    // 按距离排序
    results.sort((a, b) => 
      a.position.distanceTo(center) - b.position.distanceTo(center)
    );
    
    return results;
  }
  
  /**
   * 搜索地标（按名称或信息）
   */
  search(query: string): Location[] {
    const results: Location[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const location of this.locations.values()) {
      if (
        location.name.toLowerCase().includes(lowerQuery) ||
        location.info.toLowerCase().includes(lowerQuery)
      ) {
        results.push(location);
      }
    }
    
    return results;
  }
  
  /**
   * 获取最近的地标
   */
  getNearest(center: Vec3): Location | undefined {
    const nearby = this.findNearby(center, Infinity);
    return nearby.length > 0 ? nearby[0] : undefined;
  }
  
  /**
   * 获取所有地标的字符串描述
   */
  getAllLocationsString(): string {
    const locations = this.getAllLocations();
    
    if (locations.length === 0) {
      return '暂无地标';
    }
    
    const lines: string[] = ['已保存的地标:'];
    
    for (const location of locations) {
      lines.push(`  ${location.name}: ${location.info} (${location.position.x}, ${location.position.y}, ${location.position.z})`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取附近地标的字符串描述
   */
  getNearbyLocationsString(center: Vec3, radius: number = 100): string {
    const nearby = this.findNearby(center, radius);
    
    if (nearby.length === 0) {
      return `附近${radius}格内没有地标`;
    }
    
    const lines: string[] = [`附近${radius}格内的地标:`];
    
    for (const location of nearby) {
      const distance = location.position.distanceTo(center).toFixed(1);
      lines.push(`  ${location.name}: ${location.info} (距离: ${distance}格)`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 检查地标是否存在
   */
  hasLocation(name: string): boolean {
    return this.locations.has(name);
  }
  
  /**
   * 清空所有地标
   */
  clear(): void {
    this.locations.clear();
  }
  
  /**
   * 获取地标数量
   */
  size(): number {
    return this.locations.size;
  }
  
  /**
   * 导出地标数据
   */
  export(): any[] {
    return this.getAllLocations().map(loc => ({
      name: loc.name,
      position: {
        x: loc.position.x,
        y: loc.position.y,
        z: loc.position.z,
      },
      info: loc.info,
      createdAt: loc.createdAt,
      updatedAt: loc.updatedAt,
      metadata: loc.metadata,
    }));
  }
  
  /**
   * 导入地标数据
   */
  import(data: any[]): void {
    for (const item of data) {
      const position = new Vec3(item.position.x, item.position.y, item.position.z);
      const location: Location = {
        name: item.name,
        position,
        info: item.info,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now(),
        metadata: item.metadata,
      };
      this.locations.set(item.name, location);
    }
  }
}

