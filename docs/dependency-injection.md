# 依赖注入系统详解 - 餐厅管理指南

## 🍽️ 前言：为什么需要依赖注入？

想象你正在开发一个Minecraft AI机器人系统。你需要管理：

- 🤖 Minecraft机器人连接
- 📝 日志记录系统
- 💾 各种缓存（方块、容器、位置）
- 🧠 AI代理和记忆系统
- 🔧 各种工具类和配置

**问题来了**：这些组件互相依赖，谁先创建？谁依赖谁？如果手动管理，代码会变成：

```typescript
// 噩梦般的依赖管理
const logger = createLogger();
const config = loadConfig();
const bot = createBot(config);
const blockCache = new BlockCache(logger);
const containerCache = new ContainerCache(logger);
const cacheManager = new CacheManager(bot, blockCache, containerCache);
const gameState = new GameState(blockCache, containerCache);
const contextManager = new ContextManager(bot, config, logger, gameState);
// ... 继续创建更多组件
```

依赖注入系统就是为了解决这个问题而生的！

## 🏗️ 核心架构

### 1. 🏪 Container（容器）- 智能仓库管理员

容器就像一个智能仓库管理员，他负责：

- 📦 **存储**所有组件的"制作配方"
- 🔍 **查找**你需要的组件
- 🏭 **生产**组件（如果还没准备好）
- 🔄 **管理**组件的生命周期

```typescript
import { Container } from '@/core/di';

// 创建一个"仓库管理员"
const container = new Container();
```

### 2. 🏷️ ServiceKeys（服务标签）- 唯一的商品编码

每个组件都有一个唯一的"条形码"，确保不会搞混。

```typescript
import { ServiceKeys } from '@/core/di';

// 这些是预定义的"条形码"
ServiceKeys.Logger; // 日志工具的编码
ServiceKeys.Bot; // Minecraft机器人的编码
ServiceKeys.Agent; // AI代理的编码
```

**为什么用Symbol不用字符串？**

- Symbol就像身份证号，全球唯一
- 字符串可能重复（如两个组件都叫"service"）
- 类型安全：TypeScript知道你在要什么

### 3. ⏰ Lifetime（保质期）- 组件的保存时间

- **🍯 Singleton（单例）**: 像蜂蜜，全系统只有一份，一直用到关门
- **🍴 Transient（瞬态）**: 像一次性餐具，用完就扔，下次用新的
- **📦 Scoped（作用域）**: 在同一个"订单"内可以重复使用（还没实现）

## 📝 使用方式

### 🚀 快速开始（3步走）

```typescript
import { Container, ServiceKeys, configureServices } from '@/core/di';

// 第1步：创建仓库管理员
const container = new Container();

// 第2步：告诉管理员所有商品怎么制作
configureServices(container); // 一行代码配置所有组件

// 第3步：要什么拿什么
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

就这么简单！系统会自动处理所有复杂的依赖关系。

### 📦 注册商品（告诉系统怎么制作）

#### 简单商品（不需要其他材料）

```typescript
// 注册一个日志工具（单例）
container.registerSingleton(ServiceKeys.Logger, () => {
  return createLogger(); // 直接创建，不需要其他东西
});
```

#### 复杂商品（需要多种材料）

```typescript
// 注册一个CacheManager（需要多种材料）
container.registerSingleton(ServiceKeys.CacheManager, c => {
  // 自动获取所有需要的材料
  const bot = c.resolve<Bot>(ServiceKeys.Bot); // 🤖 机器人
  const blockCache = c.resolve(ServiceKeys.BlockCache); // 💾 方块缓存
  const containerCache = c.resolve(ServiceKeys.ContainerCache); // 📦 容器缓存

  // 用这些材料制作最终产品
  return new CacheManager(bot, blockCache, containerCache, config);
});
```

**注意**：这里的 `c` 就是容器本身，你可以用它来获取任何已注册的组件！

### ⚡ 获取商品（使用组件）

```typescript
// 同步获取（立即拿到）
const logger = container.resolve<Logger>(ServiceKeys.Logger);

// 异步获取（需要时间准备）
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

