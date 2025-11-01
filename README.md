# Maicraft-Next

基于 mineflayer 的 Minecraft AI 代理 - 使用 LLM 驱动的智能游戏 Bot

是对[maicraft](https://github.com/Mai-with-u/Maicraft)项目的Typescript重构，不再需要依赖[maicraft-mcp-server](https://github.com/ChangingSelf/maicraft-mcp-server)

## ✨ 特性

### 🧠 智能决策系统

- **LLM 驱动**：使用 GPT-4/GPT-3.5/Claude 等先进模型进行决策
- **多模式管理**：主模式、战斗模式等，根据情境自动切换
- **实时状态感知**：无需查询动作，直接访问全局游戏状态

### 💾 先进记忆系统

- **四种记忆类型**：
  - 思维记忆 (ThoughtMemory) - AI 的内部思考过程
  - 对话记忆 (ConversationMemory) - 聊天互动历史
  - 决策记忆 (DecisionMemory) - 行动决策及结果
  - 经验记忆 (ExperienceMemory) - 学习到的经验教训
- **自动持久化**：记忆自动保存，重启后保留
- **智能清理**：自动管理记忆容量，保持最优性能

### 🎯 目标规划系统

- **层次化结构**：目标 (Goal) → 计划 (Plan) → 任务 (Task)
- **编程式追踪**：使用 TaskTracker 自动检测任务完成度
- **灵活组合**：支持任务依赖、子任务、复合追踪器
- **实时进度**：自动计算并更新任务进度百分比

### 🎮 核心功能

- **15+ 种动作**：移动、挖掘、建造、合成、战斗等
- **类型安全**：完整的 TypeScript 类型系统
- **事件驱动**：统一的事件管理系统
- **插件支持**：集成 Pathfinder、PvP、装备管理等插件
- **自动重连**：网络断开后自动重连

### 🔧 开发友好

- **模块化设计**：高内聚、低耦合的架构
- **完整文档**：详细的设计文档和 API 说明
- **单元测试**：核心模块测试覆盖
- **热重载配置**：配置变更无需重启

## 🚀 快速开始

### 前置要求

- Node.js >= 18.0.0
- 一个 Minecraft 服务器（1.16+ 推荐）
- OpenAI API Key（或其他 LLM 服务）

### 安装

```bash
# 克隆仓库
git clone https://github.com/ChangingSelf/maicraft-next.git
cd maicraft-next

# 安装依赖（推荐使用 pnpm）
pnpm install
# 或
npm install
```

### 配置

```bash
# 复制配置模板
cp config-template.toml config.toml

# 编辑配置文件
# 必须配置：
#   - minecraft.host 和 minecraft.port
#   - minecraft.username
#   - llm.openai.api_key
```

**最小配置示例：**

```toml
[minecraft]
host = "localhost"
port = 25565
username = "MaicraftBot"

[llm.openai]
enabled = true
api_key = "sk-..."  # 你的 OpenAI API Key
model = "gpt-4"
```

### 检查配置

运行预检查脚本，确保配置正确：

```bash
pnpm check
```

### 运行

```bash
# 开发模式（推荐）
pnpm dev

# 或生产模式
pnpm build
pnpm start
```

成功启动后，Bot 将连接到服务器并开始自主运行！

## 📖 文档

- **[启动指南](STARTUP_GUIDE.md)** - 详细的安装和配置说明
- **[快速入门](QUICK_START.md)** - 5分钟快速体验
- **[架构设计](docs/design/)** - 系统架构和设计文档
- **[开发指南](docs/TEST_GUIDE.md)** - 测试和开发说明

### 核心文档

- [核心架构设计](docs/design/core-architecture.md)
- [代理架构 v2.0](docs/design/agent-architecture-v2.md)
- [记忆和任务系统](docs/design/memory-and-task-system.md)
- [目标规划系统](docs/design/goal-planning-system.md)

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────┐
│                    Agent                        │
│  (主协调器 - 管理所有子系统)                      │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
┌───────────────┐    ┌──────────────────┐
│ Memory System │    │ Planning System  │
│ - Thought     │    │ - Goals          │
│ - Conversation│    │ - Plans          │
│ - Decision    │    │ - Tasks          │
│ - Experience  │    │ - Trackers       │
└───────────────┘    └──────────────────┘
        │                    │
        └─────────┬──────────┘
                  ▼
        ┌──────────────────┐
        │   Mode Manager   │
        │ - Main Mode      │
        │ - Combat Mode    │
        │ - GUI Mode       │
        └─────────┬────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
┌──────────────┐    ┌───────────────┐
│ Decision Loop│    │   Chat Loop   │
│ (主决策循环)  │    │  (聊天循环)    │
└──────┬───────┘    └───────────────┘
       │
       ▼
┌──────────────────────────────────┐
│       ActionExecutor             │
│  (执行动作 - 连接到 Mineflayer)   │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│         GameState                │
│    (实时游戏状态)                 │
└──────────────────────────────────┘
```

## 🎯 核心概念

### GameState - 实时游戏状态

无需查询动作，所有状态实时可访问：

```typescript
// 直接访问当前状态
const pos = gameState.blockPosition;
const health = gameState.health;
const inventory = gameState.inventory;
```

### Action - 统一动作系统

所有动作平等，类型安全：

```typescript
await executor.execute('move', { x: 100, y: 64, z: 200 });
await executor.execute('mine_block', { name: 'oak_log', count: 10 });
await executor.execute('craft', { item: 'wooden_pickaxe', count: 1 });
```

### Memory - 分层记忆

四种专门的记忆类型，支持查询和持久化：

```typescript
// 记录思维
await memory.thought.record({
  category: 'planning',
  content: '我需要先收集木头',
  context: { goal: 'build_house' },
});

// 查询相关记忆
const decisions = await memory.decision.query({
  filters: { action: 'mine_block' },
  limit: 10,
});
```

### Goal-Plan-Task - 目标规划

层次化的任务管理：

```typescript
// 创建目标
const goal = await planning.createGoal({
  name: '建造房子',
  description: '在当前位置建造一个木质房子',
  priority: 'high',
});

// 为目标添加计划
const plan = await planning.createPlan(goal.id, {
  name: '收集材料计划',
  tasks: [
    {
      name: '收集64个橡木',
      tracker: { type: 'inventory', item: 'oak_log', count: 64 },
    },
    {
      name: '制作木板',
      tracker: { type: 'inventory', item: 'oak_planks', count: 256 },
    },
  ],
});
```

## 🛠️ 可用动作

| 动作                     | 说明         | 参数                             |
| ------------------------ | ------------ | -------------------------------- |
| `chat`                   | 发送聊天消息 | `message: string`                |
| `move`                   | 移动到坐标   | `x, y, z: number`                |
| `find_block`             | 搜索方块     | `block: string, radius?: number` |
| `mine_block`             | 挖掘方块     | `name: string, count?: number`   |
| `mine_block_by_position` | 挖掘指定位置 | `x, y, z: number`                |
| `place_block`            | 放置方块     | `name: string, x, y, z: number`  |
| `craft`                  | 合成物品     | `item: string, count?: number`   |

更多动作持续开发中...

## 🔌 支持的 LLM 提供商

- ✅ **OpenAI** (GPT-4, GPT-3.5-Turbo)
- 🚧 **Azure OpenAI**
- 🚧 **Anthropic Claude**

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# 运行测试 Bot（无 AI）
pnpm test-bot
```

## 📊 实现状态

查看 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) 了解当前开发进度。

核心系统：

- ✅ GameState
- ✅ ActionExecutor
- ✅ EventEmitter
- ✅ Agent 架构
- ✅ Memory 系统
- ✅ Goal-Planning 系统
- ✅ Mode 管理
- ✅ LLM 集成

正在开发：

- 🚧 更多动作实现
- 🚧 Web 管理界面
- 🚧 多 Agent 协作

## 🤝 贡献

欢迎贡献！请查看我们的贡献指南（即将推出）。

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

本项目基于以下优秀的开源项目：

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) - Minecraft Bot 框架
- [OpenAI](https://openai.com/) - LLM 服务
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript

## 📮 联系方式

- GitHub: [@ChangingSelf](https://github.com/ChangingSelf)
- Issues: [提交问题](https://github.com/ChangingSelf/maicraft-next/issues)

---

⭐ 如果这个项目对你有帮助，请给我们一个 Star！
