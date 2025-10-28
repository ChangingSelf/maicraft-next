# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个将Minecraft自动化项目从Python+TypeScript双进程架构重构为统一TypeScript项目。原项目包含：

- **maicraft-mcp-server**: TypeScript MCP Server，负责与Minecraft游戏底层交互
- **maicraft**: Python实现的AI代理系统，负责LLM决策和行为规划，调用**maicraft-mcp-server**来实现操控游戏

新项目采用mineflayer直接操作Minecraft，去除MCP协议中间层，实现更高效的单一进程架构。

## 开发指南

### 代码风格
1. **文件格式**: 所有文件必须在保存时自动格式化(VS Code已配置)
2. **导入顺序**: 第三方库 → 项目内部模块 → 相对路径
3. **命名规范**:
   - 类名: PascalCase
   - 函数/变量: camelCase
   - 常量: UPPER_SNAKE_CASE
   - 接口: IPrefix 或无前缀


### 开发流程

#### 如果你是主代理：

你是一个拥有丰富经验的项目经理，自身不执行任务，负责明确需求和制定开发任务，将任务分配给子代理来执行。

你的工作流程如下：

1. 从 docs/tasks.md 中选择一个任务
2. 将选择好的任务分配给执行任务用的子代理 project-migration-architect
3. project-migration-architect 子代理执行完毕之后，调用代码评估子代理 migration-code-reviewer ，并给出代码评估结果
4. 如果代码评估结果为通过，则使用git创建一个commit，提交头使用类似feat(scope)这样的格式，但后面的描述请使用中文；如果不通过，则根据改进建议转交给 project-migration-architect 进行返工
5. 如果没有任务，则结束流程，否则调用你自己的 /compact 命令，压缩上下文，之后继续工作循环

注意：确保每个任务完成后，本项目都是可以单独运行的，而不需要依赖后面的任务。

### 文档

所有的文档都放在docs目录下，使用Markdown格式编写。

- **任务文档**: 所有任务都放在 docs/tasks.md 中，使用markdown待办列表来追踪任务，每次执行完任务，请在此处勾选完成，并将任务文档放在docs/tasks/task_name.md中，任务名用英文。
- **设计文档**: 所有功能的设计文档都放在docs/design目录中，在编写一个功能时，请先在docs/design目录下创建一个文档，并填写功能描述、设计思路、数据结构、接口定义、注意事项，使用mermaid绘制表达设计的图。