### 🔄 生命周期管理（商品的"保质期"管理）

#### 初始化（商品制作完成后的加工）

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => new Agent(...))
  .withInitializer(ServiceKeys.Agent, async agent => {
    // 商品制作完成后，还需要"热一下"或"调试一下"
    await agent.initialize();
    console.log('AI代理准备就绪！');
  });
```

#### 清理（餐厅关门时的卫生工作）

```typescript
container
  .registerSingleton(ServiceKeys.LLMManager, c => new LLMManager(...))
  .withDisposer(ServiceKeys.LLMManager, llmManager => {
    // 关门时清理工作
    llmManager.close();
    console.log('LLM连接已关闭');
  });
```

#### 完整示例

```typescript
// 注册一个完整的AI代理
container
  .registerSingleton(ServiceKeys.Agent, c => {
    // 收集所有需要的材料
    const bot = c.resolve<Bot>(ServiceKeys.Bot);
    const executor = c.resolve(ServiceKeys.ActionExecutor);
    const llmManager = c.resolve(ServiceKeys.LLMManager);
    const config = c.resolve<AppConfig>(ServiceKeys.Config);

    // 制作最终产品
    return new Agent(bot, executor, llmManager, config);
  })
  .withInitializer(ServiceKeys.Agent, async agent => {
    // 制作完成后启动
    await agent.initialize();
    await agent.start();
  })
  .withDisposer(ServiceKeys.Agent, async agent => {
    // 关门时停止
    await agent.stop();
  });

// 使用
const agent = await container.resolveAsync(ServiceKeys.Agent);
// 现在agent已经完全准备好可以使用了！
```

// 销毁容器时会自动调用所有 disposer
await container.dispose();

````

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
````

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

### 2. 📋 服务配置（bootstrap.ts）- 总菜单

这里是整个系统的"总菜单"，所有组件的制作方法都在这里定义：

```typescript
export function configureServices(container: Container): void {
  // ============ 各种组件的注册 ============

  // 注册LLM管理器（需要配置和日志）
  container
    .registerSingleton(ServiceKeys.LLMManager, c => {
      // 自动获取依赖
      const config = c.resolve<AppConfig>(ServiceKeys.Config);
      const logger = c.resolve<Logger>(ServiceKeys.Logger);
      return new LLMManager(config.llm, new UsageTracker(config.llm, logger), logger);
    })
    // 创建后的检查工作
    .withInitializer(ServiceKeys.LLMManager, async llmManager => {
      const health = await llmManager.healthCheck();
      console.log('AI大脑连接正常！');
    })
    // 关门时的清理工作
    .withDisposer(ServiceKeys.LLMManager, llmManager => {
      llmManager.close();
      console.log('AI大脑连接已断开');
    });

  // 注册AI代理（依赖最多的组件）
  container
    .registerSingleton(ServiceKeys.Agent, async c => {
      // 收集所有需要的零件
      const bot = c.resolve<Bot>(ServiceKeys.Bot);
      const executor = c.resolve(ServiceKeys.ActionExecutor);
      const llmManager = await c.resolveAsync(ServiceKeys.LLMManager);
      const config = c.resolve<AppConfig>(ServiceKeys.Config);

      return new Agent(bot, executor, llmManager, config);
    })
    .withInitializer(ServiceKeys.Agent, async agent => {
      await agent.initialize();
      console.log('AI代理启动完成，可以开始工作了！');
    })
    .withDisposer(ServiceKeys.Agent, async agent => {
      await agent.stop();
      console.log('AI代理已停止');
    });
}
```

## 🔧 商品注册模式（如何告诉仓库管理员制作商品）

### 🥄 1. 普通商品（单例）- 像盐和酱油

```typescript
// 注册日志工具（全系统只有一份）
container.registerSingleton(ServiceKeys.Logger, () => createLogger());
```

**特点**：第一次要的时候创建，之后一直用同一份。

### 🍽️ 2. 一次性商品（瞬态）- 像一次性餐具

```typescript
// 注册临时服务（每次都要新的）
container.registerTransient(ServiceKeys.TempService, () => new TempService());
```

**特点**：每次要的时候都创建新的，用完就扔。

### 📦 3. 现成商品（实例）- 你已经准备好了

```typescript
// 你已经有的配置，直接放进仓库
const config = await loadConfig();
container.registerInstance(ServiceKeys.Config, config);
```

**特点**：你负责创建，仓库管理员负责保存。

### 🧱 4. 复杂商品（依赖注入）- 需要多种材料

```typescript
// 注册AI代理（需要很多零件）
container.registerSingleton(ServiceKeys.Agent, c => {
  // 自动获取所有需要的零件
  const bot = c.resolve<Bot>(ServiceKeys.Bot); // 🤖 机器人
  const executor = c.resolve(ServiceKeys.ActionExecutor); // ⚡ 执行器
  const llmManager = c.resolve(ServiceKeys.LLMManager); // 🧠 AI大脑
  const config = c.resolve<AppConfig>(ServiceKeys.Config); // ⚙️ 配置

  // 用这些零件组装最终产品
  return new Agent(bot, executor, llmManager, config);
});
```

**特点**：仓库管理员自动收集所有需要的材料，你只需要告诉他怎么组装。

## ⏳ 商品生命周期管理（从出生到结束）

### 👶 初始化器（出生后检查）- 商品制作完成后的"调试"

有些商品制作完成后，还需要进行一些设置或检查：

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => new Agent(...))
  .withInitializer(ServiceKeys.Agent, async agent => {
    // 商品制作完成后，进行"开机检查"
    await agent.initialize();
    await agent.start();
    console.log('AI代理已启动并准备就绪！');
  });
```

