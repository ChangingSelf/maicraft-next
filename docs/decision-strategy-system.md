# 决策策略系统 (Decision Strategy System)

**版本**: 2.0  
**更新日期**: 2025-11-02

---

## 📋 概述

决策策略系统采用**策略模式 + 责任链模式**，将不同的决策行为封装成独立的策略，按优先级自动执行。

### 核心优势

- ✅ **高扩展性** - 添加新行为只需创建一个策略类
- ✅ **职责清晰** - 每个策略专注于单一职责
- ✅ **易于测试** - 策略之间完全解耦
- ✅ **插件支持** - 支持动态加载/卸载策略

---

## 🏗️ 架构设计

### 系统架构

```
MainDecisionLoop (主决策循环)
    ↓ 委托
DecisionStrategyManager (策略管理器)
    ↓ 按优先级执行
┌────────────────────────────────────────┐
│ 策略列表（按优先级排序）                  │
├────────────────────────────────────────┤
│ AutoModeSwitchStrategy (优先级: 100)   │  → 自动检查模式切换
│ LLMDecisionStrategy    (优先级: 10)    │  → LLM智能决策
└────────────────────────────────────────┘
```

### 核心组件

| 组件                        | 文件路径                                                       | 职责         |
| --------------------------- | -------------------------------------------------------------- | ------------ |
| **DecisionStrategy**        | `src/core/agent/decision/types.ts`                             | 策略接口定义 |
| **DecisionStrategyManager** | `src/core/agent/decision/DecisionStrategyManager.ts`           | 策略管理器   |
| **AutoModeSwitchStrategy**  | `src/core/agent/decision/strategies/AutoModeSwitchStrategy.ts` | 模式切换策略 |
| **LLMDecisionStrategy**     | `src/core/agent/decision/strategies/LLMDecisionStrategy.ts`    | LLM决策策略  |
| **MainDecisionLoop**        | `src/core/agent/loop/MainDecisionLoop.ts`                      | 主决策循环   |

---

## 📝 使用指南

### 1. 创建新策略

```typescript
import type { AgentState } from '../types';
import type { DecisionStrategy } from '../decision/types';
import { StrategyGroup } from '../decision/types';
import { getLogger, type Logger } from '@/utils/Logger';

/**
 * 自动吃东西策略
 *
 * 当饥饿值低于 6 时自动吃食物
 */
export class AutoEatStrategy implements DecisionStrategy {
  readonly name = '自动吃东西';
  private logger: Logger;

  constructor() {
    this.logger = getLogger('AutoEatStrategy');
  }

  /**
   * 检查是否可以执行
   */
  canExecute(state: AgentState): boolean {
    // 饥饿值低于 6 时执行
    return state.context.gameState.food < 6;
  }

  /**
   * 执行策略
   */
  async execute(state: AgentState): Promise<void> {
    this.logger.info('🍖 自动吃东西');

    // 查找食物
    const food = this.findFood(state);
    if (!food) {
      this.logger.warn('没有食物可吃');
      return;
    }

    // 执行吃东西动作
    await state.context.executor.execute('eat', { item: food });
  }

  /**
   * 获取优先级
   */
  getPriority(): number {
    return 80; // 高优先级（生存很重要）
  }

  /**
   * 获取策略分组
   */
  getGroup(): StrategyGroup {
    return StrategyGroup.SURVIVAL;
  }

  /**
   * 查找可用食物
   */
  private findFood(state: AgentState): string | null {
    const inventory = state.context.gameState.inventory;
    // 查找食物逻辑
    // ...
    return 'bread'; // 示例
  }
}
```

### 2. 注册策略

在 `MainDecisionLoop.ts` 的 `registerStrategies` 方法中添加：

```typescript
private registerStrategies(state: AgentState): void {
  // ... 现有策略

  // 注册新策略
  this.strategyManager.addStrategy(new AutoEatStrategy());

  this.logger.info(`✅ 已注册 ${this.strategyManager.getStats().totalStrategies} 个策略`);
}
```

### 3. 策略自动执行

策略管理器会按优先级自动选择并执行第一个可执行的策略：

```typescript
// MainDecisionLoop 中的执行逻辑
const executed = await this.strategyManager.executeStrategies(this.state);
```

---

## 🎯 策略分组

策略通过分组进行组织，便于理解和管理：

```typescript
export enum StrategyGroup {
  MODE_MANAGEMENT = 'mode_management', // 模式管理
  SURVIVAL = 'survival', // 生存（吃东西、治疗、逃跑）
  COMBAT = 'combat', // 战斗
  RESOURCE = 'resource', // 资源采集（挖矿、伐木）
  BUILDING = 'building', // 建筑
  AI_DECISION = 'ai_decision', // AI决策
}
```

---

## 🔌 插件支持

决策策略系统天然支持插件，可以动态加载/卸载策略。

### 插件接口

```typescript
interface IDecisionPlugin {
  name: string;
  version: string;
  strategies: DecisionStrategy[];
}
```

### 插件示例

