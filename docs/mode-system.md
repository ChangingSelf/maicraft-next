# 模式系统架构文档

## 📋 概述

本项目采用基于原 maicraft 项目的模式驱动架构，移除了复杂的策略系统，实现了简洁高效的状态机设计。每个模式既是状态管理器，又是业务逻辑执行器。

## 🎯 设计原则

### 1. 单一职责原则
- **模式**：负责状态管理和业务逻辑的统一执行
- **监听器**：负责实时响应游戏状态变化
- **循环**：负责协调模式切换和执行调度

### 2. 简洁性优于复杂性
- 移除了策略系统的中间层
- 直接模式驱动，减少抽象层次
- 保持原 maicraft 的设计精髓

### 3. 实时响应机制
- 基于 `GameStateListener` 的事件驱动
- 威胁检测和模式自动切换
- 无延迟的状态变化响应

## 🏗️ 核心组件

### BaseMode (基类)

```typescript
export abstract class BaseMode implements GameStateListener {
  // 模式属性
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly priority: number;
  readonly requiresLLMDecision: boolean = true;

  // 生命周期配置
  readonly maxDuration?: number;
  readonly autoRestore: boolean = false;
  readonly restoreDelay: number = 0;

  // 核心方法
  abstract execute(): Promise<void>;
  async activate(reason: string): Promise<void>;
  async deactivate(reason: string): Promise<void>;
  async checkTransitions(): Promise<string[]>;
}
```

**职责**：
- 模式生命周期管理
- 状态绑定和组件初始化
- 监听器接口实现

### ModeManager (模式管理器)

```typescript
export class ModeManager {
  // 核心功能
  async registerModes(): Promise<void>;
  async setMode(targetType: string, reason: string): Promise<void>;
  async checkAutoTransitions(): Promise<boolean>;
  async executeCurrentMode(): Promise<void>;

  // 状态监听
  async notifyGameStateUpdate(gameState: any): Promise<void>;

  // 安全机制
  async forceRecoverToMain(reason: string): Promise<boolean>;
}
```

**职责**：
- 模式注册和切换管理
- 游戏状态监听器调度
- 模式切换历史记录
- 异常恢复机制

### GameStateListener (监听器接口)

```typescript
export interface GameStateListener {
  readonly listenerName: string;
  readonly enabled: boolean;

  // 状态更新回调
  onGameStateUpdated?(gameState: any, previousState?: any): Promise<void>;
  onEntitiesUpdated?(entities: any[]): Promise<void>;
  onBlocksUpdated?(blocks: any[]): Promise<void>;
  onInventoryUpdated?(inventory: any): Promise<void>;
  onHealthUpdated?(health: { health: number; food: number; saturation: number }): Promise<void>;
}
```

**职责**：
- 定义游戏状态变化响应接口
- 支持细粒度的状态监听
- 实现实时威胁检测

## 🎮 具体模式实现

### MainMode (主模式)

**特征**：
- 最低优先级 (0)
- 需要 LLM 决策
- 负责探索、任务执行和复杂决策

**核心流程**：
```typescript
async execute(): Promise<void> {
  // 1. 收集决策数据
  const promptData = await this.dataCollector.collectAllData();

  // 2. 生成提示词并调用 LLM
  const response = await this.llmManager.chatCompletion(prompt, systemPrompt);

  // 3. 解析并执行动作
  await this.parseAndExecuteActions(response.content);
}
```

**动作解析逻辑**：
- 支持多种动作字段名：`action_type`, `action`, `type`, `name`, `command`
- 智能参数提取：`params` 或直接使用整个 JSON 对象
- 失败时停止后续动作执行（原 maicraft 设计）

### CombatMode (战斗模式)

**特征**：
- 高优先级 (100)
- 不需要 LLM 决策
- 自动战斗响应

**监听器实现**：
```typescript
async onEntitiesUpdated(entities: any[]): Promise<void> {
  const hostileEntities = entities.filter(e =>
    this.hostileEntityNames.includes(e.name?.toLowerCase())
  );

  // 威胁出现时自动切换到战斗模式
  if (this.threatCount === 0 && hostileEntities.length > 0) {
    await this.state.modeManager.setMode(ModeManager.MODE_TYPES.COMBAT,
      `检测到威胁生物: ${nearestEnemy.name}`);
  }

  // 威胁消除时自动退出战斗模式
  if (this.threatCount > 0 && hostileEntities.length === 0) {
    await this.state.modeManager.setMode(ModeManager.MODE_TYPES.MAIN, '威胁消除');
  }
}
```

