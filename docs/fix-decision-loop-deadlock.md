# 修复决策循环死锁问题

## 🐛 问题诊断

### 症状
Bot 在游戏中一直不动，日志显示：
```
[DEBUG] [MainDecisionLoop] ⏸️ 没有可执行的策略，等待中...
```
同时在后台执行战斗动作，但主循环陷入死循环。

### 根本原因

**双重架构缺陷导致死锁**：

#### 问题1：策略系统设计缺陷
```typescript
// AutoModeSwitchStrategy 总是返回 true
canExecute(state: AgentState): boolean {
  return true; // ❌ 总是可执行
}

// 策略管理器执行第一个可用策略后立即返回
async executeStrategies(state: AgentState): Promise<boolean> {
  for (const strategy of this.strategies) {
    if (canExecute) {
      await strategy.execute(state);
      return true; // ❌ 立即返回，后续策略永远不执行
    }
  }
}
```

**结果**：每次循环都执行模式切换检查，`LLMDecisionStrategy` 永远轮不到执行！

#### 问题2：模式系统与策略系统脱节
```typescript
// CombatMode 在 activate 时启动异步任务
async activate(reason: string): Promise<void> {
  this.combatTask = this.runCombatLogic(); // ❌ 后台运行
}

// 同时设置不需要LLM决策
readonly requiresLLMDecision = false;
```

**结果**：
1. Bot 进入战斗模式
2. 战斗逻辑在后台异步运行
3. `LLMDecisionStrategy.canExecute()` 返回 false（因为战斗模式不需要LLM）
4. 主循环找不到可执行策略 → "没有可执行的策略，等待中..."
5. 战斗逻辑在后台继续执行（与主循环完全脱节）
6. **死锁**：主循环空转，战斗任务独立运行，无法协调

## ✅ 解决方案

参考原 maicraft 项目的战斗设计，进行全面重构。

### 修复1：将模式切换从策略系统移出

**修改**: `src/core/agent/loop/MainDecisionLoop.ts`

```typescript
protected async runLoopIteration(): Promise<void> {
  // 1. 检查中断
  if (this.state.interrupt.isInterrupted()) {
    // ... 处理中断
    return;
  }

  // 2. 检查模式自动切换（优先于策略执行）
  const modeSwitched = await this.state.modeManager.checkAutoTransitions();
  if (modeSwitched) {
    this.logger.debug('✨ 模式已自动切换');
    await this.sleep(500);
    return; // 模式切换后跳过本次决策
  }

  // 3. 委托策略管理器执行决策
  const executed = await this.strategyManager.executeStrategies(this.state);

  // 4. 没有策略执行时等待
  if (!executed) {
    this.logger.debug('⏸️ 没有可执行的策略，等待中...');
    await this.sleep(1000);
    return;
  }

  // 5. 定期评估任务
  this.evaluationCounter++;
  if (this.evaluationCounter % 5 === 0) {
    await this.evaluateTask();
  }

  // 6. 决策后短暂等待
  await this.sleep(100);
}
```

**关键改进**：
- ✅ 模式切换在主循环开头独立处理
- ✅ 不再作为策略参与竞争
- ✅ 切换后立即返回，确保新模式在下次循环生效

### 修复2：创建战斗策略

**新增**: `src/core/agent/decision/strategies/CombatStrategy.ts`

```typescript
export class CombatStrategy implements DecisionStrategy {
  readonly name = '战斗策略';

  canExecute(state: AgentState): boolean {
    // 只在战斗模式下执行
    return state.modeManager.getCurrentMode() === ModeType.COMBAT;
  }

  async execute(state: AgentState): Promise<void> {
    const nearestEnemy = this.findNearestEnemy(state);

    if (!nearestEnemy) {
      this.logger.warn('⚠️ 战斗模式下没有发现敌人，等待模式切换...');
      return; // 让 ModeManager 的 checkAutoTransitions 处理退出
    }

    // 执行战斗动作
    const result = await state.context.executor.execute(ActionIds.KILL_MOB, {
      entity: nearestEnemy.name,
      timeout: 30,
    });

    // 记录战斗结果
    if (result.success) {
      state.memory.recordThought(`⚔️ 成功击杀 ${nearestEnemy.name}`);
    }
  }

  getPriority(): number {
    return 50; // 高优先级，仅次于模式切换
  }
}
```

**关键特性**：
- ✅ 战斗逻辑通过策略系统执行
- ✅ 与主循环同步运行
- ✅ 在战斗模式下可以被策略管理器正常调度
- ✅ 没有敌人时返回，让模式切换逻辑处理退出

### 修复3：简化战斗模式

**修改**: `src/core/agent/mode/modes/CombatMode.ts`

