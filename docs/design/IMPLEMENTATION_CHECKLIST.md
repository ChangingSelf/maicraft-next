# 动作系统 v2.0 实施检查清单

## 📋 总览

本清单用于指导 maicraft-next 动作系统 v2.0 的实施。

**相关文档:**
- [action-system-review.md](./action-system-review.md) - 详细评估
- [action-system-v2.md](./action-system-v2.md) - 完整设计
- [COMPARISON.md](./COMPARISON.md) - 对比总结
- [architecture-comparison.md](./architecture-comparison.md) - 架构对比

---

## 🎯 P0 核心架构 (Week 1-2)

### 1. 事件系统 (EventBus)

#### 文件结构
```
src/events/
├─ EventBus.ts           ✅ 核心事件总线
├─ GameEvent.ts          ✅ 事件基类
├─ types.ts              ✅ 事件类型定义
└─ impl/                 ✅ 具体事件实现
   ├─ HealthChangeEvent.ts
   ├─ DeathEvent.ts
   ├─ EntityHurtEvent.ts
   ├─ ActionStartEvent.ts
   ├─ ActionCompleteEvent.ts
   └─ ActionErrorEvent.ts
```

#### 实施步骤
- [ ] 1.1 创建 `src/events/EventBus.ts`
  - [ ] 实现 `on()`, `once()`, `off()`, `emit()` 方法
  - [ ] 实现监听器管理
  - [ ] 添加错误处理
  - [ ] 添加日志记录

- [ ] 1.2 创建 `src/events/GameEvent.ts`
  - [ ] 定义事件基类
  - [ ] 添加时间戳
  - [ ] 添加事件类型

- [ ] 1.3 实现核心事件类型
  - [ ] HealthChangeEvent
  - [ ] DeathEvent
  - [ ] EntityHurtEvent
  - [ ] ActionStartEvent
  - [ ] ActionCompleteEvent
  - [ ] ActionErrorEvent

- [ ] 1.4 编写测试
  - [ ] 单元测试: 事件订阅/发射
  - [ ] 单元测试: once 只触发一次
  - [ ] 单元测试: 错误处理
  - [ ] 单元测试: 多监听器并发

- [ ] 1.5 编写文档
  - [ ] API 文档
  - [ ] 使用示例
  - [ ] 最佳实践

**预计时间:** 3 天

---

### 2. 状态管理 (StateManager)

#### 文件结构
```
src/state/
├─ StateManager.ts       ✅ 状态管理器
├─ BlockCache.ts         ✅ 方块缓存
├─ ContainerCache.ts     ✅ 容器缓存
├─ LocationManager.ts    ✅ 位置管理
├─ TaskList.ts           ✅ 任务列表
├─ ThinkingLog.ts        ✅ 思考日志
└─ types.ts              ✅ 类型定义
```

#### 实施步骤
- [ ] 2.1 创建 `src/state/StateManager.ts`
  - [ ] 集成各个子管理器
  - [ ] 实现 `load()`, `save()` 方法
  - [ ] 添加自动保存机制
  - [ ] 添加错误处理

- [ ] 2.2 创建 `src/state/BlockCache.ts`
  - [ ] `remember()` - 记住方块
  - [ ] `recall()` - 回忆方块
  - [ ] `forget()` - 忘记方块
  - [ ] `findNearest()` - 查找最近方块
  - [ ] 持久化到文件

- [ ] 2.3 创建 `src/state/ContainerCache.ts`
  - [ ] `saveContainer()` - 保存容器
  - [ ] `getContainer()` - 获取容器
  - [ ] `findContainerWithItem()` - 查找包含物品的容器
  - [ ] 持久化到文件

- [ ] 2.4 创建 `src/state/LocationManager.ts`
  - [ ] `saveLocation()` - 保存位置
  - [ ] `getLocation()` - 获取位置
  - [ ] `listLocations()` - 列出所有位置
  - [ ] `deleteLocation()` - 删除位置
  - [ ] 持久化到文件

- [ ] 2.5 创建 `src/state/TaskList.ts`
  - [ ] `addTask()` - 添加任务
  - [ ] `completeTask()` - 完成任务
  - [ ] `failTask()` - 失败任务
  - [ ] `updateProgress()` - 更新进度
  - [ ] `getPendingTasks()` - 获取待办任务
  - [ ] 持久化到文件

