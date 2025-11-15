# 嵌套模板引用功能

## 概述

提示词系统现已支持**自动嵌套模板引用**，允许在模板中直接使用 `{template_name}` 来引用其他已注册的模板，系统会自动递归生成并替换。

## 功能特性

### 1. 自动识别和替换

当模板中包含 `{placeholder}` 占位符时，系统会按以下优先级处理：

1. **已提供的参数**：如果参数中有 `placeholder` 的值，直接使用
2. **同名模板**：如果没有提供参数，但存在名为 `placeholder` 的已注册模板，自动生成该模板
3. **报错**：既没有参数也没有同名模板，抛出 "缺少必需参数" 错误

### 2. 递归嵌套支持

支持多层嵌套模板，例如：

```typescript
// 最内层：姓名模板
template_manager.registerTemplate('name', '{first} {last}');

// 中间层：问候模板（引用 name）
template_manager.registerTemplate('greeting', '你好，{name}！');

// 最外层：消息模板（引用 greeting）
template_manager.registerTemplate('message', '{greeting}\n{content}');

// 一次调用，自动递归生成
const result = template_manager.generatePrompt('message', {
  first: 'John',
  last: 'Doe',
  content: '欢迎',
});
// 输出：你好，John Doe！\n欢迎
```

### 3. 循环引用检测

系统会自动检测并阻止循环引用：

```typescript
// A 引用 B，B 引用 A
registerTemplate('template_a', '{template_b}');
registerTemplate('template_b', '{template_a}');

// 调用时会抛出异常
generatePrompt('template_a', {});
// Error: 检测到循环引用: template_a -> template_b -> template_a
```

### 4. 参数传递

嵌套模板会从顶层参数中提取所需的参数：

```typescript
registerTemplate('role_description', '你是{bot_name}，游戏名叫{player_name}');
registerTemplate('main', '{role_description}\n目标：{goal}');

generatePrompt('main', {
  bot_name: 'AI Bot',
  player_name: 'TestBot',
  goal: '收集木头',
});
// 输出：
// 你是AI Bot，游戏名叫TestBot
// 目标：收集木头
```

### 5. 手动覆盖

可以手动提供嵌套模板的值来覆盖自动生成：

```typescript
registerTemplate('greeting', '你好，{name}！');
registerTemplate('main', '{greeting}\n{content}');

// 手动提供 greeting
generatePrompt('main', {
  greeting: '自定义问候',
  content: '内容',
  name: 'Alice', // 虽然提供了 name，但不会使用（因为 greeting 已手动提供）
});
// 输出：自定义问候\n内容
```

## 在项目中的应用

### 提示词结构优化

利用嵌套模板功能，我们将提示词分为**静态部分**和**动态部分**，优化 LLM 缓存效率：

```
main_thinking 模板:
├─ role_description（静态，可缓存）
│  ├─ bot_name
│  └─ player_name
│
├─ basic_info（动态，频繁变化）
│  ├─ goal
│  ├─ to_do_list
│  ├─ self_status_info
│  ├─ inventory_info
│  ├─ position
│  ├─ nearby_block_info
│  └─ ...
│
├─ available_actions（半静态）
├─ eat_action（动态）
├─ kill_mob_action（动态）
└─ thinking_list（动态）
```

### 代码简化

**之前**需要手动生成子模板：

```typescript
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
```

**现在**只需提供基础参数：

```typescript
return {
  role_description: '', // 自动生成
  basic_info: '', // 自动生成
  bot_name: basicInfo.bot_name,
  player_name: basicInfo.player_name,
  goal: basicInfo.goal,
  // ...其他参数
};
```

## 实现原理

### 核心逻辑

1. **模板格式化时动态处理**：在 `formatWithNestedTemplates` 方法中，遍历所有占位符
2. **优先级检查**：先检查参数，再检查同名模板
3. **递归生成**：调用 `generatePrompt` 递归生成嵌套模板
4. **访问追踪**：使用 `visitedTemplates` Set 追踪已访问的模板，防止循环引用

### 占位符识别

使用增强的正则表达式来识别模板占位符，避免误匹配 JSON 示例：

```typescript
// 只匹配单个 {param}，排除 {{ 和 }}
const paramPattern = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)(?::[^}]+)?\}(?!\})/g;
```

这样可以正确区分：

- 模板占位符：`{role_description}` → 会被替换
- JSON 示例：`{{ "thinking": "..." }}` → 不会被替换

### 关键代码

```typescript
private formatWithNestedTemplates(
  template: PromptTemplate,
  params: Record<string, any>,
  visitedTemplates: Set<string>,
): string {
  let result = template.template;

  // 提取所有占位符
  const placeholders = extractPlaceholders(template.template);

  for (const placeholder of placeholders) {
    let value: string;

    if (placeholder in params) {
      // 1. 参数已提供
      value = String(params[placeholder]);
    } else if (this.templates.has(placeholder)) {
      // 2. 存在同名模板，递归生成
      value = this.generatePrompt(placeholder, params, visitedTemplates);
    } else {
      // 3. 缺少参数
      throw new Error(`缺少必需参数: ${placeholder}`);
    }

    result = result.replace(`{${placeholder}}`, value);
  }

  return result;
}
```

## 测试覆盖

完整的测试套件 (`nested_template.test.ts`) 覆盖以下场景：

- ✅ 基础嵌套模板引用
- ✅ 多层递归嵌套
- ✅ 循环引用检测
- ✅ 参数不足处理
- ✅ 手动覆盖自动生成
- ✅ 实际应用场景（role_description + basic_info）

## 性能考虑

1. **缓存友好**：静态模板（如 `role_description`）内容不变，放在提示词开头利于 LLM 缓存
2. **按需生成**：只有实际使用的嵌套模板才会被生成
3. **无冗余计算**：每个嵌套模板在一次调用中只生成一次

## 未来改进

- [ ] 支持嵌套模板的默认值
- [ ] 添加模板生成缓存（相同参数返回缓存结果）
- [ ] 支持条件嵌套（根据参数决定是否生成某个嵌套模板）
