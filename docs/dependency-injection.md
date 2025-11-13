# 依赖注入（DI）系统

Maicraft-Next 项目采用的依赖注入容器实现，不使用反射，基于 Map 和工厂函数实现。

## 🎯 概述

项目已全面采用依赖注入（DI）容器来管理所有组件的生命周期和依赖关系，实现了从手动依赖管理到声明式配置的转变。

## 🏗️ 核心架构

### 1. Container（容器）

容器负责管理所有服务的注册和解析。

```typescript
import { Container } from '@/core/di';

const container = new Container();
```

### 2. ServiceKeys（服务键）

使用 Symbol 作为服务的唯一标识符，确保类型安全。

```typescript
import { ServiceKeys } from '@/core/di';

// 预定义的服务键
ServiceKeys.Logger
ServiceKeys.Bot
ServiceKeys.Agent
```

### 3. Lifetime（生命周期）

- **Singleton（单例）**: 整个应用只创建一次
- **Transient（瞬态）**: 每次解析都创建新实例
- **Scoped（作用域）**: 在同一作用域内是单例（暂未实现）

## 📝 使用方式

### 基本用法

```typescript
import { Container, ServiceKeys, configureServices } from '@/core/di';

// 1. 创建容器
const container = new Container();

// 2. 注册服务
container.registerSingleton(ServiceKeys.Logger, () => {
  return createLogger();
});

// 3. 解析服务
const logger = container.resolve<Logger>(ServiceKeys.Logger);
```

### 依赖注入

工厂函数接收容器作为参数，可以解析其他依赖：

```typescript
container.registerSingleton(ServiceKeys.ActionExecutor, (c) => {
  const contextManager = c.resolve(ServiceKeys.ContextManager);
  const logger = c.resolve(ServiceKeys.Logger);
  return new ActionExecutor(contextManager, logger);
});
```

### 异步初始化

使用 `withInitializer` 添加初始化逻辑：

```typescript
container
  .registerSingleton(ServiceKeys.Agent, (c) => {
    return new Agent(...);
  })
  .withInitializer(ServiceKeys.Agent, async (agent) => {
    await agent.initialize();
  });

// 异步解析
const agent = await container.resolveAsync(ServiceKeys.Agent);
```

### 生命周期管理

使用 `withDisposer` 添加清理逻辑：

```typescript
container
  .registerSingleton(ServiceKeys.LLMManager, (c) => {
    return new LLMManager(...);
  })
  .withDisposer(ServiceKeys.LLMManager, (llmManager) => {
    llmManager.close();
  });

// 销毁容器时会自动调用所有 disposer
await container.dispose();
```

## 🔄 架构改进对比

### 之前的问题

```typescript
// 手动管理依赖，容易出错
const contextManager = new ContextManager();
const executor = new ActionExecutor(contextManager, logger);
contextManager.updateExecutor(executor); // 循环依赖处理很麻烦

const agent = new Agent(bot, executor, llmManager, config, logger);
await agent.initialize();
await agent.start();

// 关闭时需要手动调用每个组件的清理方法
await agent.stop();
llmManager.close();
contextManager.cleanup();
```

### 现在的方式

```typescript
// 声明式配置，自动管理依赖
configureServices(container);

// 一行代码获取完全初始化的组件
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
await agent.start();

// 一行代码清理所有资源
await container.dispose();
```

## 📈 主要改进

### 1. 主入口（main.ts）

**之前**: 300+ 行手动初始化代码
**现在**: 60 行，核心逻辑清晰

```typescript
class MaicraftNext {
  private container: Container;

  async initialize(): Promise<void> {
    // 1. 创建容器
    this.container = new Container(this.logger);

    // 2. 加载基础配置
    await this.loadConfiguration();
    await this.connectToMinecraft();

    // 3. 注册基础服务
    this.container.registerInstance(ServiceKeys.Config, this.config!);
    this.container.registerInstance(ServiceKeys.Logger, this.logger);
    this.container.registerInstance(ServiceKeys.Bot, this.bot!);

    // 4. 配置所有服务（一行代码完成）
    configureServices(this.container);

    // 5. 启动服务
    await this.container.resolveAsync<WebSocketServer>(ServiceKeys.WebSocketServer);
    const agent = await this.container.resolveAsync<Agent>(ServiceKeys.Agent);
    await agent.start();
  }

  async shutdown(): Promise<void> {
    // 自动调用所有服务的 disposer
    await this.container.dispose();
  }
}
```

### 2. 服务配置（bootstrap.ts）

集中管理所有服务的创建和生命周期：

```typescript
export function configureServices(container: Container): void {
  // 注册服务
  container
    .registerSingleton(ServiceKeys.LLMManager, c => {
      const config = c.resolve<AppConfig>(ServiceKeys.Config);
      const logger = c.resolve<Logger>(ServiceKeys.Logger);
      return new LLMManager(config.llm, new UsageTracker(config.llm, logger), logger);
    })
    // 初始化器（在创建后调用）
    .withInitializer(ServiceKeys.LLMManager, async llmManager => {
      const health = await llmManager.healthCheck();
      logger.info('LLM健康检查', { health });
    })
    // 销毁器（在容器销毁时调用）
    .withDisposer(ServiceKeys.LLMManager, llmManager => {
      llmManager.close();
    });
}
```

## 🔧 服务注册模式

### 1. 单例服务（默认）

```typescript
container.registerSingleton(ServiceKeys.Logger, () => createLogger());
```

### 2. 瞬态服务（每次创建新实例）