- [ ] 2.6 创建 `src/state/ThinkingLog.ts` (P1)
  - [ ] `add()` - 添加思考记录
  - [ ] `getRecent()` - 获取最近记录
  - [ ] 持久化到文件

- [ ] 2.7 编写测试
  - [ ] 单元测试: 各管理器基础功能
  - [ ] 集成测试: StateManager 协调
  - [ ] 测试持久化和恢复

- [ ] 2.8 编写文档
  - [ ] API 文档
  - [ ] 数据格式说明
  - [ ] 使用示例

**预计时间:** 4 天

---

### 3. 增强 ActionExecutor

#### 修改文件
```
src/minecraft/ActionExecutor.ts  (增强现有文件)
```

#### 实施步骤
- [ ] 3.1 集成 EventBus
  - [ ] 构造函数接收 EventBus
  - [ ] 执行前发射 ActionStartEvent
  - [ ] 执行后发射 ActionCompleteEvent/ActionErrorEvent
  - [ ] 动作注册时订阅相关事件

- [ ] 3.2 集成 StateManager
  - [ ] 构造函数接收 StateManager
  - [ ] 创建 ActionContext 时传入 StateManager

- [ ] 3.3 增强 ActionContext
  - [ ] 添加 `stateManager` 字段
  - [ ] 添加 `eventBus` 字段
  - [ ] 添加可选的 `ai` 字段
  - [ ] 实现 `createContext()` 方法

- [ ] 3.4 实现工具定义导出
  - [ ] `getToolDefinitions()` - OpenAI 格式
  - [ ] `getMcpTools()` - 已有，保留

- [ ] 3.5 编写测试
  - [ ] 测试事件发射
  - [ ] 测试状态管理集成
  - [ ] 测试上下文创建

**预计时间:** 3 天

---

### 4. 错误处理器 (ErrorHandler)

#### 文件结构
```
src/errors/
├─ ErrorHandler.ts       ✅ 错误处理器
├─ ErrorTypes.ts         ✅ 错误类型定义
└─ CustomErrors.ts       ✅ 自定义错误类
```

#### 实施步骤
- [ ] 4.1 创建 `src/errors/ErrorTypes.ts`
  - [ ] 定义 ActionErrorType 枚举
  - [ ] 定义 RetryConfig 接口
  - [ ] 定义 ValidationErrorDetail 接口

- [ ] 4.2 创建 `src/errors/CustomErrors.ts`
  - [ ] TimeoutError
  - [ ] ValidationError
  - [ ] PreconditionError
  - [ ] InterruptError

- [ ] 4.3 创建 `src/errors/ErrorHandler.ts`
  - [ ] `executeWithRetry()` - 带重试执行
  - [ ] `classifyError()` - 错误分类
  - [ ] `isRetryable()` - 判断可重试
  - [ ] `calculateDelay()` - 计算延迟 (指数退避)

- [ ] 4.4 集成到 ActionExecutor
  - [ ] 在 ActionExecutor 中使用 ErrorHandler
  - [ ] 替换现有的简单 try-catch

- [ ] 4.5 编写测试
  - [ ] 测试错误分类
  - [ ] 测试重试逻辑
  - [ ] 测试指数退避
  - [ ] 测试不可重试错误

- [ ] 4.6 编写文档
  - [ ] 错误类型说明
  - [ ] 重试策略说明
  - [ ] 配置选项

**预计时间:** 3 天

---

## 🎯 P1 功能增强 (Week 3-4)

### 5. 复合动作基类 (CompositeAction)

#### 文件结构
```
src/actions/
├─ Action.ts             (现有，ActionInterface.ts 中的 BaseAction)
├─ CompositeAction.ts    ✅ 新增复合动作基类
└─ ActionStep.ts         ✅ 动作步骤接口
```

#### 实施步骤
- [ ] 5.1 创建 `src/actions/ActionStep.ts`
  - [ ] 定义 ActionStep 接口
  - [ ] 定义 ActionStepResult 接口

- [ ] 5.2 创建 `src/actions/CompositeAction.ts`
  - [ ] 继承 BaseAction
  - [ ] `createSubActions()` - 抽象方法
  - [ ] `execute()` - 顺序执行子动作
  - [ ] `handleStepFailure()` - 处理步骤失败
  - [ ] `rollback()` - 回滚机制
  - [ ] `saveProgress()` - 保存进度
  - [ ] `shouldRollback()` - 可覆盖

