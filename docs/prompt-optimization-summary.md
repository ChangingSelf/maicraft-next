# 提示词系统优化总结

## 优化目标

1. **提升 LLM 缓存效率**：将不变的内容放在提示词前面
2. **简化代码维护**：利用嵌套模板自动引用，减少手动拼接
3. **模块化设计**：将提示词按功能和变化频率分层

## 实现方案

### 1. 嵌套模板引用系统

实现了自动嵌套模板引用功能，支持：

- 在模板中使用 `{template_name}` 自动引用其他模板
- 递归嵌套支持（模板可以引用模板）
- 循环引用检测和防护
- 参数自动传递和提取

**详见：** `docs/nested-template-feature.md`

### 2. 提示词结构重组

#### 原始结构（未优化）

```
{basic_info}（动态，频繁变化）
- 角色描述（静态）
- 目标和任务（动态）
- 当前状态（动态）
- ...

{规划系统说明}（静态）
{行为准则}（静态）
{游戏指南}（静态）
{动作分析}（静态）
{available_actions}（半静态）
{eat_action}（动态）
{kill_mob_action}（动态）
{failed_hint}（动态）
{judge_guidance}（动态）
{thinking_list}（动态）
```

**问题**：动态内容在提示词开头，每次都变化，无法有效利用 LLM 缓存。

#### 优化后结构

```
{role_description}（静态）✅ 可缓存
- 角色描述
- 任务系统说明

{规划系统说明}（静态）✅ 可缓存
{行为准则}（静态）✅ 可缓存
{游戏指南}（静态）✅ 可缓存
{动作分析}（静态）✅ 可缓存
{available_actions}（半静态）✅ 部分可缓存
{eat_action}（动态）
{kill_mob_action}（动态）

---

{basic_info}（动态）❌ 每次变化
- 目标和任务
- 当前状态
- 位置信息
- 周围环境
- ...

{failed_hint}（动态）
{judge_guidance}（动态）
{thinking_list}（动态）
```

**优势**：

- 静态内容集中在前面，约占提示词的 60-70%
- LLM 可以缓存静态部分，只处理动态部分
- 提升响应速度，降低 token 消耗

### 3. 模板拆分

#### basic_info 模板拆分

**拆分前**：

```typescript
basic_info = `
你是{bot_name}，游戏名叫{player_name}...（静态）
当前目标和任务...（动态）
当前状态...（动态）
物品栏...（动态）
位置信息...（动态）
周围环境...（动态）
`;
```

**拆分后**：

```typescript
// 静态部分 - role_description
role_description = `
你是{bot_name}，游戏名叫{player_name}...
任务系统说明...
`;

// 动态部分 - basic_info
basic_info = `
当前目标和任务：{goal}
{to_do_list}
当前状态：{self_status_info}
物品栏：{inventory_info}
位置信息：{position}
周围环境：{nearby_block_info}
...
`;
```

### 4. 代码简化

#### PromptDataCollector 简化

**之前**：

```typescript
collectAllData(): MainThinkingData {
  const basicInfo = this.collectBasicInfo();

  // 手动生成嵌套模板
  const roleDescription = promptManager.generatePrompt('role_description', {
    bot_name: basicInfo.bot_name,
    player_name: basicInfo.player_name,
  });

  const basicInfoPrompt = promptManager.generatePrompt('basic_info', basicInfo);

  return {
    role_description: roleDescription,
    basic_info: basicInfoPrompt,
    // ...
  };
}
```

**现在**：

```typescript
collectAllData(): MainThinkingData {
  const basicInfo = this.collectBasicInfo();

  // 嵌套模板自动生成，只需提供基础参数
  return {
    role_description: '', // 自动生成
    basic_info: '',       // 自动生成
    bot_name: basicInfo.bot_name,
    player_name: basicInfo.player_name,
    goal: basicInfo.goal,
    to_do_list: basicInfo.to_do_list,
    // ...其他参数
  };
}
```

**代码行数减少**：从 ~20 行减少到 ~15 行  
**可维护性提升**：模板依赖关系自动处理，无需手动管理

## 优化效果

### 1. 缓存效率

| 提示词部分         | 变化频率            | 字符数（估算） | 是否可缓存 |
| ------------------ | ------------------- | -------------- | ---------- |
| role_description   | 从不变              | ~200           | ✅         |
| 规划/行为/游戏指南 | 从不变              | ~800           | ✅         |
| available_actions  | 偶尔变（饥饿/战斗） | ~1500          | ✅ 部分    |
| basic_info         | 每次变              | ~1000          | ❌         |
| thinking_list      | 每次变              | ~500           | ❌         |

**优化前**：~0% 可缓存（动态内容在开头）  
**优化后**：~65% 可缓存（约 2500/4000 字符）

### 2. 性能提升（预估）

- **首次调用**：性能相同
- **后续调用**：
  - Token 处理量减少 ~65%
  - 响应延迟降低 ~40-50%
  - API 成本降低 ~30-40%（取决于提供商的缓存策略）

### 3. 代码质量

- **模块化**：提示词按功能拆分，易于维护
- **复用性**：`role_description` 可用于其他模式（聊天、评估等）
- **可读性**：嵌套关系清晰，代码意图明确

## 技术细节

### 提示词生成流程

```
1. 收集基础数据 (collectBasicInfo)
   ├─ bot_name, player_name
   ├─ goal, to_do_list
   ├─ position, health, food
   └─ nearby_block_info, inventory_info

2. 收集动态动作 (collectDynamicActions)
   ├─ eat_action（饥饿时）
   └─ kill_mob_action（有敌对生物时）

3. 收集记忆数据 (collectMemoryData)
   ├─ failed_hint
   └─ thinking_list

4. 组装为 MainThinkingData
   ├─ 嵌套模板字段（空字符串占位）
   └─ 基础参数（供嵌套模板使用）

5. 生成 main_thinking 提示词
   ├─ 遇到 {role_description}
   │  └─ 自动生成：promptManager.generatePrompt('role_description', params)
   ├─ 遇到 {basic_info}
   │  └─ 自动生成：promptManager.generatePrompt('basic_info', params)
   └─ 其他占位符：直接使用参数值
```

### 循环引用防护

```typescript
visitedTemplates: Set<string> = new Set();

function generatePrompt(templateName, params, visited) {
  if (visited.has(templateName)) {
    throw Error('检测到循环引用');
  }

  visited.add(templateName);
  // ... 递归生成子模板 ...
}
```

## 相关文件

| 文件                      | 修改内容                                 |
| ------------------------- | ---------------------------------------- |
| `prompt_manager.ts`       | 实现嵌套模板引用功能                     |
| `basic_info.ts`           | 拆分为 `role_description` + `basic_info` |
| `main_thinking.ts`        | 调整提示词顺序，静态内容在前             |
| `PromptDataCollector.ts`  | 简化数据收集逻辑                         |
| `jest.config.js`          | 添加路径映射支持测试                     |
| `nested_template.test.ts` | 完整的测试套件                           |

## 后续计划

- [ ] 监控实际缓存命中率
- [ ] 添加性能分析日志
- [ ] 考虑更细粒度的模板拆分
- [ ] 评估其他模式（chat、combat）的优化空间
