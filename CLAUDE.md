# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

### 开发和构建
- `pnpm dev` - 开发模式运行 (推荐)
- `pnpm build` - 编译 TypeScript 到 dist/
- `pnpm start` - 运行编译后的程序
- `pnpm check` - 检查配置是否正确

### 测试
- `pnpm test` - 运行所有测试
- `pnpm test:watch` - 监听模式运行测试
- `pnpm test:coverage` - 生成覆盖率报告
- `pnpm test-bot` - 运行测试机器人 (无 AI 功能)

### 代码质量
- `pnpm lint` - ESLint 检查
- `pnpm lint:fix` - 自动修复 ESLint 问题
- `pnpm format` - Prettier 格式化代码
- `pnpm format:check` - 检查代码格式

### 配置管理
- `cp config-template.toml config.toml` - 创建配置文件
- 配置文件路径: `config.toml`
- 数据目录: `./data`
- 日志目录: `./logs`

## 项目架构

### 核心概念
这是一个基于 mineflayer 的 Minecraft AI 代理，使用 LLM 驱动决策。与原 Python 版本不同，这个 TypeScript 版本采用单体架构，去除了 MCP 协议的开销。

### 主要目录结构
- `src/core/` - 核心系统
  - `actions/` - 动作系统 (15个核心动作)
  - `agent/` - AI 代理系统
    - `memory/` - 四种记忆类型 (Thought/Conversation/Decision/Experience)
    - `planning/` - Goal-Plan-Task 层次化规划
    - `mode/` - 模式管理 (Main/Combat/GUI)
    - `loop/` - 决策循环 (MainDecisionLoop/ChatLoop)
    - `prompt/` - 提示词模板和管理
  - `state/` - GameState 实时游戏状态
  - `cache/` - BlockCache/ContainerCache/LocationManager
  - `events/` - 统一事件系统
- `src/llm/` - LLM 集成 (OpenAI/Anthropic/Azure)
- `src/utils/` - 工具类和配置

### 关键设计原则
1. **状态全局可访问** - 通过 GameState 直接访问，无需查询动作
2. **类型安全的动作调用** - 使用 ActionIds 常量，编译时检查
3. **统一事件系统** - 保持 mineflayer 原始事件名
4. **分层记忆系统** - 四种专门记忆类型，支持查询和持久化
5. **层次化规划** - Goal-Plan-Task 结构，支持进度追踪

### 重要的架构文件
- `src/core/index.ts` - 核心模块导出
- `src/core/README.md` - 核心模块详细说明
- `src/main.ts` - 主入口文件
- `src/test-bot.ts` - 测试机器人入口

## 开发指南

### 添加新动作
1. 在 `src/core/actions/implementations/` 创建动作类
2. 继承 `Action` 基类，实现 `execute` 方法
3. 在 `src/core/actions/ActionIds.ts` 添加动作 ID
4. 在 `src/core/actions/implementations/index.ts` 导出动作

### 测试新功能
- 单元测试放在 `src/**/__tests__/` 目录
- 使用 Jest 框架，配置文件: `jest.config.js`
- 测试文件命名: `*.test.ts` 或 `*.spec.ts`

### 配置管理
- 使用 TOML 格式配置文件
- 配置类在 `src/utils/Config.ts`
- 支持热重载配置

### LLM 集成
- 支持多提供商 (OpenAI/Anthropic/Azure)
- 提示词模板在 `src/core/agent/prompt/templates/`
- 用量统计和限制功能

## 重要提醒

### 开发环境
- 需要 Node.js >= 18.0.0
- 推荐使用 pnpm 作为包管理器
- TypeScript 编译目标: ES6

### 调试技巧
- 使用 `pnpm dev` 进行开发，支持热重载
- 日志文件保存在 `./logs` 目录
- 可以通过 `config.toml` 调整日志级别

### 常见问题
- 配置文件必须从 `config-template.toml` 复制而来
- Minecraft 服务器连接配置在 `[minecraft]` 部分
- LLM API 密钥需要在 `[llm.openai]` 或对应提供商部分配置