/**
 * 缓存系统相关的类型定义
 */

import type { Vec3 } from 'vec3';

/**
 * 方块信息接口
 */
export interface BlockInfo {
  /** 方块名称 */
  name: string;
  /** 方块类型 */
  type: number;
  /** 方块位置 */
  position: Vec3;
  /** 方块元数据/状态 */
  metadata?: number;
  /** 方块状态 (如开关门、箱子开关等) */
  state?: Record<string, any>;
  /** 缓存时间戳 */
  timestamp: number;
  /** 方块朝向 */
  facing?: string;
  /** 是否需要工具挖掘 */
  requiresTool?: boolean;
  /** 工具类型 */
  toolType?: string;
  /** 硬度 */
  hardness?: number;
  /** 发光等级 */
  lightLevel?: number;
  /** 是否透明 */
  transparent?: boolean;
  /** 特殊属性 (如箱子内容、熔炉状态等) */
  properties?: Record<string, any>;
}

/**
 * 容器信息接口
 */
export interface ContainerInfo {
  /** 容器类型 */
  type: 'chest' | 'furnace' | 'brewing_stand' | 'dispenser' | 'hopper' | 'shulker_box';
  /** 容器位置 */
  position: Vec3;
  /** 容器名称 (自定义名称) */
  name?: string;
  /** 容器内容物 */
  items: ContainerItem[];
  /** 最后访问时间 */
  lastAccessed: number;
  /** 容器状态 (如熔炉的燃料和进度) */
  state?: {
    /** 当前燃料剩余 */
    fuelRemaining?: number;
    /** 最大燃料容量 */
    fuelMax?: number;
    /** 烧炼进度 */
    progress?: number;
    /** 当前烧炼物 */
    currentItem?: ContainerItem;
    /** 结果物 */
    resultItem?: ContainerItem;
  };
  /** 容器大小 (格子数量) */
  size: number;
  /** 是否已锁定 */
  locked?: boolean;
}

/**
 * 容器物品接口
 */
export interface ContainerItem {
  /** 物品ID */
  itemId: number;
  /** 物品名称 */
  name: string;
  /** 数量 */
  count: number;
  /** 耐久度 */
  durability?: number;
  /** 附魔信息 */
  enchantments?: Array<{
    name: string;
    level: number;
  }>;
  /** 自定义名称 */
  customName?: string;
  /** 物品NBT数据 */
  nbt?: any;
}

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  /** 最大缓存数量 */
  maxEntries: number;
  /** 缓存过期时间 (毫秒) */
  expirationTime: number;
  /** 自动保存间隔 (毫秒) */
  autoSaveInterval: number;
  /** 是否启用缓存 */
  enabled: boolean;
  /** 缓存更新策略 */
  updateStrategy: 'immediate' | 'batch' | 'smart';
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 缓存条目总数 */
  totalEntries: number;
  /** 过期条目数量 */
  expiredEntries: number;
  /** 最后更新时间 */
  lastUpdate: number;
  /** 缓存命中率 */
  hitRate: number;
  /** 总查询次数 */
  totalQueries: number;
  /** 缓存命中次数 */
  totalHits: number;
}

/**
 * 方块缓存键生成函数类型
 */
export type BlockKeyGenerator = (x: number, y: number, z: number) => string;

/**
 * 容器缓存键生成函数类型
 */
export type ContainerKeyGenerator = (x: number, y: number, z: number, type: string) => string;