**战斗逻辑**：
- 威胁检测和目标锁定
- 智能攻击冷却控制
- 战斗日志记录

## 🔄 模式切换机制

### 自动切换条件

1. **威胁响应**：检测到敌对生物 → 战斗模式
2. **威胁消除**：敌对生物消失 → 主模式
3. **超时恢复**：模式运行超时 → 主模式
4. **手动切换**：程序强制切换

### 优先级规则

```
战斗模式 (100) > 主模式 (0)
```

- 高优先级模式可以中断低优先级模式
- 被动响应模式（如战斗）可以中断任何模式
- 同优先级模式不允许随意切换

### 切换流程

```typescript
// 主循环中的切换逻辑
protected async runLoopIteration(): Promise<void> {
  // 1. 通知游戏状态更新
  await this.notifyGameStateUpdate();

  // 2. 检查自动切换
  const modeSwitched = await this.state.modeManager.checkAutoTransitions();
  if (modeSwitched) {
    await this.sleep(500); // 让新模式生效
    return;
  }

  // 3. 执行当前模式逻辑
  await this.state.modeManager.executeCurrentMode();
}
```

## 🛡️ 安全机制

### 1. 中断机制
```typescript
if (this.state.interrupt.isInterrupted()) {
  const reason = this.state.interrupt.getReason();
  this.state.interrupt.clear();
  await this.sleep(1000);
  return;
}
```

### 2. 超时保护
```typescript
// 模式超时检查
isExpired(): boolean {
  if (!this.maxDuration || !this.isActive) return false;
  const elapsedSeconds = (Date.now() - this.activatedAt) / 1000;
  return elapsedSeconds > this.maxDuration;
}
```

### 3. 异常恢复
```typescript
// 严重错误时强制恢复到主模式
if (this.state.modeManager.getCurrentMode() !== ModeManager.MODE_TYPES.MAIN) {
  await this.state.modeManager.forceRecoverToMain('模式执行异常恢复');
}
```

### 4. 模式历史
```typescript
// 切换历史记录
this.transitionHistory.push({
  from: oldMode?.type || 'none',
  to: newMode.type,
  reason,
  timestamp: Date.now(),
});
```

## 📊 性能优化

### 智能等待时间
```typescript
private async adjustSleepDelay(): Promise<void> {
  const currentMode = this.state.modeManager.getCurrentMode();

  switch (currentMode) {
    case ModeManager.MODE_TYPES.COMBAT:
      await this.sleep(200); // 战斗模式需要快速响应
      break;
    case ModeManager.MODE_TYPES.MAIN:
      await this.sleep(100); // 主模式正常间隔
      break;
    default:
      await this.sleep(500); // 其他模式默认间隔
      break;
  }
}
```

### 组件复用
- 模式实例在启动时创建，避免重复初始化
- 状态监听器自动注册，支持多个模式同时监听
- LLM 组件在主模式中统一管理

## 🎯 与原 maicraft 的对比

| 特性 | 原 maicraft (Python) | 本项目 (TypeScript) |
|------|---------------------|---------------------|
| 模式管理 | ModeManager | ModeManager (增强) |
| 环境监听 | EnvironmentListener | GameStateListener |
| 状态管理 | 动态属性 | 强类型接口 |
| 威胁检测 | 实体监听回调 | 游戏状态通知 |
| 动作执行 | 解析器模式 | 智能字段解析 |
| 类型安全 | 运行时检查 | 编译时检查 |
| 性能 | 动态导入 | 静态导入 |

## 🚀 扩展指南

### 添加新模式

1. **继承 BaseMode**：
```typescript
export class NewMode extends BaseMode {
  readonly type = 'new_mode';
  readonly name = '新模式';
  readonly priority = 50;
  readonly requiresLLMDecision = false;

  async execute(): Promise<void> {
    // 实现模式逻辑
  }
}
```

2. **注册到 ModeManager**：
```typescript
// 在 ModeManager.registerModes() 中添加
const newMode = new NewMode(this.context);
newMode.bindState(this.state);
this.registerMode(newMode);
```

