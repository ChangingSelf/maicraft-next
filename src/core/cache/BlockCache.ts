/**
 * 方块缓存
 * 临时占位实现，实际功能需要完善
 */

import { promises as fs } from 'fs';
import { getLogger } from '@/utils/Logger';
import type { Logger } from '@/utils/Logger';

export class BlockCache {
  private cache: Map<string, any> = new Map();
  private logger: Logger;
  private persistPath: string;

  constructor(persistPath?: string) {
    this.logger = getLogger('BlockCache');
    this.persistPath = persistPath || 'data/block_cache.json';
  }

  /**
   * 获取方块
   */
  getBlock(x: number, y: number, z: number): any | null {
    const key = `${x},${y},${z}`;
    return this.cache.get(key) || null;
  }

  /**
   * 设置方块
   */
  setBlock(x: number, y: number, z: number, block: any): void {
    const key = `${x},${y},${z}`;
    this.cache.set(key, block);
  }

  /**
   * 保存缓存
   */
  async save(): Promise<void> {
    try {
      const data = Array.from(this.cache.entries());
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.info(`BlockCache 保存完成，已保存 ${data.length} 个方块缓存`);
    } catch (error) {
      this.logger.error('保存 BlockCache 失败', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 加载缓存
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      const data: [string, any][] = JSON.parse(content);
      this.cache = new Map(data);
      this.logger.info(`BlockCache 加载完成，已加载 ${data.length} 个方块缓存`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('BlockCache 文件不存在，跳过加载');
      } else {
        this.logger.error('加载 BlockCache 失败', undefined, error as Error);
        throw error;
      }
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }
}
