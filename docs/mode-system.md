# 模式系统 (Mode System)

> 本文档介绍 Maicraft-Next 的模式管理系统

---

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
events.on('entityHurt', (data) => {
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