3. **实现监听器（可选）**：
```typescript
async onGameStateUpdated(gameState: any): Promise<void> {
  // 实现状态监听逻辑
}
```

### 添加新监听器类型

1. **扩展 GameStateListener 接口**：
```typescript
export interface GameStateListener {
  // 添加新的监听方法
  onWeatherUpdated?(weather: string): Promise<void>;
  onTimeChanged?(time: number): Promise<void>;
}
```

2. **在 ModeManager 中添加通知逻辑**：
```typescript
async notifyGameStateUpdate(gameState: any): Promise<void> {
  // 现有通知逻辑...

  // 新增通知逻辑
  if (gameState.weather) {
    await this.notifyWeatherUpdate(gameState.weather);
  }
}
```

## 📝 最佳实践

### 1. 模式设计
- 保持模式的单一职责
- 合理设置优先级
- 实现必要的超时和恢复机制

### 2. 状态监听
- 只监听相关状态变化
- 避免在监听器中执行耗时操作
- 及时注册和注销监听器

### 3. 错误处理
- 实现优雅的降级机制
- 记录详细的错误日志
- 提供异常恢复路径

### 4. 性能考虑
- 避免频繁的模式切换
- 合理设置等待时间
- 复用组件实例

## 🔍 调试指南

### 模式状态查询
```typescript
// 获取当前模式
const currentMode = modeManager.getCurrentMode();

// 获取模式历史
const history = modeManager.getTransitionHistory();

// 获取所有模式
const allModes = modeManager.getAllModes();
```

### 日志级别
- **INFO**：模式切换、动作执行
- **WARN**：组件缺失、执行失败
- **DEBUG**：详细状态、解析结果
- **ERROR**：异常错误、系统故障

### 常见问题排查
1. **模式无法执行**：检查组件绑定和初始化
2. **切换不生效**：检查优先级和条件判断
3. **监听器无响应**：检查监听器注册和状态更新
4. **动作执行失败**：检查动作解析和参数格式

---

*本架构设计基于原 maicraft 项目的核心理念，结合 TypeScript 的类型安全特性，提供了一个简洁、高效、可扩展的模式系统。*

## 🎯 设计理念

不同场景需要不同的决策逻辑：

- **MainMode** - 正常探索和建造
- **CombatMode** - 战斗模式，优先考虑生存
- **GUIMode** - 使用容器（箱子、熔炉等）

模式系统提供：

- ✅ 灵活的模式切换
- ✅ 每个模式独立的决策逻辑
- ✅ 模式间的上下文保持

---

## 📦 内置模式

### MainMode - 主模式

正常的探索、建造、收集资源等活动。

### CombatMode - 战斗模式

当受到攻击或生命值低时自动切换，优先考虑：

- 逃跑或反击
- 恢复生命值
- 寻找安全位置

---

## 💻 基本使用

### 切换模式

```typescript
import { ModeManager } from '@/core/agent/mode/ModeManager';
import { ModeType } from '@/core/agent/mode/types';

const modeManager = new ModeManager(context);

// 切换到战斗模式
await modeManager.switchMode(ModeType.COMBAT);

// 获取当前模式
const currentMode = modeManager.getCurrentMode();
console.log(currentMode.type); // 'combat'

// 返回主模式
await modeManager.switchMode(ModeType.MAIN);
```

### 自动模式切换

```typescript
// 在事件监听器中自动切换
events.on('entityHurt', data => {
  if (data.entity === bot.entity) {
    // 受到伤害，切换到战斗模式
    modeManager.switchMode(ModeType.COMBAT);
  }
});
```

---

## 🔧 自定义模式

```typescript
import { Mode } from '@/core/agent/mode/Mode';

export class MyCustomMode extends Mode {
  readonly type = 'custom';
  readonly name = 'CustomMode';

  async onEnter(): Promise<void> {
    // 进入模式时的初始化
    console.log('进入自定义模式');
  }

  async onExit(): Promise<void> {
    // 退出模式时的清理
    console.log('退出自定义模式');
  }

  async generatePrompt(): Promise<string> {
    // 生成此模式的专用 prompt
    return '你现在处于自定义模式...';
  }
}

// 注册自定义模式
modeManager.registerMode(new MyCustomMode(context));
```

---

## 📚 相关文档

- [代理系统](agent-system.md)
- [决策循环](decision-loop.md)

---

_最后更新: 2025-11-01_