**什么时候执行？**

- 单例服务：只在第一次创建后执行
- 瞬态服务：每次创建后都执行

### 🧹 销毁器（关门打烊）- 餐厅关门时的卫生工作

当整个系统要关闭时，需要清理所有资源：

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => new Agent(...))
  .withDisposer(ServiceKeys.Agent, async agent => {
    // 关门时进行清理工作
    await agent.stop();
    console.log('AI代理已安全停止');
  });
```

**特点：**

- 只对单例服务有效
- 在 `container.dispose()` 时自动执行
- 按注册相反的顺序执行（后注册的先销毁）

### 📋 完整生命周期示例

```typescript
// 注册一个完整的AI代理服务
container
  .registerSingleton(ServiceKeys.Agent, c => {
    console.log('🔨 正在制作AI代理...');
    return new Agent(...);
  })
  .withInitializer(ServiceKeys.Agent, async agent => {
    console.log('⚡ 正在启动AI代理...');
    await agent.initialize();
    await agent.start();
    console.log('✅ AI代理已就绪！');
  })
  .withDisposer(ServiceKeys.Agent, async agent => {
    console.log('🛑 正在停止AI代理...');
    await agent.stop();
    console.log('✅ AI代理已安全停止');
  });

// 使用
const agent = await container.resolveAsync(ServiceKeys.Agent);

// 系统关闭时
await container.dispose(); // 会自动调用所有销毁器
```

## 🔍 要商品（解析服务）- 从仓库取货

### ⚡ 立即取货（同步解析）

如果商品能立即拿到，就用普通方式：

```typescript
// 要日志工具（能立即拿到）
const logger = container.resolve<Logger>(ServiceKeys.Logger);
```

### ⏳ 等待取货（异步解析）

如果商品需要时间准备（如需要启动、连接网络等），就用async方式：

```typescript
// 要AI代理（需要启动时间）
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

**什么时候用async？**

- 当工厂函数返回Promise时
- 当withInitializer是async函数时
- 当组件需要异步初始化时

## ⚠️ 死循环问题（循环依赖）- 避免"鸡生蛋，蛋生鸡"

想象一下：

- A需要B来工作
- B需要C来工作
- C需要A来工作

这就形成了死循环！仓库管理员会检测到这个问题并报错：

