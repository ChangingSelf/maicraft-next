# 配置系统使用指南

本文档介绍如何使用 Maicraft Next 项目的配置系统。

## 概述

配置系统提供了完整的TOML格式配置文件支持，包括：
- 配置模板和用户配置的分离
- 配置验证和类型安全
- 配置热重载功能
- 与日志系统的深度集成

## 快速开始

### 1. 基本使用

```typescript
import { initializeConfig, getConfig, getSection } from '../utils/Config';
import { createConfiguredLogger } from '../utils/ConfiguredLogger';

// 初始化配置系统
const config = await initializeConfig();

// 获取完整配置
const fullConfig = getConfig();
console.log('应用名称:', fullConfig.app.name);

// 获取特定配置段
const minecraftConfig = getSection('minecraft');
console.log('服务器地址:', minecraftConfig.host);

// 创建配置化的日志器
const logger = createConfiguredLogger('MyModule');
logger.info('这是配置化的日志消息');
```

### 2. 更新配置

```typescript
import { updateConfig, DeepPartial } from '../utils/Config';

// 更新配置
await updateConfig({
  app: {
    debug: true
  },
  logging: {
    level: 'debug'
  }
} as DeepPartial<AppConfig>);
```

### 3. 监听配置变化

```typescript
import { ConfigManager } from '../utils/Config';

const manager = new ConfigManager();

// 监听配置变化
manager.on('configChanged', (newConfig) => {
  console.log('配置已更新:', newConfig.app.debug);
});

// 监听配置重新加载
manager.on('configReloaded', (newConfig) => {
  console.log('配置已重新加载');
});

await manager.loadConfig();
```

## 配置文件结构

### 配置模板 (config-template.toml)

配置模板定义了所有可用的配置项和默认值：

```toml
[app]
name = "maicraft-next"
version = "0.1.0"
debug = false
data_dir = "./data"

[logging]
level = "info"  # error, warn, info, debug
console = true
file = true
max_file_size = 10485760  # 10MB
max_files = 5
log_dir = "./logs"

[minecraft]
host = "localhost"
port = 25565
username = "MaicraftBot"
password = ""
auth = "offline"  # offline, mojang, microsoft
# ... 更多配置
```

### 用户配置 (config.toml)

用户配置会覆盖模板中的相应值：

```toml
[app]
debug = true  # 启用调试模式

[minecraft]
host = "my-server.example.com"
port = 25566
username = "MyBot"
```

## 配置项说明

### 应用配置 (app)

- `name`: 应用名称
- `version`: 应用版本
- `debug`: 调试模式开关
- `data_dir`: 数据存储目录

### 日志配置 (logging)

- `level`: 日志级别 (error/warn/info/debug)
- `console`: 是否输出到控制台
- `file`: 是否输出到文件
- `max_file_size`: 最大文件大小（字节）
- `max_files`: 最大文件数量
- `log_dir`: 日志文件目录

### Minecraft配置 (minecraft)

- `host`: 服务器地址
- `port`: 服务器端口
- `username`: 用户名
- `password`: 密码（在线模式）
- `auth`: 认证方式 (offline/mojang/microsoft)
- `reconnect`: 是否自动重连
- `reconnect_delay`: 重连延迟（毫秒）
- `max_reconnect_attempts`: 最大重连次数

### AI代理配置 (agent)

- `model_name`: AI模型名称
- `max_tokens`: 最大令牌数
- `temperature`: 温度参数 [0-2]
- `decision_timeout`: 决策超时时间（毫秒）
- `safe_mode`: 安全模式开关

### 插件配置 (plugins)

- `enabled`: 启用的插件列表
- 各种插件的具体配置项

### 高级配置 (advanced)

- `hot_reload`: 热重载开关
- `config_backup`: 配置备份开关
- `backup_count`: 备份文件数量
- `tick_rate`: 游戏刻率
- `max_concurrent_tasks`: 最大并发任务数

## 错误处理

配置系统具有健壮的错误处理机制：

1. **模板文件不存在**: 抛出 `ConfigError`
2. **配置文件格式错误**: 使用默认配置并记录警告
3. **配置值验证失败**: 使用默认值并记录错误
4. **文件权限错误**: 记录错误并使用内存配置

## 最佳实践

### 1. 配置管理

```typescript
// 使用专用的配置管理器实例
const configManager = new ConfigManager('./my-config.toml', './my-template.toml');

// 确保在应用退出时关闭配置管理器
process.on('SIGINT', () => {
  configManager.close();
  process.exit(0);
});
```

### 2. 模块化配置

```typescript
// 为不同模块创建专用的日志器
const botLogger = createConfiguredLogger('Bot');
const pluginLogger = createConfiguredLogger('PluginManager');
const networkLogger = createConfiguredLogger('Network');
```

### 3. 配置验证

```typescript
// 在配置更新后进行验证
try {
  await updateConfig(updates);
  logger.info('配置更新成功');
} catch (error) {
  logger.error('配置更新失败', { error: error.message });
}
```

### 4. 热重载

```typescript
// 启用热重载功能
const config = await initializeConfig();
if (config.advanced.hot_reload) {
  logger.info('配置热重载已启用');
}
```

## 故障排除

### 常见问题

1. **配置文件不生效**
   - 检查文件路径是否正确
   - 确认TOML格式是否正确
   - 查看日志中的错误信息

2. **热重载不工作**
   - 确认 `advanced.hot_reload = true`
   - 检查文件权限
   - 查看是否有文件监听错误

3. **配置验证失败**
   - 检查配置值的数据类型
   - 确认数值范围是否正确
   - 查看详细的验证错误信息

### 调试技巧

```typescript
// 启用调试模式查看详细日志
await updateConfig({
  app: { debug: true },
  logging: { level: 'debug' }
});

// 查看当前配置
console.log('当前配置:', JSON.stringify(getConfig(), null, 2));
```

## 示例

完整的使用示例请参考 `src/examples/config-example.ts` 文件。