# maicraft-next 测试指南

> Phase 1 + Phase 2 完整测试说明

---

## 🎯 测试准备

### 1. 安装依赖

确保所有依赖已安装：

```bash
npm install
# 或
pnpm install
```

### 2. 启动 Minecraft 服务器

你需要一个 Minecraft 服务器（版本 1.16-1.20）：

- 本地服务器：`localhost:25565`
- 或使用现有服务器

### 3. 配置连接（可选）

通过环境变量配置连接：

```bash
export MC_HOST=localhost        # 服务器地址
export MC_PORT=25565             # 服务器端口
export MC_USERNAME=maicraft_bot  # Bot 用户名
export MC_VERSION=1.20.1         # Minecraft 版本（可选，默认自动检测）
```

---

## 🚀 启动测试 Bot

### 方式 1: 使用 npm script

```bash
npm run test-bot
# 或
pnpm test-bot
```

### 方式 2: 直接运行

```bash
tsx src/test-bot.ts
# 或
node dist/test-bot.js  # 需要先 build
```

---

## 📝 可用命令

测试 Bot 启动后，在游戏中可以使用以下命令（以 `!` 开头）：

### 基础命令

```
!help                          # 显示帮助信息
!status                        # 显示 Bot 状态（生命、饥饿、等级）
!pos                           # 显示当前位置
!actions                       # 显示所有已注册的动作
```

### 动作命令

```
!move <x> <y> <z>             # 移动到指定坐标
  示例: !move 100 64 200

!find <block> [radius]        # 寻找方块
  示例: !find iron_ore
  示例: !find diamond_ore 32

!mine <block> [count]         # 挖掘方块
  示例: !mine stone 10
  示例: !mine iron_ore 5

!craft <item> [count]         # 合成物品
  示例: !craft stick
  示例: !craft wooden_pickaxe 2
```

---

## 🧪 测试场景

### 场景 1: 基础功能测试

1. **启动 Bot**
   ```bash
   npm run test-bot
   ```

2. **等待连接**
   - 观察控制台输出
   - 确认 "Bot 已登录并重生"

3. **测试聊天**
   - 在游戏中发送: `!help`
   - 确认 Bot 回复帮助信息

4. **测试状态查询**
   - 发送: `!status`
   - 确认显示生命值、饥饿值、等级

5. **测试位置查询**
   - 发送: `!pos`
   - 确认显示当前坐标

---

### 场景 2: 移动测试

```
# 1. 查看当前位置
!pos

# 2. 移动到附近位置（相对于当前位置 +10 格）
!move <current_x + 10> <current_y> <current_z>

# 3. 等待移动完成
# 观察控制台输出和游戏内 Bot 的移动

# 4. 确认到达
!pos
```

**预期结果:**
- ✅ Bot 开始寻路
- ✅ Bot 移动到目标位置
- ✅ 控制台显示 "动作完成: MoveAction"

---

### 场景 3: 寻找方块测试

```
# 1. 寻找附近的泥土
!find dirt

# 2. 寻找铁矿石（如果附近有）
!find iron_ore
```

**预期结果:**
- ✅ Bot 回复找到的方块数量
- ✅ 控制台显示方块位置

---

### 场景 4: 挖掘方块测试

```
# 1. 挖掘 1 个泥土
!mine dirt 1

# 2. 挖掘 5 个石头
!mine stone 5
```

**预期结果:**
- ✅ Bot 开始移动到方块位置
- ✅ Bot 开始挖掘
- ✅ 挖掘完成后物品进入物品栏
- ✅ 控制台显示 "成功挖掘 X 个 Y"

---

### 场景 5: 合成测试

```
# 1. 确保物品栏有木头
!status  # 查看当前状态

# 2. 合成木棍
!craft stick 4

# 3. 合成木镐（需要木棍和木板）
!craft wooden_pickaxe 1
```

**预期结果:**
- ✅ 如果有足够材料，合成成功
- ✅ 控制台显示 "成功合成 X"
- ✅ 物品栏中出现合成的物品

---

## 🔍 调试信息

### 控制台输出说明

```
[INFO] 🚀 maicraft-next 测试 Bot 启动      # Bot 启动
[INFO] 连接到服务器: localhost:25565       # 连接服务器
[INFO] ✅ Bot 已登录并重生                 # 登录成功
[INFO] ✅ GameState 初始化完成             # 核心系统初始化
[INFO] ✅ 已注册 7 个动作                  # 动作注册
[INFO] 收到命令: move from Player         # 收到玩家命令
[MoveAction] 开始移动: 从 (...) 到 (...)  # 动作执行
[INFO] ✅ 动作完成: MoveAction (1234ms)   # 动作完成
```

### 常见错误

1. **"pathfinder 插件未加载"**
   - 原因: 缺少 mineflayer-pathfinder 插件
   - 解决: Bot 会自动尝试加载，如果仍然失败需要手动安装

2. **"collectBlock 插件未加载"**
   - 原因: 缺少 mineflayer-collectblock 插件
   - 解决: 挖掘功能会降级到基本 dig 方法

3. **"找不到工作台"**
   - 原因: 合成 3x3 配方需要工作台
   - 解决: 在附近放置工作台或移动到工作台附近

4. **"移动超时"**
   - 原因: 目标位置太远或路径被阻挡
   - 解决: 选择更近的目标或清除障碍

---

## 📊 测试检查清单

### Phase 1: 核心系统

- [ ] Bot 成功连接并登录
- [ ] GameState 正确初始化
- [ ] 实时状态更新（生命、饥饿、位置）
- [ ] EventEmitter 正常工作
- [ ] ActionExecutor 正确注册动作
- [ ] 缓存管理器创建成功

### Phase 2: P0 动作

- [ ] ChatAction - Bot 能发送聊天消息
- [ ] MoveAction - Bot 能移动到指定坐标
- [ ] FindBlockAction - Bot 能找到指定方块
- [ ] MineBlockAction - Bot 能挖掘方块
- [ ] MineBlockByPositionAction - Bot 能挖掘指定位置
- [ ] PlaceBlockAction - Bot 能放置方块
- [ ] CraftItemAction - Bot 能合成物品

### 集成测试

- [ ] 连续执行多个动作
- [ ] 中断机制（Bot 受伤时中断动作）
- [ ] 错误处理（动作失败时的恢复）
- [ ] 性能测试（动作执行时间合理）

---

## 🐛 报告问题

如果遇到问题，请提供以下信息：

1. **环境信息**
   - Minecraft 版本
   - Node.js 版本
   - 操作系统

2. **错误日志**
   - 完整的控制台输出
   - 错误堆栈信息

3. **复现步骤**
   - 执行的命令
   - 预期结果 vs 实际结果

---

## 📈 性能参考

正常情况下的性能指标：

| 动作 | 平均耗时 | 说明 |
|------|----------|------|
| ChatAction | < 50ms | 发送消息 |
| MoveAction | 1-10s | 取决于距离 |
| FindBlockAction | < 500ms | 搜索半径 16 |
| MineBlockAction | 2-5s/块 | 取决于方块类型 |
| CraftItemAction | 1-3s | 取决于是否需要移动 |

---

## 🎉 测试成功标志

如果看到以下情况，说明测试成功：

✅ Bot 稳定运行无崩溃  
✅ 所有命令都能正确响应  
✅ 动作执行成功率 > 90%  
✅ 无内存泄漏（长时间运行稳定）  
✅ 日志输出清晰易读  

---

*测试指南版本: 1.0*  
*最后更新: 2025-11-01*

