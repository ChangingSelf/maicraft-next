# 方块缓存系统架构文档

## 概述

方块缓存系统是 maicraft-next 的核心基础设施之一，负责管理和优化 Minecraft 方块信息的存储、查询和更新。该系统采用分层架构设计，提供了高效的缓存策略、自动持久化、智能清理和实时更新功能。

## 架构概述

方块缓存系统采用三层架构设计：

### 1. 核心缓存层 (BlockCache & ContainerCache)

- **BlockCache**: 专门处理方块信息缓存
- **ContainerCache**: 专门处理容器信息缓存
- 提供基础的 CRUD 操作和缓存策略

### 2. 缓存管理层 (CacheManager)

- 协调多个缓存实例的生命周期
- 提供自动扫描、更新和清理策略
- 性能监控和调优

### 3. 应用接口层 (NearbyBlockManager)

- 智能的地形分析和方块查询
- 提供人类友好的信息展示
- 支持复杂的地形判断和路径规划

## 核心组件详解

### BlockCache (方块缓存)

#### 主要功能

- **缓存存储**: 使用 Map 结构存储方块信息，支持 O(1) 查找
- **过期管理**: 基于时间戳的过期机制，自动清理过时数据
- **批量操作**: 支持批量设置和查询，提升性能
- **持久化**: JSON 格式的磁盘持久化，支持版本兼容

#### 关键特性

```typescript
interface BlockInfo {
  name: string; // 方块名称
  type: number; // 方块类型ID
  position: Vec3; // 三维坐标
  metadata?: number; // 元数据
  state?: Record<string, any>; // 状态信息
  timestamp: number; // 缓存时间戳
  facing?: string; // 朝向
  hardness?: number; // 硬度
  lightLevel?: number; // 发光等级
  transparent?: boolean; // 是否透明
}
```

#### 配置参数

- `maxEntries`: 最大缓存条目数 (默认: 10000)
- `expirationTime`: 过期时间 (默认: 30分钟)
- `autoSaveInterval`: 自动保存间隔 (默认: 5分钟)
- `updateStrategy`: 更新策略 (immediate/batch/smart)

### ContainerCache (容器缓存)

#### 主要功能

- **容器信息管理**: 存储箱子、熔炉等容器的位置和内容
- **物品追踪**: 详细记录容器中的物品信息
- **状态同步**: 支持熔炉进度、燃料等状态信息

#### 关键特性

```typescript
interface ContainerInfo {
  type: 'chest' | 'furnace' | 'brewing_stand' | 'dispenser' | 'hopper' | 'shulker_box';
  position: Vec3;
  items: ContainerItem[];
  lastAccessed: number;
  size: number;
  locked?: boolean;
}

interface ContainerItem {
  itemId: number;
  name: string;
  count: number;
  durability?: number;
  enchantments?: Array<{ name: string; level: number }>;
}
```

### CacheManager (缓存管理器)

#### 主要功能

- **自动扫描**: 定时扫描周围方块，保持缓存新鲜度
- **性能监控**: 实时监控扫描性能和缓存命中率
- **智能清理**: 基于距离和时间的多级缓存清理策略
- **并发控制**: 防止重复扫描，确保线程安全

#### 扫描策略

- **实时模式**: 每次都扫描，不检查移动阈值
- **性能控制**: 限制扫描时间 (800ms) 和方块数量 (10000)
- **范围控制**: 8格半径扫描，支持 Y轴全范围
- **智能过滤**: 区分重要方块和普通方块

#### 清理策略

- **定期清理**: 每5分钟清理一次过期缓存
- **距离清理**: 清除200格以外的缓存数据
- **LRU驱逐**: 当缓存满时，驱逐最旧的10%条目

### NearbyBlockManager (附近方块管理器)

#### 主要功能

- **智能分析**: 分析地形、障碍物、资源分布
- **格式化展示**: 将原始缓存数据转换为人类可读信息
- **地形判断**: 提供移动和规划决策支持

#### 分析能力

- **环境感知**: 检测水体、岩浆、支撑面等
- **障碍物分析**: 基于连通性的簇分析
- **视线判断**: 分析玩家视线方向的障碍物
- **资源统计**: 矿物和树木资源的分布分析

