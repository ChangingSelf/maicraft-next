/**
 * 提示词管理系统类型定义测试
 *
 * 测试所有核心类型和Schema验证功能
 */

import {
  VariableType,
  PromptErrorType,
  IPromptVariable,
  IPromptTemplate,
  IPromptVersion,
  IUsageRecord,
  ICategory,
  CreatePromptTemplateDto,
  RenderOptions,
  ValidationResult,
  TemplateQueryFilter,
  UsageFilter,
  UsageStatistics,
  CompiledTemplate,
  IPromptConfig,
  PromptError,
  PromptVariableSchema,
  PromptTemplateSchema,
  CreatePromptTemplateDtoSchema,
  PromptVersionSchema,
  UsageRecordSchema,
  CategorySchema,
  PromptConfigSchema,
} from '../types';

describe('类型定义测试', () => {
  describe('枚举类型', () => {
    it('VariableType 应该包含所有预期的值', () => {
      expect(VariableType.STRING).toBe('string');
      expect(VariableType.NUMBER).toBe('number');
      expect(VariableType.BOOLEAN).toBe('boolean');
      expect(VariableType.OBJECT).toBe('object');
      expect(VariableType.ARRAY).toBe('array');
    });

    it('PromptErrorType 应该包含所有预期的值', () => {
      expect(PromptErrorType.TEMPLATE_NOT_FOUND).toBe('TEMPLATE_NOT_FOUND');
      expect(PromptErrorType.INVALID_TEMPLATE).toBe('INVALID_TEMPLATE');
      expect(PromptErrorType.VARIABLE_VALIDATION_FAILED).toBe('VARIABLE_VALIDATION_FAILED');
      expect(PromptErrorType.VERSION_NOT_FOUND).toBe('VERSION_NOT_FOUND');
      expect(PromptErrorType.RENDER_ERROR).toBe('RENDER_ERROR');
      expect(PromptErrorType.STORAGE_ERROR).toBe('STORAGE_ERROR');
      expect(PromptErrorType.CACHE_ERROR).toBe('CACHE_ERROR');
      expect(PromptErrorType.CATEGORY_NOT_FOUND).toBe('CATEGORY_NOT_FOUND');
      expect(PromptErrorType.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    });
  });

  describe('接口类型', () => {
    it('IPromptVariable 应该定义正确的类型结构', () => {
      const variable: IPromptVariable = {
        name: 'username',
        type: VariableType.STRING,
        required: true,
        description: '用户名',
        validation: {
          min: 3,
          max: 20,
          pattern: '^[a-zA-Z0-9_]+$',
        },
      };

      expect(variable.name).toBe('username');
      expect(variable.type).toBe(VariableType.STRING);
      expect(variable.required).toBe(true);
      expect(variable.validation?.min).toBe(3);
    });

    it('IPromptTemplate 应该定义正确的类型结构', () => {
      const now = new Date();
      const template: IPromptTemplate = {
        id: 'test-template',
        name: '测试模板',
        description: '这是一个测试模板',
        category: 'test',
        tags: ['test', 'demo'],
        template: 'Hello, ${username}!',
        variables: [
          {
            name: 'username',
            type: VariableType.STRING,
            required: true,
            description: '用户名',
          },
        ],
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        enabled: true,
        metadata: {
          author: 'test',
        },
      };

      expect(template.id).toBe('test-template');
      expect(template.name).toBe('测试模板');
      expect(template.category).toBe('test');
      expect(template.tags).toContain('test');
      expect(template.variables).toHaveLength(1);
      expect(template.version).toBe('1.0.0');
    });

    it('IPromptVersion 应该定义正确的类型结构', () => {
      const now = new Date();
      const version: IPromptVersion = {
        templateId: 'test-template',
        version: '1.0.0',
        template: 'Hello, ${username}!',
        variables: [
          {
            name: 'username',
            type: VariableType.STRING,
            required: true,
            description: '用户名',
          },
        ],
        changelog: 'Initial version',
        createdAt: now,
        createdBy: 'test-user',
        isCurrent: true,
      };

      expect(version.templateId).toBe('test-template');
      expect(version.version).toBe('1.0.0');
      expect(version.changelog).toBe('Initial version');
      expect(version.isCurrent).toBe(true);
    });

    it('IUsageRecord 应该定义正确的类型结构', () => {
      const now = new Date();
      const record: IUsageRecord = {
        id: 'usage-001',
        templateId: 'test-template',
        version: '1.0.0',
        timestamp: now,
        variables: { username: 'testuser' },
        renderedPrompt: 'Hello, testuser!',
        renderTime: 10,
        tokensUsed: 50,
        cost: 0.001,
        success: true,
        userId: 'user-001',
        sessionId: 'session-001',
      };

      expect(record.id).toBe('usage-001');
      expect(record.templateId).toBe('test-template');
      expect(record.success).toBe(true);
      expect(record.tokensUsed).toBe(50);
      expect(record.cost).toBe(0.001);
    });

    it('ICategory 应该定义正确的类型结构', () => {
      const now = new Date();
      const category: ICategory = {
        id: 'test-category',
        name: '测试分类',
        description: '这是一个测试分类',
        createdAt: now,
        updatedAt: now,
        templateCount: 5,
        enabled: true,
      };

      expect(category.id).toBe('test-category');
      expect(category.name).toBe('测试分类');
      expect(category.templateCount).toBe(5);
      expect(category.enabled).toBe(true);
    });
  });

  describe('DTO 类型', () => {
    it('CreatePromptTemplateDto 应该定义正确的类型结构', () => {
      const dto: CreatePromptTemplateDto = {
        name: '新模板',
        description: '这是一个新模板',
        category: 'test',
        tags: ['new', 'template'],
        template: 'Hello, ${username}!',
        variables: [
          {
            name: 'username',
            type: VariableType.STRING,
            required: true,
            description: '用户名',
          },
        ],
        createdBy: 'test-user',
        metadata: {
          source: 'manual',
        },
      };

      expect(dto.name).toBe('新模板');
      expect(dto.category).toBe('test');
      expect(dto.tags).toContain('new');
      expect(dto.variables).toHaveLength(1);
    });

    it('RenderOptions 应该定义正确的类型结构', () => {
      const options: RenderOptions = {
        version: '1.0.0',
        enableCache: true,
        validateVariables: true,
        trackUsage: true,
        userId: 'user-001',
        sessionId: 'session-001',
        context: {
          source: 'api',
        },
      };

      expect(options.version).toBe('1.0.0');
      expect(options.enableCache).toBe(true);
      expect(options.trackUsage).toBe(true);
      expect(options.context?.source).toBe('api');
    });
  });

  describe('过滤类型', () => {
    it('TemplateQueryFilter 应该定义正确的类型结构', () => {
      const filter: TemplateQueryFilter = {
        categoryId: 'category-001',
        tags: ['test', 'demo'],
        enabled: true,
        createdBy: 'test-user',
        search: 'hello',
        createdAtRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
        pagination: {
          page: 1,
          limit: 10,
        },
        sort: {
          field: 'createdAt',
          order: 'desc',
        },
      };

      expect(filter.categoryId).toBe('category-001');
      expect(filter.tags).toContain('test');
      expect(filter.pagination?.page).toBe(1);
      expect(filter.sort?.field).toBe('createdAt');
    });

    it('UsageFilter 应该定义正确的类型结构', () => {
      const filter: UsageFilter = {
        templateId: 'template-001',
        version: '1.0.0',
        userId: 'user-001',
        success: true,
        timestampRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
        pagination: {
          page: 1,
          limit: 20,
        },
        sort: {
          field: 'timestamp',
          order: 'desc',
        },
      };

      expect(filter.templateId).toBe('template-001');
      expect(filter.success).toBe(true);
      expect(filter.pagination?.limit).toBe(20);
    });
  });

  describe('统计类型', () => {
    it('UsageStatistics 应该定义正确的类型结构', () => {
      const stats: UsageStatistics = {
        totalUsage: 100,
        successCount: 95,
        failureCount: 5,
        successRate: 0.95,
        totalTokens: 50000,
        totalCost: 10.5,
        averageRenderTime: 15.5,
        templateStats: [
          {
            templateId: 'template-001',
            templateName: '模板1',
            usageCount: 50,
            successRate: 0.98,
            averageTokens: 500,
            totalCost: 5.0,
          },
        ],
        dailyStats: [
          {
            date: '2024-01-01',
            usageCount: 20,
            successRate: 0.95,
            totalTokens: 10000,
            totalCost: 2.0,
          },
        ],
        userStats: [
          {
            userId: 'user-001',
            usageCount: 30,
            successRate: 0.97,
            totalTokens: 15000,
            totalCost: 3.0,
          },
        ],
      };

      expect(stats.totalUsage).toBe(100);
      expect(stats.successRate).toBe(0.95);
      expect(stats.templateStats).toHaveLength(1);
      expect(stats.dailyStats).toHaveLength(1);
      expect(stats.userStats).toHaveLength(1);
    });
  });

  describe('配置类型', () => {
    it('IPromptConfig 应该定义正确的类型结构', () => {
      const config: IPromptConfig = {
        templatesPath: './prompts/templates',
        versionsPath: './prompts/versions',
        usagePath: './prompts/usage',
        cache: {
          enabled: true,
          ttl: 3600,
          maxEntries: 1000,
        },
        usage: {
          enabled: true,
          retentionDays: 90,
          autoCleanup: true,
        },
        defaults: {
          defaultCategory: 'general',
          autoVersion: true,
          maxVersionsPerTemplate: 10,
        },
        performance: {
          maxConcurrentRenders: 10,
          renderTimeout: 5000,
          enableProfiling: false,
        },
      };

      expect(config.cache.enabled).toBe(true);
      expect(config.cache.ttl).toBe(3600);
      expect(config.defaults.defaultCategory).toBe('general');
      expect(config.performance.maxConcurrentRenders).toBe(10);
    });
  });
});

describe('Schema 验证测试', () => {
  describe('PromptVariableSchema', () => {
    it('应该验证有效的变量定义', () => {
      const validVariable = {
        name: 'username',
        type: VariableType.STRING,
        required: true,
        description: '用户名',
        validation: {
          min: 3,
          max: 20,
        },
      };

      const result = PromptVariableSchema.safeParse(validVariable);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的变量定义', () => {
      const invalidVariable = {
        name: '', // 空名称
        type: 'invalid-type',
        required: 'not-a-boolean',
        description: 123, // 非字符串描述
      };

      const result = PromptVariableSchema.safeParse(invalidVariable);
      expect(result.success).toBe(false);
    });
  });

  describe('PromptTemplateSchema', () => {
    it('应该验证有效的模板定义', () => {
      const now = new Date();
      const validTemplate = {
        id: 'test-template',
        name: '测试模板',
        description: '这是一个测试模板',
        category: 'test',
        tags: ['test', 'demo'],
        template: 'Hello, ${username}!',
        variables: [
          {
            name: 'username',
            type: VariableType.STRING,
            required: true,
            description: '用户名',
          },
        ],
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        enabled: true,
        metadata: {
          author: 'test',
        },
      };

      const result = PromptTemplateSchema.safeParse(validTemplate);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的模板定义', () => {
      const invalidTemplate = {
        id: '', // 空ID
        name: '测试模板',
        description: '这是一个测试模板',
        category: '', // 空分类
        tags: 'not-an-array', // 非数组
        template: 123, // 非字符串
        variables: 'not-an-array', // 非数组
        version: '', // 空版本
        createdAt: 'not-a-date', // 非日期
        updatedAt: 'not-a-date', // 非日期
        enabled: 'not-a-boolean', // 非布尔值
        metadata: 'not-an-object', // 非对象
      };

      const result = PromptTemplateSchema.safeParse(invalidTemplate);
      expect(result.success).toBe(false);
    });
  });

  describe('CreatePromptTemplateDtoSchema', () => {
    it('应该验证有效的创建模板DTO', () => {
      const validDto = {
        name: '新模板',
        description: '这是一个新模板',
        category: 'test',
        template: 'Hello, ${username}!',
        variables: [
          {
            name: 'username',
            type: VariableType.STRING,
            required: true,
            description: '用户名',
          },
        ],
      };

      const result = CreatePromptTemplateDtoSchema.safeParse(validDto);
      expect(result.success).toBe(true);
    });

    it('应该使用默认值', () => {
      const minimalDto = {
        name: '最小模板',
        description: '这是一个最小模板',
        category: 'test',
        template: 'Hello, world!',
      };

      const result = CreatePromptTemplateDtoSchema.safeParse(minimalDto);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual([]);
        expect(result.data.variables).toEqual([]);
        expect(result.data.metadata).toEqual({});
      }
    });
  });

  describe('PromptVersionSchema', () => {
    it('应该验证有效的版本信息', () => {
      const now = new Date();
      const validVersion = {
        templateId: 'test-template',
        version: '1.0.0',
        template: 'Hello, ${username}!',
        variables: [
          {
            name: 'username',
            type: VariableType.STRING,
            required: true,
            description: '用户名',
          },
        ],
        changelog: 'Initial version',
        createdAt: now,
        createdBy: 'test-user',
        isCurrent: true,
      };

      const result = PromptVersionSchema.safeParse(validVersion);
      expect(result.success).toBe(true);
    });
  });

  describe('UsageRecordSchema', () => {
    it('应该验证有效的使用记录', () => {
      const now = new Date();
      const validRecord = {
        id: 'usage-001',
        templateId: 'test-template',
        version: '1.0.0',
        timestamp: now,
        variables: { username: 'testuser' },
        renderedPrompt: 'Hello, testuser!',
        renderTime: 10,
        tokensUsed: 50,
        cost: 0.001,
        success: true,
        userId: 'user-001',
        sessionId: 'session-001',
      };

      const result = UsageRecordSchema.safeParse(validRecord);
      expect(result.success).toBe(true);
    });
  });

  describe('CategorySchema', () => {
    it('应该验证有效的分类信息', () => {
      const now = new Date();
      const validCategory = {
        id: 'test-category',
        name: '测试分类',
        description: '这是一个测试分类',
        createdAt: now,
        updatedAt: now,
        templateCount: 5,
        enabled: true,
      };

      const result = CategorySchema.safeParse(validCategory);
      expect(result.success).toBe(true);
    });
  });

  describe('PromptConfigSchema', () => {
    it('应该验证有效的配置信息', () => {
      const validConfig = {
        templatesPath: './prompts/templates',
        versionsPath: './prompts/versions',
        usagePath: './prompts/usage',
        cache: {
          enabled: true,
          ttl: 3600,
          maxEntries: 1000,
        },
        usage: {
          enabled: true,
          retentionDays: 90,
          autoCleanup: true,
        },
        defaults: {
          defaultCategory: 'general',
          autoVersion: true,
          maxVersionsPerTemplate: 10,
        },
        performance: {
          maxConcurrentRenders: 10,
          renderTimeout: 5000,
          enableProfiling: false,
        },
      };

      const result = PromptConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });
});

describe('PromptError 类测试', () => {
  it('应该创建正确类型的错误', () => {
    const error = PromptError.templateNotFound('test-template');
    expect(error.type).toBe(PromptErrorType.TEMPLATE_NOT_FOUND);
    expect(error.message).toContain('test-template');
  });

  it('应该包含错误详情', () => {
    const details = { templateId: 'test-template' };
    const error = PromptError.templateNotFound('test-template', details);
    expect(error.details).toEqual(details);
  });
});