- [ ] 5.3 实现示例复合动作
  - [ ] BuildHouseAction - 建造房屋
  - [ ] CraftItemAction - 合成物品 (需要多个步骤)
  - [ ] CollectResourcesAction - 收集资源

- [ ] 5.4 编写测试
  - [ ] 测试顺序执行
  - [ ] 测试失败回滚
  - [ ] 测试部分成功
  - [ ] 测试进度保存

- [ ] 5.5 编写文档
  - [ ] 复合动作开发指南
  - [ ] 回滚策略说明
  - [ ] 示例代码

**预计时间:** 4 天

---

### 6. 执行历史 (ActionHistory)

#### 文件结构
```
src/history/
├─ ActionHistory.ts      ✅ 执行历史管理
└─ types.ts              ✅ 类型定义
```

#### 实施步骤
- [ ] 6.1 创建 `src/history/types.ts`
  - [ ] ActionExecutionRecord 接口
  - [ ] 执行状态枚举

- [ ] 6.2 创建 `src/history/ActionHistory.ts`
  - [ ] `recordStart()` - 记录开始
  - [ ] `recordEnd()` - 记录结束
  - [ ] `getHistory()` - 获取历史
  - [ ] `getByActionId()` - 按动作ID查询
  - [ ] `persist()` - 持久化
  - [ ] `load()` - 加载历史

- [ ] 6.3 集成到 ActionExecutor
  - [ ] 在执行前后记录
  - [ ] 提供查询接口

- [ ] 6.4 编写测试
  - [ ] 测试记录功能
  - [ ] 测试持久化
  - [ ] 测试查询

**预计时间:** 3 天

---

### 7. 性能指标 (MetricsCollector)

#### 文件结构
```
src/metrics/
├─ MetricsCollector.ts   ✅ 指标收集器
└─ types.ts              ✅ 类型定义
```

#### 实施步骤
- [ ] 7.1 创建 `src/metrics/types.ts`
  - [ ] ActionMetrics 接口

- [ ] 7.2 创建 `src/metrics/MetricsCollector.ts`
  - [ ] `recordExecution()` - 记录执行
  - [ ] `getMetrics()` - 获取指标
  - [ ] `getTopSlowest()` - 最慢动作
  - [ ] `getTopFailing()` - 失败率最高
  - [ ] `reset()` - 重置指标

- [ ] 7.3 集成到 ActionExecutor
  - [ ] 记录执行时间
  - [ ] 记录成功/失败

- [ ] 7.4 编写测试
  - [ ] 测试指标收集
  - [ ] 测试统计计算

**预计时间:** 2 天

---

### 8. 迁移现有动作

#### 实施步骤
- [ ] 8.1 迁移 MineBlockAction
  - [ ] 添加 subscribeEvents
  - [ ] 使用 StateManager (blockCache)
  - [ ] 添加中断支持

- [ ] 8.2 迁移 MoveAction
  - [ ] 添加 subscribeEvents
  - [ ] 使用 StateManager (locationManager)

- [ ] 8.3 迁移 PlaceBlockAction
  - [ ] 添加 subscribeEvents
  - [ ] 使用 StateManager

- [ ] 8.4 迁移其他动作
  - [ ] 逐个迁移现有动作
  - [ ] 确保向后兼容

- [ ] 8.5 更新测试
  - [ ] 更新现有测试
  - [ ] 添加新功能测试

**预计时间:** 5 天

---

## 🎯 P2 AI 集成 (Week 5-8)

### 9. AI 适配器 (AIActionAdapter)

#### 文件结构
```
src/ai/
├─ AIActionAdapter.ts    ✅ AI 适配器
├─ AIContext.ts          ✅ AI 上下文
└─ types.ts              ✅ 类型定义
```

#### 实施步骤
- [ ] 9.1 创建 `src/ai/types.ts`
  - [ ] AIContext 接口
  - [ ] ToolCall 接口
  - [ ] ToolCallResult 接口

- [ ] 9.2 创建 `src/ai/AIActionAdapter.ts`
  - [ ] `executeToolCalls()` - OpenAI 工具调用
  - [ ] `executeFromPrompt()` - 提示词模式
  - [ ] `executeFromMCP()` - MCP 模式
  - [ ] `getToolDefinitions()` - 获取工具定义
  - [ ] `parseActionFromPrompt()` - 解析提示词

- [ ] 9.3 编写测试
  - [ ] 测试工具调用执行
  - [ ] 测试提示词解析
  - [ ] 测试 MCP 执行

