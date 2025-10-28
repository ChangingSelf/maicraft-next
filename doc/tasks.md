# 基础设施

- [ ] 日志模块。位于src/utils/Logger.ts, 需要使用结构化日志，需要支持jsonl格式输出到logs目录下。
- [ ] 配置模块。位于src/utils/Config.ts, 使用config-template.toml存储配置模板，config.toml为用户配置，读取配置时如果没有config.toml，则复制config-template.toml生成config.toml。
- [ ] LLM调用及用量统计模块。
- [ ] 提示词管理模块。