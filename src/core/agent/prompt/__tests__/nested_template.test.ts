/**
 * 嵌套模板引用功能测试
 */

import { PromptManager, PromptTemplate } from '@/core/agent/prompt/prompt_manager';

describe('嵌套模板引用', () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager();
  });

  test('应该自动识别并生成嵌套模板', () => {
    // 注册子模板
    manager.registerTemplate(new PromptTemplate('greeting', '你好，{name}！', '问候语', ['name']));

    // 注册主模板，引用子模板
    manager.registerTemplate(new PromptTemplate('main', '{greeting}\n欢迎来到 {place}', '主模板', ['greeting', 'place']));

    // 生成主模板时，应该自动生成 greeting 子模板
    const result = manager.generatePrompt('main', {
      name: 'Alice',
      place: 'Minecraft',
    });

    expect(result).toBe('你好，Alice！\n欢迎来到 Minecraft');
  });

  test('应该支持多层嵌套', () => {
    // 最内层模板
    manager.registerTemplate(new PromptTemplate('name', '{first} {last}', '姓名', ['first', 'last']));

    // 中间层模板
    manager.registerTemplate(new PromptTemplate('greeting', '你好，{name}！', '问候', ['name']));

    // 最外层模板
    manager.registerTemplate(new PromptTemplate('message', '{greeting}\n{content}', '消息', ['greeting', 'content']));

    const result = manager.generatePrompt('message', {
      first: 'John',
      last: 'Doe',
      content: '欢迎',
    });

    expect(result).toBe('你好，John Doe！\n欢迎');
  });

  test('应该检测循环引用', () => {
    // 创建循环引用：A -> B -> A
    manager.registerTemplate(new PromptTemplate('template_a', '{template_b}', 'A', ['template_b']));
    manager.registerTemplate(new PromptTemplate('template_b', '{template_a}', 'B', ['template_a']));

    expect(() => {
      manager.generatePrompt('template_a', {});
    }).toThrow(/循环引用/);
  });

  test('应该处理参数不足的嵌套模板', () => {
    // 子模板需要 name 和 age
    manager.registerTemplate(new PromptTemplate('profile', '{name} 今年 {age} 岁', '简介', ['name', 'age']));

    // 主模板引用子模板
    manager.registerTemplate(new PromptTemplate('main', '{profile}\n{note}', '主模板', ['profile', 'note']));

    // 只提供 name，不提供 age
    // 应该跳过自动生成 profile，需要手动提供
    expect(() => {
      manager.generatePrompt('main', {
        name: 'Alice',
        note: '备注',
      });
    }).toThrow(/缺少必需参数/);
  });

  test('应该优先使用同名模板并警告手动提供的值', () => {
    manager.registerTemplate(new PromptTemplate('greeting', '你好，{name}！', '问候', ['name']));
    manager.registerTemplate(new PromptTemplate('main', '{greeting}\n{content}', '主模板', ['greeting', 'content']));

    // 手动提供 greeting，应该被忽略并警告，使用模板生成
    const result = manager.generatePrompt('main', {
      greeting: '自定义问候', // 会被忽略
      content: '内容',
      name: 'Alice', // 用于生成 greeting 模板
    });

    // 优先使用模板生成的结果，而不是手动提供的值
    expect(result).toBe('你好，Alice！\n内容');
  });

  test('实际场景：role_description 和 basic_info 嵌套', () => {
    // 角色描述模板（静态）
    manager.registerTemplate(
      new PromptTemplate('role_description', '你是{bot_name}，游戏名叫{player_name}。', '角色描述', ['bot_name', 'player_name']),
    );

    // 基础信息模板（动态）
    manager.registerTemplate(new PromptTemplate('basic_info', '目标：{goal}\n位置：{position}', '基础信息', ['goal', 'position']));

    // 主思考模板
    manager.registerTemplate(
      new PromptTemplate('main_thinking', '{role_description}\n\n{basic_info}\n\n{actions}', '主思考', ['role_description', 'basic_info', 'actions']),
    );

    const result = manager.generatePrompt('main_thinking', {
      bot_name: 'AI Bot',
      player_name: 'TestBot',
      goal: '收集木头',
      position: '(100, 64, 200)',
      actions: '可用动作...',
    });

    expect(result).toContain('你是AI Bot，游戏名叫TestBot。');
    expect(result).toContain('目标：收集木头');
    expect(result).toContain('位置：(100, 64, 200)');
    expect(result).toContain('可用动作...');
  });
});