```typescript
export class CombatMode extends Mode {
  readonly requiresLLMDecision = false; // 由 CombatStrategy 处理

  async activate(reason: string): Promise<void> {
    await super.activate(reason);
    this.context.logger.info('⚔️ 进入战斗状态');
    // 不再启动独立的异步任务
  }

  async deactivate(reason: string): Promise<void> {
    await super.deactivate(reason);
    this.context.logger.info('✌️ 退出战斗状态');
    // 不再需要取消任务
  }
}
```

**关键改进**：
- ✅ 移除独立的异步战斗任务
- ✅ 战斗逻辑由 `CombatStrategy` 统一管理
- ✅ 模式只负责状态标识，不执行具体逻辑

### 修复4：完善模式切换条件

**修改**: `src/core/agent/mode/ModeManager.ts`

```typescript
// 参考原maicraft设计：威胁消除时立即退出
private shouldExitCombat(state: AgentState): boolean {
  const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch', 'blaze', 'ghast'];
  const enemies = (state.context.gameState.nearbyEntities || []).filter((e: any) => 
    hostileMobs.includes(e.name?.toLowerCase())
  );

  // 参考原maicraft: 威胁消除时(threat_count == 0)立即退出战斗模式
  return enemies.length === 0;
}
```

**关键改进**：
- ✅ 扩展敌对生物列表
- ✅ 威胁消除（enemies.length === 0）时立即退出
- ✅ 自动回归主模式

### 修复5：更新策略注册

**修改**: `src/core/agent/loop/MainDecisionLoop.ts`

```typescript
private registerStrategies(state: AgentState): void {
  const actionPromptGenerator = new ActionPromptGenerator(state.context.executor);
  const dataCollector = new PromptDataCollector(state, actionPromptGenerator);

  // 注册策略（按优先级自动排序）
  this.strategyManager.addStrategy(new CombatStrategy());           // 优先级 50
  this.strategyManager.addStrategy(new LLMDecisionStrategy(...));   // 优先级 10

  // 移除了 AutoModeSwitchStrategy - 模式切换在主循环处理
}
```

## 📊 对比原maicraft设计

| 特性 | 原maicraft (Python) | 修复后 (TypeScript) |
|------|---------------------|---------------------|
| 模式切换 | 在环境监听器中处理 | 在主循环中处理 |
| 战斗逻辑 | 独立异步任务 | 通过策略系统执行 |
| 威胁检测 | 环境监听回调 | 模式转换条件检查 |
| 自动退出 | `threat_count == 0` 立即退出 | `enemies.length === 0` 立即退出 |
| 记录日志 | 思考日志 | Memory系统 |

## 🎯 关键设计原则

### 1. **单一职责**
- **模式**：只负责状态标识和生命周期管理
- **策略**：负责具体的决策和动作执行
- **循环**：负责协调模式切换和策略调度

### 2. **同步执行**
- 所有决策逻辑通过策略系统**同步执行**
- 避免异步任务与主循环脱节
- 确保状态一致性

### 3. **优先级明确**
```
模式切换 (主循环) > 战斗策略 (50) > LLM决策 (10)
```

### 4. **自动恢复**
- 威胁出现 → 自动进入战斗模式
- 威胁消除 → 自动回归主模式
- 无需手动干预

## ✅ 验证清单

运行bot后，应该看到：

### 正常探索时
```
✅ 已注册 2 个决策策略
💭 生成提示词完成
🤖 LLM 响应完成
📋 准备执行 X 个动作
🎬 执行动作 1/X: move
✅ 动作 1/X: 成功
```

### 遇到敌人时
```
🔄 模式切换: 主模式 → 战斗模式 (检测到敌对生物)
⚔️ 进入战斗状态
⚔️ 攻击目标: zombie (距离: 5.2m)
✅ 成功击杀: zombie
```

### 威胁消除后
```
🔄 模式切换: 战斗模式 → 主模式 (战斗结束)
✌️ 退出战斗状态
💭 生成提示词完成
[继续正常探索...]
```

### 不应该出现
```
❌ ⏸️ 没有可执行的策略，等待中... (持续出现)
❌ 动作在后台执行，但主循环空转
❌ 策略执行被跳过
```

## 📝 总结

**原因**：策略系统和模式系统设计缺陷导致死锁

**修复**：
1. 将模式切换从策略系统移到主循环
2. 创建战斗策略统一管理战斗逻辑
3. 简化战斗模式，只负责状态管理
4. 参考原maicraft实现自动退出机制

**效果**：
- ✅ 主循环正常运转
- ✅ 策略正确执行
- ✅ 模式自动切换
- ✅ 战斗后自动恢复

## 🔗 相关文件

- `src/core/agent/loop/MainDecisionLoop.ts` - 主决策循环
- `src/core/agent/decision/strategies/CombatStrategy.ts` - 战斗策略（新增）
- `src/core/agent/mode/modes/CombatMode.ts` - 战斗模式
- `src/core/agent/mode/ModeManager.ts` - 模式管理器
- `maicraft/agent/modes/impl/combat_mode.py` - 原maicraft参考实现

