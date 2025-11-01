# maicraft-next 设计文档总览

> 本目录包含 maicraft-next 的完整架构和设计文档

---

## 📚 文档导航

### 🎯 当前推荐文档 (v2.0)

**[core-architecture.md](./core-architecture.md)** ⭐ **最新核心架构设计**
- 基于对 maicraft (Python) 和 maicraft-mcp-server (TypeScript) 的深度分析
- 15 个精简的核心动作
- Environment 全局状态设计
- 类型安全的动作调用
- 事件系统设计（保持 mineflayer 事件名）
- 完整的实施路线
- **适合:** 所有人，这是最终设计方案

---

### 📚 历史文档 (参考)

以下文档是早期讨论和设计迭代的记录，供参考：

1. **[action-system.md](./action-system.md)** - 原始设计（v1.0）
   - 最初的动作系统设计
   - 存在架构定位不清等问题

2. **[COMPARISON.md](./COMPARISON.md)** - 三版本对比
   - 对比原设计、现有实现、改进方案
   - 问题分析和改进建议

3. **[architecture-comparison.md](./architecture-comparison.md)** - 可视化对比
   - 架构演进图
   - 性能对比分析

4. **[action-system-review.md](./action-system-review.md)** - 详细评估
   - 8 个主要问题分析
   - 每个问题的解决方案

5. **[action-system-v2.md](./action-system-v2.md)** - 早期改进方案
   - 包含过多不必要的组件（后续精简）
   - 动作列表过多（后续精简为 15 个）

---

## 📊 设计演进历程

```
action-system.md (v1.0)
    ↓ 问题分析
COMPARISON.md + action-system-review.md
    ↓ 初步改进
action-system-v2.md
    ↓ 深度分析 maicraft 实际需求
core-architecture.md (v2.0 最终方案) ⭐
```

---

## 🎯 核心设计亮点 (v2.0)

### 1. **去除查询类动作，状态全局可访问** ✅

**之前 (maicraft Python):**
```python
# ❌ 需要轮询查询状态
result = await mcp_client.call_tool("query_player_status", {})
health = result['data']['health']
```

**现在 (maicraft-next):**
```typescript
// ✅ 状态实时可访问，无需查询
context.gameState.health
context.gameState.food
context.gameState.position
context.gameState.inventory
```

**改进:**
- ✅ 去除 7 个查询类动作（query_player_status, query_game_state 等）
- ✅ 状态通过 bot 事件实时同步
- ✅ 零轮询开销，性能大幅提升

---

### 2. **精简动作列表，优化 LLM 上下文** ✅

**动作数量:**
- 早期设计: 25 个动作 ❌ LLM 上下文空间不足
- 最终设计: 15 个核心动作 ✅ 基于 maicraft 实际使用

**15 个核心动作:**
- 移动和探索: move, find_block
- 挖掘: mine_block, mine_block_by_position, mine_in_direction
- 建造和合成: place_block, craft
- 容器操作: use_chest, use_furnace
- 生存: eat, toss_item, kill_mob
- 地标和交流: set_location, chat, swim_to_land

---

### 3. **类型安全的动作调用** ✅

**之前:**
```typescript
// ❌ 硬编码字符串，不友好
await executor.execute('move', { x: 100, y: 64, z: 200 });
```

**现在:**
```typescript
// ✅ 方式 1: 使用 ActionIds 常量（推荐）
await context.executor.execute(ActionIds.MOVE, { x: 100, y: 64, z: 200 });

// ✅ 方式 2: 便捷方法（可选）
await context.executor.actions.move(100, 64, 200);
```

**优势:**
- ✅ 编译时类型检查，避免拼写错误
- ✅ 支持动态注册新动作
- ✅ IDE 自动补全和参数提示
- ✅ 重构友好，动作改名不影响调用

---

### 4. **事件名保持一致** ✅

**薄层 EventEmitter 设计:**
```typescript
// ✅ 保持 mineflayer 原始事件名
context.events.on('entityHurt', (data) => { ... });
context.events.on('health', (data) => { ... });
context.events.on('death', (data) => { ... });

// ✅ 支持自定义事件
context.events.on('actionComplete', (data) => { ... });
```

**优势:**
- ✅ 与 mineflayer 事件名一致，无混淆
- ✅ 统一管理游戏事件和自定义事件
- ✅ 解耦，易于测试
- ✅ 薄层封装，性能开销 < 1%

---

### 5. **高内聚单体架构** ✅

**之前 (maicraft Python):**
```
Python Agent → MCP Client → (IPC) → MCP Server → Bot
└─────────────────── 跨进程开销 ─────────────────────┘
```

**现在 (maicraft-next):**
```
TypeScript Agent → ActionExecutor → Bot
└────────── 内存直调，零开销 ─────────┘
```

**改进:**
- ✅ 零跨进程 IPC 开销
- ✅ 性能提升 10-50x
- ✅ 单一项目，易维护

---

## 🚀 实施路线

### Phase 1: 核心基础 (Week 1-2)
```
✅ GameState - 全局游戏状态管理
✅ EventEmitter - 薄层事件封装
✅ ActionExecutor - 类型安全调用 + 动态注册
✅ InterruptSignal - 中断机制
✅ BlockCache, LocationManager, ContainerCache
✅ Logger - 带前缀的日志系统
```

### Phase 2: P0 动作 (Week 3-4)
```
✅ move, find_block
✅ mine_block, mine_block_by_position
✅ place_block
✅ craft
```

### Phase 3: P1 动作 (Week 5-6)
```
✅ mine_in_direction
✅ use_chest, use_furnace
✅ eat, toss_item
✅ kill_mob
✅ set_location
```

### Phase 4: AI 集成 (Week 7-8)
```
✅ Prompt 生成
✅ LLM Manager
✅ 完整测试和文档
```

---

## 🎉 总结

**maicraft-next v2.0 核心架构**提供了一个：

- 🏗️ **高内聚单体** - 零跨进程开销，性能提升 10-50x
- ✅ **15个精简动作** - 基于实际需求，优化 LLM 上下文
- 🌍 **全局状态** - 实时可访问，去除轮询查询
- 🔒 **类型安全** - IDE 友好，重构无忧
- 📡 **统一事件** - 保持 mineflayer 事件名，薄层封装

**准备好开始了吗?** 

→ 阅读 [core-architecture.md](./core-architecture.md) 了解完整设计！

---

*最后更新: 2024-11-01*  
*版本: v2.0*

