/**
 * 位置管理器
 * 管理命名位置和路径点
 * 临时占位实现，实际功能需要完善
 */

import { promises as fs } from 'fs';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';

export interface NamedLocation {
  name: string;
  x: number;
  y: number;
  z: number;
  dimension: string;
  description?: string;
}

export class LocationManager {
  private locations: Map<string, NamedLocation> = new Map();
  private logger: Logger;
  private persistPath: string;

  constructor(persistPath?: string) {
    this.logger = getLogger('LocationManager');
    this.persistPath = persistPath || 'data/locations.json';
  }

  /**
   * 设置位置（添加或更新）
   */
  setLocation(name: string, x: number, y: number, z: number, dimension: string = 'overworld', info?: string): NamedLocation {
    const location: NamedLocation = {
      name,
      x,
      y,
      z,
      dimension,
      description: info,
    };
    this.locations.set(name, location);
    this.logger.debug(`设置位置: ${name} (${x}, ${y}, ${z})`);
    return location;
  }

  /**
   * 添加位置
   */
  addLocation(location: NamedLocation): void {
    this.locations.set(location.name, location);
  }

  /**
   * 获取位置
   */
  getLocation(name: string): NamedLocation | undefined {
    return this.locations.get(name);
  }

  /**
   * 获取所有位置
   */
  getAllLocations(): NamedLocation[] {
    return Array.from(this.locations.values());
  }

  /**
   * 更新位置
   */
  updateLocation(name: string, updates: Partial<Omit<NamedLocation, 'name'>>): boolean {
    const existing = this.locations.get(name);
    if (!existing) {
      return false;
    }

    this.locations.set(name, { ...existing, ...updates });
    this.logger.debug(`更新位置: ${name}`);
    return true;
  }

  /**
   * 删除位置
   */
  deleteLocation(name: string): boolean {
    const deleted = this.locations.delete(name);
    if (deleted) {
      this.logger.debug(`删除位置: ${name}`);
    }
    return deleted;
  }

  /**
   * 保存位置
   */
  async save(): Promise<void> {
    try {
      const data = Array.from(this.locations.values());
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.info(`LocationManager 保存完成，已保存 ${data.length} 个位置`);
    } catch (error) {
      this.logger.error('保存 LocationManager 失败', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 加载位置
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      const data: NamedLocation[] = JSON.parse(content);
      this.locations.clear();
      for (const location of data) {
        this.locations.set(location.name, location);
      }
      this.logger.info(`LocationManager 加载完成，已加载 ${data.length} 个位置`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('LocationManager 文件不存在，跳过加载');
      } else {
        this.logger.error('加载 LocationManager 失败', undefined, error as Error);
        throw error;
      }
    }
  }
}
