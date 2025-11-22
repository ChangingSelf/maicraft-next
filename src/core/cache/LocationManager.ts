/**
 * 地标管理器
 *
 * 用于记录和管理重要位置的地标
 * - 记录地标位置
 * - 提供地标搜索
 * - 生成地标描述
 * - 支持持久化存储
 */

import { Vec3 } from 'vec3';
import { promises as fs } from 'fs';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';

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
  private logger: Logger;
  private persistPath: string;
  private saveTimer?: NodeJS.Timeout;
  private readonly SAVE_INTERVAL = 30000; // 30秒保存一次

  constructor(persistPath?: string) {
    this.logger = getLogger('LocationManager');
    this.persistPath = persistPath || 'data/locations.json';
    this.load();
  }

  /**
   * 设置地标
   */
  setLocation(name: string, position: Vec3 | { x: number; y: number; z: number }, info: string, metadata?: any): Location {
    const existing = this.locations.get(name);
    const now = Date.now();

    // 确保 position 是 Vec3 对象，如果不是则创建新的 Vec3 对象
    const pos = position instanceof Vec3 ? position.clone() : new Vec3(position.x, position.y, position.z);

    const location: Location = {
      name,
      position: pos,
      info,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      metadata,
    };

    this.locations.set(name, location);
    this.scheduleSave();
    this.logger.debug(`设置地标: ${name} (${position.x}, ${position.y}, ${position.z})`);
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
    const deleted = this.locations.delete(name);
    if (deleted) {
      this.scheduleSave();
      this.logger.debug(`删除地标: ${name}`);
    }
    return deleted;
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
    this.scheduleSave();
    this.logger.debug(`更新地标: ${name}`);
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
    results.sort((a, b) => a.position.distanceTo(center) - b.position.distanceTo(center));

    return results;
  }

  /**
   * 搜索地标（按名称或信息）
   */
  search(query: string): Location[] {
    const results: Location[] = [];
    const lowerQuery = query.toLowerCase();

    for (const location of this.locations.values()) {
      if (location.name.toLowerCase().includes(lowerQuery) || location.info.toLowerCase().includes(lowerQuery)) {
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

  /**
   * 保存地标数据（公开方法）
   */
  async save(): Promise<void> {
    await this.forceSave();
  }

  /**
   * 安排自动保存（防抖）
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveToFile();
    }, this.SAVE_INTERVAL);
  }

  /**
   * 保存地标数据到文件
   */
  private async saveToFile(): Promise<void> {
    try {
      // 确保目录存在
      const dir = this.persistPath.substring(0, this.persistPath.lastIndexOf('/'));
      if (dir) {
        await fs.mkdir(dir, { recursive: true });
      }

      const data = this.export();
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.info(`LocationManager 保存完成，已保存 ${data.length} 个地标`);
    } catch (error) {
      this.logger.error('保存 LocationManager 失败', undefined, error as Error);
    }
  }

  /**
   * 从文件加载地标数据
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      const data: any[] = JSON.parse(content);
      this.import(data);
      this.logger.info(`LocationManager 加载完成，已加载 ${data.length} 个地标`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('LocationManager 文件不存在，跳过加载');
      } else {
        this.logger.error('加载 LocationManager 失败', undefined, error as Error);
      }
    }
  }

  /**
   * 强制保存（用于程序退出时）
   */
  async forceSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    await this.saveToFile();
  }
}
