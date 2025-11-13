# 依赖注入（DI）系统

一个简单但功能完整的依赖注入容器，不使用反射，基于 Map 和工厂函数实现。

📖 **完整文档**: [依赖注入系统详解](../../docs/dependency-injection.md)

## 快速开始

```typescript
import { Container, ServiceKeys, configureServices } from '@/core/di';

// 1. 创建容器
const container = new Container();

// 2. 注册基础服务
container.registerInstance(ServiceKeys.Config, config);
container.registerInstance(ServiceKeys.Logger, logger);
container.registerInstance(ServiceKeys.Bot, bot);

// 3. 配置所有服务
configureServices(container);

// 4. 解析服务
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

### 核心概念

#### ServiceKeys（服务键）

使用 Symbol 作为服务的唯一标识符，确保类型安全。

```typescript
import { ServiceKeys } from '@/core/di';

// 预定义的服务键
ServiceKeys.Logger
ServiceKeys.Bot
ServiceKeys.Agent
```

#### Lifetime（生命周期）

- **Singleton（单例）**: 整个应用只创建一次
- **Transient（瞬态）**: 每次解析都创建新实例
- **Scoped（作用域）**: 在同一作用域内是单例（暂未实现）

## API 概览

### 注册服务

```typescript
// 单例服务
container.registerSingleton(ServiceKeys.Logger, () => createLogger());

// 瞬态服务
container.registerTransient(ServiceKeys.TempService, () => new TempService());

// 已存在实例
container.registerInstance(ServiceKeys.Config, config);
```

### 解析服务

```typescript
// 同步解析
const logger = container.resolve<Logger>(ServiceKeys.Logger);

// 异步解析
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

### 生命周期管理

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => new Agent(...))
  .withInitializer(ServiceKeys.Agent, async agent => {
    await agent.initialize();
  })
  .withDisposer(ServiceKeys.Agent, agent => {
    agent.stop();
  });
```

## 文件结构

- `Container.ts` - DI 容器实现
- `ServiceKeys.ts` - 服务键定义
- `bootstrap.ts` - 服务注册配置
- `index.ts` - 模块导出

📖 详细使用指南请参考：[依赖注入系统详解](../../docs/dependency-injection.md)