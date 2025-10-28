# 基础设施

- [ ] 日志系统。位于src/utils/Logger.ts, 需要使用结构化日志，需要支持jsonl格式输出到logs目录下。
- [ ] 配置系统。位于src/utils/Config.ts, 使用config-template.toml存储配置模板，config.toml为用户配置，读取配置时如果没有config.toml，则复制config-template.toml生成config.toml。
- [ ] 