```typescript
// ❌ 这会报错："检测到循环依赖: A -> B -> C -> A"
container.registerSingleton('A', c => {
  const b = c.resolve('B'); // A需要B
  return new ServiceA(b);
});

container.registerSingleton('B', c => {
  const c = c.resolve('C'); // B需要C
  return new ServiceB(c);
});

container.registerSingleton('C', c => {
  const a = c.resolve('A'); // C需要A → 死循环！
  return new ServiceC(a);
});
```

### 🔧 解决方案

#### 方法1：延迟注入（推荐）

```typescript
// ✅ 正确做法：C不立即要A，而是等A创建好后再设置
container
  .registerSingleton('C', c => {
    // 先只创建C，不依赖A
    return new ServiceC();
  })
  .withInitializer('C', async c => {
    // 在初始化时再获取A
    const a = await c.resolveAsync('A');
    c.setDependency(a); // 延迟设置依赖
  });
```

#### 方法2：重构依赖关系

```typescript
// ✅ 重构：让A、B、C不再互相依赖
// 比如创建一个中介服务D，让A和C都依赖D
container.registerSingleton('D', () => new MediatorService());

container.registerSingleton('A', c => {
  const d = c.resolve('D'); // A只依赖D
  return new ServiceA(d);
});

container.registerSingleton('C', c => {
  const d = c.resolve('D'); // C也只依赖D
  return new ServiceC(d);
});
```

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

## 🧪 测试支持 - 轻松替换"假货"进行测试

DI系统最大的好处就是**测试超级方便**！你可以轻松替换任何组件为测试版本：

### 替换真实组件为测试版本

```typescript
// 创建测试用的仓库（和真实仓库隔离）
const testContainer = new Container();

// 替换真实组件为"假货"（mock对象）
testContainer.registerInstance(ServiceKeys.Bot, mockBot); // 用假机器人
testContainer.registerInstance(ServiceKeys.Logger, mockLogger); // 用假日志工具

// 其他组件保持真实（因为我们只想测Agent）
testContainer.registerSingleton(ServiceKeys.MemoryManager, c => realMemoryManager);
testContainer.registerSingleton(ServiceKeys.GoalPlanningManager, c => realPlanningManager);

// 测试Agent（它会自动使用假机器人和假日志）
const agent = await testContainer.resolveAsync<Agent>(ServiceKeys.Agent);

// 现在可以测试Agent的行为，而不用真的连Minecraft服务器！
expect(mockBot.chat).toHaveBeenCalledWith('Hello World!');
```

### 为什么测试这么方便？

**传统方式测试Agent：**

```typescript
// 噩梦般的测试准备
const realBot = createBot(); // 需要真的Minecraft服务器
const realLogger = createLogger(); // 需要真的文件系统
const realMemory = new MemoryManager();
const realPlanning = new GoalPlanningManager();

const agent = new Agent(realBot, realLogger, realMemory, realPlanning);
// 测试... 但会真的连服务器、写日志文件！
```

**DI方式测试Agent：**

```typescript
// 轻松的测试准备
const agent = await testContainer.resolveAsync<Agent>(ServiceKeys.Agent);
// 只测试Agent逻辑，不会真的连服务器或写文件！
```

**测试的好处：**

- 🚀 **快**：不需要启动真实的服务
- 🛡️ **安全**：不会影响真实数据
- 🎯 **专注**：只测试当前组件的逻辑
- 🔄 **灵活**：可以测试各种异常情况

## 📚 依赖注入模式详解

### 构造函数注入（推荐）✅

```typescript
// Agent.ts - 组件不知道容器的存在
class Agent {
  constructor(
    private memory: MemoryManager,
    private planning: GoalPlanningManager,
    private modeManager: ModeManager,
  ) {
    // 直接使用依赖
    this.memory.initialize();
  }
}

// bootstrap.ts - 容器负责组装
container.registerSingleton(ServiceKeys.Agent, c => {
  return new Agent(c.resolve(ServiceKeys.MemoryManager), c.resolve(ServiceKeys.GoalPlanningManager), c.resolve(ServiceKeys.ModeManager));
});

// 测试中 - 简单直接
const agent = new Agent(mockMemory, mockPlanning, mockModeManager);
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

_这个文档基于项目的实际实现，展示了完整的依赖注入架构和使用方式。_
