/**
 * PromptManager测试 - 简化版本
 */

import { PromptManager, createPromptManager } from '../PromptManager.js';
import { PromptStorage } from '../storage/PromptStorage.js';
import { TemplateEngine } from '../engine/TemplateEngine.js';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rimraf } from 'rimraf';

describe('PromptManager', () => {
  const testStorageDir = './test-prompt-storage';
  let promptManager: PromptManager;
  let storage: PromptStorage;
  let engine: TemplateEngine;

  beforeAll(async () => {
    // 确保测试目录存在
    if (!existsSync(testStorageDir)) {
      mkdirSync(testStorageDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    // 清理测试数据
    if (existsSync(testStorageDir)) {
      rimraf.sync(testStorageDir);
    }
    mkdirSync(testStorageDir, { recursive: true });

    // 创建测试组件
    storage = new PromptStorage(testStorageDir);
    engine = new TemplateEngine();
    promptManager = new PromptManager(storage, engine);
  });

  afterEach(async () => {
    // 清理资源
    await promptManager.close();
  });

  afterAll(() => {
    // 清理测试目录
    if (existsSync(testStorageDir)) {
      rimraf.sync(testStorageDir);
    }
  });

  describe('基本功能测试', () => {
    test('应该能够创建PromptManager', async () => {
      expect(promptManager).toBeDefined();
    });

    test('应该能够创建提示词模板', async () => {
      const request = {
        name: 'test-template',
        description: 'Test template',
        content: 'Hello, ${name}!',
        category: 'test' as any,
        tags: ['test'],
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      expect(template).toBeDefined();
      expect(template.name).toBe('test-template');
      expect(template.content).toBe('Hello, ${name}!');
      expect(template.category).toBe('test');
      expect(template.tags).toEqual(['test']);
      expect(template.variables).toEqual(['name']);
    });

    test('应该能够获取提示词模板', async () => {
      const request = {
        name: 'get-test',
        description: 'Get test template',
        content: 'Get ${item}',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const created = await promptManager.createTemplate(request);
      const retrieved = await promptManager.getTemplate(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe('get-test');
      expect(retrieved.content).toBe('Get ${item}');
    });

    test('应该能够更新提示词模板', async () => {
      const request = {
        name: 'update-test',
        description: 'Update test template',
        content: 'Original ${content}',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const created = await promptManager.createTemplate(request);

      const updated = await promptManager.updateTemplate(created.id, {
        content: 'Updated ${content}',
        description: 'Updated description',
      });

      expect(updated).toBeDefined();
      expect(updated.content).toBe('Updated ${content}');
      expect(updated.description).toBe('Updated description');
      expect(updated.version).toBeGreaterThan(created.version);
    });

    test('应该能够删除提示词模板', async () => {
      const request = {
        name: 'delete-test',
        description: 'Delete test template',
        content: 'Delete me',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const created = await promptManager.createTemplate(request);

      await expect(promptManager.deleteTemplate(created.id)).resolves.not.toThrow();

      await expect(promptManager.getTemplate(created.id)).rejects.toThrow();
    });

    test('应该能够搜索提示词模板', async () => {
      // 创建测试模板
      await promptManager.createTemplate({
        name: 'search-test-1',
        description: 'First search test',
        content: 'Content 1',
        category: 'category1' as any,
        tags: ['tag1', 'common'],
        created_by: 'test-user',
      });

      await promptManager.createTemplate({
        name: 'search-test-2',
        description: 'Second search test',
        content: 'Content 2',
        category: 'category2' as any,
        tags: ['tag2', 'common'],
        created_by: 'test-user',
      });

      // 按分类搜索
      const categoryResults = await promptManager.searchTemplates({
        category: 'category1',
      });
      expect(categoryResults.length).toBe(1);
      expect(categoryResults[0].category).toBe('category1');

      // 按标签搜索
      const tagResults = await promptManager.searchTemplates({
        tags: ['common'],
      });
      expect(tagResults.length).toBe(2);

      // 文本搜索
      const textResults = await promptManager.searchTemplates({
        search: 'First',
      });
      expect(textResults.length).toBe(1);
      expect(textResults[0].name).toBe('search-test-1');
    });
  });

  describe('模板渲染测试', () => {
    test('应该能够渲染简单模板', async () => {
      const request = {
        name: 'render-test',
        description: 'Render test template',
        content: 'Hello, ${name}!',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      const result = await promptManager.renderTemplate({
        template_id: template.id,
        variables: {
          name: 'Alice',
        },
      });

      expect(result).toBeDefined();
      expect(result.rendered_content).toBe('Hello, Alice!');
      expect(result.variables_used).toEqual(['name']);
      expect(result.errors).toEqual([]);
    });

    test('应该能够直接渲染内容', async () => {
      const result = await promptManager.renderTemplate({
        template_id: 'Hello, ${name}! You have ${count} messages.',
        variables: {
          name: 'Bob',
          count: 42,
        },
      });

      expect(result.rendered_content).toBe('Hello, Bob! You have 42 messages.');
    });

    test('应该处理渲染错误', async () => {
      const request = {
        name: 'error-test',
        description: 'Error handling test',
        content: 'Hello, ${missing_variable}!',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      // 严格模式应该失败
      await expect(
        promptManager.renderTemplate({
          template_id: template.id,
          variables: {},
          strict: true,
        }),
      ).rejects.toThrow();

      // 非严格模式应该返回警告
      const result = await promptManager.renderTemplate({
        template_id: template.id,
        variables: {},
        strict: false,
      });

      expect(result.errors).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('使用统计测试', () => {
    test('应该能够跟踪使用统计', async () => {
      const request = {
        name: 'stats-test',
        description: 'Statistics test',
        content: 'Hello, ${name}!',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      // 初始统计
      let stats = promptManager.getUsageStats(template.id);
      expect(stats.render_count).toBe(0);

      // 渲染多次
      await promptManager.renderTemplate({
        template_id: template.id,
        variables: { name: 'Alice' },
      });

      await promptManager.renderTemplate({
        template_id: template.id,
        variables: { name: 'Bob' },
      });

      // 检查统计
      stats = promptManager.getUsageStats(template.id);
      expect(stats.render_count).toBe(2);
      expect(stats.last_used).toBeDefined();
    });

    test('应该能够重置使用统计', async () => {
      const request = {
        name: 'reset-stats-test',
        description: 'Reset statistics test',
        content: 'Content',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      // 使用一次
      await promptManager.renderTemplate({
        template_id: template.id,
        variables: {},
      });

      // 重置统计
      promptManager.resetUsageStats(template.id);

      // 检查重置结果
      const stats = promptManager.getUsageStats(template.id);
      expect(stats.render_count).toBe(0);
    });
  });

  describe('分类和标签测试', () => {
    test('应该能够获取分类列表', async () => {
      await promptManager.createTemplate({
        name: 'cat1-test',
        description: 'Category 1 test',
        content: 'Content 1',
        category: 'category1' as any,
        created_by: 'test-user',
      });

      await promptManager.createTemplate({
        name: 'cat2-test',
        description: 'Category 2 test',
        content: 'Content 2',
        category: 'category2' as any,
        created_by: 'test-user',
      });

      const categories = await promptManager.getCategories();

      expect(categories).toContain('category1');
      expect(categories).toContain('category2');
    });

    test('应该能够获取标签列表', async () => {
      await promptManager.createTemplate({
        name: 'tag1-test',
        description: 'Tag 1 test',
        content: 'Content 1',
        category: 'test' as any,
        tags: ['tag1', 'shared'],
        created_by: 'test-user',
      });

      await promptManager.createTemplate({
        name: 'tag2-test',
        description: 'Tag 2 test',
        content: 'Content 2',
        category: 'test' as any,
        tags: ['tag2', 'shared'],
        created_by: 'test-user',
      });

      const tags = await promptManager.getTags();

      expect(tags).toContain('tag1');
      expect(tags).toContain('tag2');
      expect(tags).toContain('shared');
    });
  });

  describe('版本管理测试', () => {
    test('应该能够获取版本历史', async () => {
      const request = {
        name: 'version-test',
        description: 'Version test',
        content: 'Version 1',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      // 更新模板
      await promptManager.updateTemplate(template.id, {
        content: 'Version 2',
      });

      await promptManager.updateTemplate(template.id, {
        content: 'Version 3',
      });

      const versions = await promptManager.getTemplateVersions(template.id);

      expect(versions.length).toBe(3);
      expect(versions[0].version).toBe(1);
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(3);
    });

    test('应该能够获取特定版本', async () => {
      const request = {
        name: 'specific-version-test',
        description: 'Specific version test',
        content: 'Original',
        category: 'test' as any,
        created_by: 'test-user',
      };

      const template = await promptManager.createTemplate(request);

      // 更新模板
      await promptManager.updateTemplate(template.id, {
        content: 'Updated',
      });

      const version1 = await promptManager.getTemplateVersion(template.id, 1);
      const version2 = await promptManager.getTemplateVersion(template.id, 2);

      expect(version1.content).toBe('Original');
      expect(version2.content).toBe('Updated');
    });
  });

  describe('错误处理测试', () => {
    test('应该处理无效模板名称', async () => {
      const request = {
        name: 'invalid name!',
        description: 'Invalid name test',
        content: 'Content',
        category: 'test' as any,
        created_by: 'test-user',
      };

      await expect(promptManager.createTemplate(request)).rejects.toThrow();
    });

    test('应该处理重复模板名称', async () => {
      const request = {
        name: 'duplicate-test',
        description: 'Duplicate test',
        content: 'Content',
        category: 'test' as any,
        created_by: 'test-user',
      };

      // 创建第一个
      await promptManager.createTemplate(request);

      // 尝试创建第二个
      await expect(promptManager.createTemplate(request)).rejects.toThrow();
    });

    test('应该处理不存在的模板', async () => {
      await expect(promptManager.getTemplate('non-existent')).rejects.toThrow();
      await expect(promptManager.updateTemplate('non-existent', {})).rejects.toThrow();
      await expect(promptManager.deleteTemplate('non-existent')).rejects.toThrow();
    });
  });
});
