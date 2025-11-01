# 🚀 maicraft-next 快速启动指南

> 从零到运行只需 3 步！

---

## ⚡ 快速开始

### 步骤 1: 安装依赖

```bash
npm install
# 或
pnpm install
```

### 步骤 2: 配置服务器连接

编辑 `config.toml` 文件，设置 Minecraft 服务器连接信息：

```toml
[minecraft]
host = "localhost"        # 服务器地址
port = 25565              # 服务器端口
username = "maicraft_bot" # Bot 用户名
```

### 步骤 3: 启动 Minecraft 服务器

确保你有一个运行中的 Minecraft 服务器（版本 1.16-1.20）

### 步骤 4: 启动测试 Bot

```bash
npm run test-bot
```

**就这么简单！** 🎉

---

## 🎮 使用游戏内命令

Bot 启动后，在 Minecraft 游戏中使用以下命令：

```
!help                      # 查看所有命令
!status                    # 查看 Bot 状态
!move 100 64 200          # 移动到坐标
!find iron_ore            # 寻找方块
!mine stone 10            # 挖掘 10 个石头
!craft stick 4            # 合成 4 个木棍
```

---

## 📝 配置说明

Bot 会自动从 `config.toml` 读取配置。你已经在步骤 2 中配置过了。

如果 `config.toml` 加载失败，Bot 会回退到使用环境变量或默认值：
- 默认地址: `localhost:25565`
- 默认用户名: `maicraft_test_bot`

---

## 📚 更多信息

- **详细测试指南**: [TEST_GUIDE.md](docs/TEST_GUIDE.md)
- **实施状态**: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- **核心架构**: [docs/design/core-architecture.md](docs/design/core-architecture.md)

---

## ❓ 遇到问题？

### Bot 无法连接？

1. 检查 Minecraft 服务器是否运行
2. 确认服务器地址和端口
3. 查看控制台错误信息

### 命令无响应？

1. 确认命令以 `!` 开头
2. 检查命令拼写是否正确
3. 查看控制台日志

### 动作执行失败？

1. 查看控制台的详细错误信息
2. 确认 Bot 有足够的权限
3. 检查是否缺少必要的插件

---

## 🎉 开始探索！

现在你可以：

1. ✅ 测试所有 7 个核心动作
2. ✅ 观察 GameState 实时更新
3. ✅ 体验类型安全的动作调用
4. ✅ 查看详细的日志输出

**祝你玩得开心！** 🎮

---

*快速启动指南 v1.0*