```typescript
container.registerTransient(ServiceKeys.TempService, () => new TempService());
```

### 3. 已存在的实例

```typescript
const config = await loadConfig();
container.registerInstance(ServiceKeys.Config, config);
```

### 4. 带依赖注入

```typescript
container.registerSingleton(ServiceKeys.Agent, c => {
  const bot = c.resolve<Bot>(ServiceKeys.Bot);
  const executor = c.resolve(ServiceKeys.ActionExecutor);
  return new Agent(bot, executor, ...);
});
```

## ⏳ 生命周期管理

### 初始化器

在服务首次创建后执行：

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => new Agent(...))
  .withInitializer(ServiceKeys.Agent, async agent => {
    await agent.initialize();
  });
```

### 销毁器

在容器销毁时执行：

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => new Agent(...))
  .withDisposer(ServiceKeys.Agent, async agent => {
    await agent.stop();
  });
```

## 🔍 解析服务

### 同步解析

```typescript
const logger = container.resolve<Logger>(ServiceKeys.Logger);
```

### 异步解析（支持异步初始化器）

```typescript
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

## ⚠️ 循环依赖处理

容器自动检测循环依赖：

```typescript
// 这会抛出错误: "检测到循环依赖: A -> B -> C -> A"
container.registerSingleton('A', c => {
  const b = c.resolve('B'); // B 依赖 C, C 依赖 A
  return new ServiceA(b);
});
```

解决方案：使用延迟注入或重构依赖关系。

## 🔑 服务键（ServiceKeys）

使用 Symbol 作为服务标识符，确保类型安全：

```typescript
export const ServiceKeys = {
  Config: Symbol('Config'),
  Logger: Symbol('Logger'),
  Bot: Symbol('Bot'),
  Agent: Symbol('Agent'),
  // ...
} as const;
```

## 🧪 测试支持

在测试中可以轻松替换服务：

```typescript
// 测试容器
const testContainer = new Container();

// 注册 mock 服务
testContainer.registerInstance(ServiceKeys.Bot, mockBot);
testContainer.registerInstance(ServiceKeys.Logger, mockLogger);

// 测试
const agent = await testContainer.resolveAsync<Agent>(ServiceKeys.Agent);
```

## 📚 依赖注入模式详解

### 构造函数注入（推荐）✅

```typescript
// Agent.ts - 组件不知道容器的存在
class Agent {
  constructor(
    private memory: MemoryManager,
    private planning: GoalPlanningManager,
    private modeManager: ModeManager
  ) {
    // 直接使用依赖
    this.memory.initialize();
  }
}

// bootstrap.ts - 容器负责组装
container.registerSingleton(ServiceKeys.Agent, c => {
  return new Agent(
    c.resolve(ServiceKeys.MemoryManager),
    c.resolve(ServiceKeys.GoalPlanningManager),
    c.resolve(ServiceKeys.ModeManager)
  );
});

// 测试中 - 简单直接
const agent = new Agent(
  mockMemory,
  mockPlanning,
  mockModeManager
);
```

**优点**：
- ✅ **依赖透明**：构造函数签名就是依赖列表
- ✅ **完全解耦**：Agent 不依赖容器，可独立使用
- ✅ **易于测试**：直接传入 mock，无需 mock 容器
- ✅ **类型安全**：缺少依赖编译时报错
- ✅ **不可变性**：依赖在构造时确定，不会改变
- ✅ **符合 SOLID 原则**：依赖倒置原则

### 服务定位器（不推荐）❌

```typescript
// Agent.ts - 组件依赖容器
class Agent {
  constructor(private container: Container) {
    this.memory = container.resolve(ServiceKeys.MemoryManager);
    this.planning = container.resolve(ServiceKeys.GoalPlanningManager);
  }
}
```

**缺点**：
- ❌ **隐藏依赖**：从构造函数看不出需要什么
- ❌ **容器耦合**：组件必须知道容器和 ServiceKeys
- ❌ **难以测试**：需要 mock 整个容器
- ❌ **运行时错误**：缺少依赖运行时才知道

## ✨ 核心优势

通过 DI 容器，项目获得了：

- ✅ **清晰的架构**: 依赖关系一目了然
- ✅ **易于测试**: 轻松替换依赖
- ✅ **生命周期管理**: 自动初始化和清理
- ✅ **类型安全**: 编译时检查
- ✅ **可维护性**: 集中配置，易于修改
- ✅ **可扩展性**: 添加新服务非常简单

## 🏆 最佳实践

1. **优先使用单例**: 除非明确需要多个实例，否则使用单例
2. **声明式配置**: 所有服务注册集中在 `bootstrap.ts`
3. **类型安全**: 使用 `ServiceKeys` 和类型参数
4. **避免手动创建**: 通过容器解析，不要 `new` 实例
5. **生命周期管理**: 使用 `withInitializer` 和 `withDisposer`

## 🔮 未来扩展

可以轻松添加新服务：

```typescript
// ServiceKeys.ts
export const ServiceKeys = {
  // ...
  NewService: Symbol('NewService'),
};

// bootstrap.ts
export function configureServices(container: Container): void {
  // ...
  container.registerSingleton(ServiceKeys.NewService, c => {
    return new NewService(c.resolve(ServiceKeys.Logger));
  });
}

// 使用
const service = container.resolve<NewService>(ServiceKeys.NewService);
```

## 📖 参考资料

- [Martin Fowler - Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Dependency Injection vs Service Locator](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)

---

*这个文档基于项目的实际实现，展示了完整的依赖注入架构和使用方式。*