```typescript
/**
 * 农业插件
 */
class FarmingPlugin implements IDecisionPlugin {
  name = 'farming';
  version = '1.0.0';

  strategies = [
    new PlantSeedsStrategy(), // 种植种子 (优先级: 40)
    new HarvestCropsStrategy(), // 收获作物 (优先级: 35)
    new WaterPlantsStrategy(), // 浇水     (优先级: 25)
  ];
}

// 加载插件
pluginManager.loadPlugin(new FarmingPlugin());

// 卸载插件
pluginManager.unloadPlugin('farming');
```

---

## 📊 现有策略

| 策略名称                   | 优先级 | 分组            | 说明                        |
| -------------------------- | ------ | --------------- | --------------------------- |
| **AutoModeSwitchStrategy** | 100    | MODE_MANAGEMENT | 自动检查并执行模式切换      |
| **LLMDecisionStrategy**    | 10     | AI_DECISION     | 使用LLM进行智能决策（兜底） |

---

## 🔄 执行流程

```
1. 主循环开始
   ↓
2. 检查中断状态
   ↓
3. 策略管理器按优先级遍历策略
   ↓
4. 找到第一个可执行的策略
   ↓
5. 执行策略
   ↓
6. 返回执行结果
   ↓
7. 定期任务评估
   ↓
8. 循环继续
```

---

## 🎨 设计模式

### 策略模式 (Strategy Pattern)

- **意图**: 定义一系列算法，将它们封装起来，并使它们可以互换
- **优点**: 算法独立于使用它的客户端，易于扩展

### 责任链模式 (Chain of Responsibility Pattern)

- **意图**: 使多个对象都有机会处理请求，避免请求发送者和接收者之间的耦合
- **优点**: 降低耦合度，增强灵活性

---

## 📈 性能考虑

### 时间复杂度

- **策略检查**: O(n)，n = 策略数量
- **策略执行**: 取决于具体策略的实现

### 优化建议

1. **控制策略数量** - 建议策略数量 < 20 个
2. **快速失败** - `canExecute()` 应尽快返回结果
3. **避免阻塞** - 策略执行应该是异步非阻塞的

---

## 🧪 测试

### 单元测试示例

```typescript
import { AutoEatStrategy } from '../strategies/AutoEatStrategy';

describe('AutoEatStrategy', () => {
  it('should execute when food is low', async () => {
    // 准备 mock 数据
    const mockState = {
      context: {
        gameState: { food: 3 },
        executor: { execute: jest.fn() },
      },
    } as any;

    const strategy = new AutoEatStrategy();

    // 测试 canExecute
    expect(strategy.canExecute(mockState)).toBe(true);

    // 测试 execute
    await strategy.execute(mockState);
    expect(mockState.context.executor.execute).toHaveBeenCalledWith('eat', expect.any(Object));
  });

  it('should not execute when food is sufficient', () => {
    const mockState = {
      context: { gameState: { food: 15 } },
    } as any;

    const strategy = new AutoEatStrategy();
    expect(strategy.canExecute(mockState)).toBe(false);
  });
});
```

---

## 🔍 调试

### 查看策略统计

```typescript
const stats = strategyManager.getStats();
console.log(`总策略数: ${stats.totalStrategies}`);
console.log(`按分组统计:`, stats.groups);
```

### 查看当前策略

```typescript
const info = await strategyManager.getCurrentStrategyInfo(state);
if (info) {
  console.log(`当前策略: ${info.strategy.name}`);
  console.log(`分组: ${info.group}`);
}
```

---

## 📚 相关文档

- [架构分析与优化](./architecture-analysis-and-optimization.md) - 完整的架构分析
- [事件系统](./event-system.md) - 事件系统文档
- [模式系统](./mode-system.md) - 模式管理文档
- [动作系统](./action-system.md) - 动作执行系统

---

## 🤝 贡献指南

### 添加新策略的步骤

1. 在 `src/core/agent/decision/strategies/` 创建新策略文件
2. 实现 `DecisionStrategy` 接口
3. 在 `MainDecisionLoop.registerStrategies()` 中注册
4. 编写单元测试
5. 更新本文档的"现有策略"表格

### 代码规范

- 策略类名以 `Strategy` 结尾
- 优先级范围: 1-100（数值越大优先级越高）
- 必须提供详细的注释说明策略用途

---

## 💡 最佳实践

### DO ✅

- ✅ 策略职责单一，只做一件事
- ✅ `canExecute()` 快速返回，避免复杂计算
- ✅ 使用合适的优先级，避免冲突
- ✅ 添加详细的日志输出
- ✅ 编写单元测试

### DON'T ❌

- ❌ 不要在策略中直接操作全局状态
- ❌ 不要在 `canExecute()` 中执行耗时操作
- ❌ 不要创建过多优先级相同的策略
- ❌ 不要在策略中调用其他策略

---

## 📞 支持

如有问题或建议，请查阅相关文档或提交 Issue。

---

**最后更新**: 2025-11-02  
**作者**: Maicraft-Next Team
