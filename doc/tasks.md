# 基础设施

- [ ] 日志模块。位于src/utils/Logger.ts, 需要使用结构化日志，需要支持jsonl格式输出到logs目录下。
- [ ] 配置模块。位于src/utils/Config.ts, 使用config-template.toml存储配置模板，config.toml为用户配置，读取配置时如果没有config.toml，则复制config-template.toml生成config.toml。
- [ ] LLM调用及用量统计模块。支持多种LLM服务提供商（OpenAI、Claude等），实现用量统计功能（token计数、请求次数、费用计算），支持重试机制和错误处理，与现有配置系统和日志系统集成，提供类型安全的接口。详见 [docs/tasks/llm-module-implementation.md](../docs/tasks/llm-module-implementation.md)。
- [x] 提示词管理模块。详见 [docs/tasks/prompt-management-system-implementation.md](../docs/tasks/prompt-management-system-implementation.md)。