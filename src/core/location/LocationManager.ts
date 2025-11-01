/**
 * 位置管理器
 * 管理命名位置和路径点
 * 临时占位实现，实际功能需要完善
 */

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

  constructor() {
    this.logger = getLogger('LocationManager');
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
   * 删除位置
   */
  deleteLocation(name: string): boolean {
    return this.locations.delete(name);
  }

  /**
   * 保存位置
   */
  async save(): Promise<void> {
    // TODO: 实现持久化
    this.logger.info('LocationManager 保存完成');
  }

  /**
   * 加载位置
   */
  async load(): Promise<void> {
    // TODO: 实现加载
    this.logger.info('LocationManager 加载完成');
  }
}