## 系统时序图

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant CM as CacheManager
    participant BC as BlockCache
    participant CC as ContainerCache
    participant NBM as NearbyBlockManager
    participant Bot as Mineflayer Bot

    Note over Agent,Bot: 启动阶段
    Agent->>CM: start()
    CM->>CM: startBlockScanning()
    CM->>CM: startContainerUpdating()
    CM->>CM: startAutoSave()

    Note over Agent,Bot: 正常运行阶段
    loop 每10秒
        CM->>Bot: bot.blockAt() 扫描方块
        Bot-->>CM: 返回方块信息
        CM->>BC: setBlocks() 批量更新
        CM->>BC: clearOutOfRange() 清理远距离缓存
    end

    Note over Agent,Bot: 查询阶段
    Agent->>NBM: getVisibleBlocksInfo()
    NBM->>BC: getBlocksInRadius()
    BC-->>NBM: 返回方块列表
    NBM->>NBM: analyzeTerrain() 地形分析
    NBM->>NBM: formatGroupedBlocks() 格式化
    NBM-->>Agent: 返回分析结果

    Note over Agent,Bot: 持久化阶段
    loop 每5分钟
        CM->>BC: save()
        CM->>CC: save()
        BC->>BC: cleanupExpiredEntries()
    end

    Note over Agent,Bot: 容器更新阶段
    loop 每30秒
        CM->>Bot: bot.findBlocks() 查找容器
        Bot-->>CM: 返回容器位置
        CM->>CC: setContainer() 更新容器信息
    end
```

## 数据流和生命周期

### 缓存数据生命周期

1. **创建阶段**
   - 初始化缓存实例
   - 加载持久化数据
   - 启动后台任务

2. **运行阶段**
   - 实时扫描和更新
   - 查询和缓存命中
   - 自动清理过期数据

3. **持久化阶段**
   - 定时保存到磁盘
   - 支持版本兼容
   - 异常恢复机制

### 缓存更新策略

#### 智能更新策略 (Smart Strategy)

- **基于移动检测**: 当玩家移动时触发扫描
- **性能自适应**: 根据系统负载调整扫描频率
- **重要性过滤**: 优先缓存重要方块

#### 批量更新策略 (Batch Strategy)

- **延迟更新**: 累积多个更新后批量处理
- **合并操作**: 合并相邻的更新请求
- **异步处理**: 非阻塞的更新操作

## 性能优化

### 缓存命中率优化

- **空间局部性**: 优先缓存玩家附近的方块
- **时间局部性**: 保留最近访问的方块
- **预取策略**: 预测性加载可能需要的方块

### 内存管理

- **LRU驱逐**: 最近最少使用的条目优先驱逐
- **大小限制**: 硬性限制缓存大小，防止内存泄漏
- **压缩存储**: 使用高效的数据结构

### 查询优化

- **空间索引**: 基于距离的快速过滤
- **类型索引**: 按方块类型分组查询
- **批量查询**: 支持范围查询和模式匹配

## 配置和监控

### 配置参数

```typescript
interface CacheManagerConfig {
  blockScanInterval: number; // 方块扫描间隔
  blockScanRadius: number; // 扫描半径
  containerUpdateInterval: number; // 容器更新间隔
  autoSaveInterval: number; // 自动保存间隔
  enableAutoScan: boolean; // 启用自动扫描
  enableAutoSave: boolean; // 启用自动保存
  performanceMode: 'balanced' | 'performance' | 'memory';
}
```

### 监控指标

- **缓存统计**: 总条目数、命中率、过期条目
- **性能指标**: 查询延迟、扫描时间、保存时间
- **健康状态**: 扫描状态、持久化状态

## 扩展性和维护

### 插件架构

- **缓存插件**: 支持自定义缓存策略
- **过滤器插件**: 自定义方块过滤逻辑
- **序列化插件**: 支持不同的持久化格式

### 维护工具

- **缓存检查**: 验证缓存一致性
- **性能分析**: 识别性能瓶颈
- **数据迁移**: 支持缓存格式升级

## 故障处理

### 常见问题

1. **缓存文件损坏**: 自动重建和修复
2. **内存溢出**: 自动清理和限制大小
3. **扫描超时**: 降级策略和超时控制

### 恢复机制

- **数据备份**: 多版本备份策略
- **渐进式加载**: 分批加载大量数据
- **容错设计**: 单点失败不影响整体功能

## 总结

方块缓存系统通过精心设计的架构和优化策略，为 maicraft-next 提供了高效、可靠的方块信息管理能力。该系统不仅支持基本的缓存功能，还提供了智能的地形分析、自动管理和性能优化特性，是整个 AI 代理决策系统的重要基础设施。