- [ ] 9.4 编写文档
  - [ ] API 文档
  - [ ] 三种模式对比
  - [ ] 使用示例

**预计时间:** 4 天

---

### 10. 思考日志 (ThinkingLog)

- [ ] 10.1 完善 `src/state/ThinkingLog.ts`
  - [ ] 记录 AI 决策过程
  - [ ] 记录动作执行结果
  - [ ] 提供查询接口

- [ ] 10.2 集成到 AI 适配器
  - [ ] 自动记录工具调用
  - [ ] 记录思考过程

**预计时间:** 2 天

---

### 11. 双模式支持

#### 实施步骤
- [ ] 11.1 创建 Agent 模式入口
  - [ ] `src/main-agent.ts`
  - [ ] 集成 LLMManager
  - [ ] 集成 AIActionAdapter
  - [ ] 实现 AI 决策循环

- [ ] 11.2 创建 MCP Server 模式入口
  - [ ] `src/main-mcp.ts`
  - [ ] 复用现有 MCP Server 代码
  - [ ] 集成新的 ActionExecutor

- [ ] 11.3 创建统一启动脚本
  - [ ] 根据环境变量选择模式
  - [ ] 配置管理

- [ ] 11.4 编写测试
  - [ ] 测试 Agent 模式
  - [ ] 测试 MCP 模式
  - [ ] 测试模式切换

**预计时间:** 5 天

---

### 12. 文档和示例

#### 文档清单
- [ ] 12.1 API 文档
  - [ ] EventBus API
  - [ ] StateManager API
  - [ ] ActionExecutor API
  - [ ] AIActionAdapter API

- [ ] 12.2 开发指南
  - [ ] 如何创建新动作
  - [ ] 如何创建复合动作
  - [ ] 如何订阅事件
  - [ ] 如何使用状态管理

- [ ] 12.3 部署指南
  - [ ] Agent 模式部署
  - [ ] MCP Server 模式部署
  - [ ] 配置说明

- [ ] 12.4 示例代码
  - [ ] 完整的 Agent 示例
  - [ ] 完整的 MCP Server 示例
  - [ ] 自定义动作示例

**预计时间:** 3 天

---

## 📊 进度追踪

### 总体进度

- [ ] P0 核心架构 (13天)
  - [ ] EventBus (3天)
  - [ ] StateManager (4天)
  - [ ] 增强 ActionExecutor (3天)
  - [ ] ErrorHandler (3天)

- [ ] P1 功能增强 (14天)
  - [ ] CompositeAction (4天)
  - [ ] ActionHistory (3天)
  - [ ] MetricsCollector (2天)
  - [ ] 迁移现有动作 (5天)

- [ ] P2 AI 集成 (14天)
  - [ ] AIActionAdapter (4天)
  - [ ] ThinkingLog (2天)
  - [ ] 双模式支持 (5天)
  - [ ] 文档和示例 (3天)

**总预计时间:** 41 工作日 (约 6-8 周)

---

## ✅ 完成标准

### P0 完成标准
- ✅ 所有核心组件实现并通过单元测试
- ✅ 集成测试通过
- ✅ 现有动作可正常运行
- ✅ 基础文档完成

### P1 完成标准
- ✅ 复合动作可以创建和执行
- ✅ 执行历史可以查询
- ✅ 性能指标可以查看
- ✅ 所有现有动作迁移完成

### P2 完成标准
- ✅ Agent 模式可以运行
- ✅ MCP Server 模式可以运行
- ✅ 模式可以无缝切换
- ✅ 完整文档和示例

---

## 🚦 风险和缓解

### 潜在风险

1. **时间超期**
   - 缓解: 严格遵循优先级，P0 → P1 → P2
   - 缓解: 每周回顾进度

2. **现有功能破坏**
   - 缓解: 充分测试
   - 缓解: 保持向后兼容

3. **性能问题**
   - 缓解: 早期性能测试
   - 缓解: 使用 MetricsCollector 监控

4. **文档不足**
   - 缓解: 边开发边写文档
   - 缓解: 代码审查包含文档检查

---

## 📞 支持和反馈

### 问题报告
- GitHub Issues

### 进度汇报
- 每周进度更新
- 阻塞问题及时沟通

### 代码审查
- 每个 P 阶段完成后进行审查
- 重大变更需要审查

---

**准备好开始了吗?** 从 P0 的 EventBus 开始! 🚀

