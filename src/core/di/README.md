# 依赖注入系统 - 像餐厅厨房一样的代码管理

想象一下，你在经营一家餐厅。厨房里有各种工具和食材，每道菜都需要不同的工具和食材。如果每个人都自己去厨房找东西，那会乱成一团。

依赖注入系统就像餐厅的**总厨师长**，他知道每道菜需要什么食材、什么工具，并且会精确地准备好一切。你只需要告诉他"我要做宫保鸡丁"，他就会自动给你准备好鸡肉、花生、辣椒和锅。

## 🎯 这是什么？

这是一个帮助代码组织得更整洁的系统。它能自动管理代码之间的依赖关系，让你专注于写业务逻辑，而不是操心"这个东西需要什么，那个东西怎么创建"。

## 🚀 快速上手（3分钟搞定）

```typescript
import { Container, ServiceKeys, configureServices } from '@/core/di';

// 1. 开设"餐厅"（创建容器）
const container = new Container();

// 2. 准备基础食材（注册核心组件）
container.registerInstance(ServiceKeys.Config, config); // 配置文件
container.registerInstance(ServiceKeys.Logger, logger); // 日志工具
container.registerInstance(ServiceKeys.Bot, bot); // Minecraft机器人

// 3. 配置菜单（告诉系统所有菜怎么做）
configureServices(container);

// 4. 点菜（获取你需要的组件）
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

就这么简单！现在agent已经准备好了可以使用了。

## 📚 核心概念（用生活例子解释）

### 🏷️ 服务标签（ServiceKeys）

就像餐厅里的菜单名，每道菜都有一个唯一的名字。

```typescript
// 这些就是菜单名
ServiceKeys.Logger; // "日志服务"
ServiceKeys.Bot; // "机器人服务"
ServiceKeys.Agent; // "AI代理服务"
```

为什么要用Symbol而不是字符串？因为Symbol就像身份证号，绝对不会重复，确保不会点错菜。

### 🕐 保存期限（生命周期）

就像食材的保质期，决定了这个东西能用多久。

- **单例（Singleton）**: 像盐和酱油，全餐厅只有一份，一直用到关门
- **瞬态（Transient）**: 像一次性筷子，每次用到就扔掉，下次用新的
- **作用域（Scoped）**: 在同一个订单内重复使用（还没实现）

## 🛠️ 怎么使用

### 注册菜谱（告诉系统怎么做菜）

```typescript
// 注册一个"日志服务"（单例）
container.registerSingleton(ServiceKeys.Logger, () => {
  return createLogger(); // 创建日志工具
});

// 注册一个"临时工具"（瞬态）
container.registerTransient(ServiceKeys.TempTool, () => {
  return new TempTool(); // 每次都要新的
});

// 直接使用已有的东西
container.registerInstance(ServiceKeys.Config, myConfig); // 我已经有配置了
```

### 点菜（获取你需要的服务）

```typescript
// 要日志工具
const logger = container.resolve<Logger>(ServiceKeys.Logger);

// 要AI代理（这个可能需要时间准备，所以用async）
const agent = await container.resolveAsync<Agent>(ServiceKeys.Agent);
```

### 特殊服务（有额外要求的菜）

```typescript
container
  .registerSingleton(ServiceKeys.Agent, c => {
    // 厨师长会自动准备好所有需要的食材
    const bot = c.resolve(ServiceKeys.Bot);
    const logger = c.resolve(ServiceKeys.Logger);
    return new Agent(bot, logger);
  })
  .withInitializer(ServiceKeys.Agent, async agent => {
    // 菜做好后的最后加工（比如热一下）
    await agent.initialize();
  })
  .withDisposer(ServiceKeys.Agent, agent => {
    // 餐厅关门时的清理工作
    agent.stop();
  });
```

## 🏪 系统架构

### 主要文件

- **`Container.ts`** - 厨师长（负责管理所有食材和菜品）
- **`ServiceKeys.ts`** - 菜单（定义所有菜名）
- **`bootstrap.ts`** - 菜单配置（告诉厨师长每道菜怎么做）
- **`index.ts`** - 前台收银（统一出口）

### 工作流程

```
1. 顾客点菜 → container.resolve()
2. 厨师长查菜单 → 找到ServiceKeys对应的菜谱
3. 检查厨房 → 是否已有现成的菜（单例检查）
4. 准备食材 → 自动resolve所有依赖
5. 按照菜谱做菜 → 执行工厂函数
6. 上菜 → 返回准备好的对象
```

## 💡 为什么需要这个系统？

### 问题场景

想象没有这个系统的代码：

```typescript
// 每个人都要自己准备食材，太乱了！
const logger = createLogger();
const cache = new BlockCache(logger);
const bot = createBot();
const agent = new Agent(bot, cache, logger);
await agent.initialize();
```

### 有了DI系统后

```typescript
// 只需要点菜，系统自动准备一切
configureServices(container);
const agent = await container.resolveAsync(ServiceKeys.Agent);
```

### 好处

- **清晰分工** - 你只管用，他只管准备
- **容易测试** - 可以轻松替换任何"食材"
- **自动管理** - 创建、初始化、清理都自动化
- **类型安全** - TypeScript确保你不会点错菜

## 🔧 给协作者的提示

1. **把这个系统想象成餐厅** - 你是顾客，Container是厨师长
2. **ServiceKeys就是菜单名** - 想要什么就点什么
3. **工厂函数就是菜谱** - 告诉系统怎么准备这个服务
4. **resolve就是点菜** - 系统会自动准备好一切

如果你是Spring Boot用户，这个系统就像@Configuration类，工厂函数就像@Bean方法！

📖 **详细文档**: [依赖注入系统详解](../../docs/dependency-injection.md)
