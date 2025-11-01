/**
 * 提示词存储管理器
 *
 * 负责提示词的持久化存储、版本管理和CRUD操作
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { Logger } from '../../utils/Logger.js';
import {
  PromptTemplate,
  TemplateVersion,
  TemplateCategory,
  TemplateTag,
  StorageStats,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  SearchFilter,
  ValidationResult,
  TemplateStatus,
} from '../types/index.js';
import { PromptError } from '../errors/PromptError.js';
import { z } from 'zod';

/**
 * 提示词存储管理器
 */
export class PromptStorage {
  private logger: Logger;
  private storageDir: string;
  private templatesDir: string;
  private versionsDir: string;
  private cache: Map<string, PromptTemplate> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  private lastCacheSync = new Map<string, number>();

  constructor(storageDir: string, logger?: Logger) {
    this.storageDir = storageDir;
    this.templatesDir = join(storageDir, 'templates');
    this.versionsDir = join(storageDir, 'versions');
    this.logger =
      logger ||
      new Logger({
        level: 2, // INFO
        console: true,
        file: false,
      }).child('PromptStorage');

    this.logger.info('提示词存储管理器初始化', {
      storage_dir: storageDir,
    });

    // 确保目录存在
    this.ensureDirectories();
  }

  /**
   * 创建提示词模板
   */
  async createTemplate(request: CreateTemplateRequest): Promise<PromptTemplate> {
    this.logger.debug('创建提示词模板', { name: request.name, category: request.category });

    // 验证请求
    const validation = this.validateCreateRequest(request);
    if (!validation.valid) {
      throw new PromptError(`Invalid template request: ${validation.errors.join(', ')}`, 'VALIDATION_ERROR', { validation });
    }

    // 生成ID
    const id = this.generateTemplateId(request.name);
    const now = new Date();

    // 创建模板对象
    const template: PromptTemplate = {
      id,
      name: request.name,
      description: request.description || '',
      content: request.content,
      category: request.category,
      tags: request.tags || [],
      variables: this.extractVariables(request.content),
      status: TemplateStatus.ACTIVE,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      created_by: request.created_by || 'system',
      version: 1,
      metadata: request.metadata || {},
      usage_count: 0,
      last_used_at: undefined,
    };

    // 保存模板
    await this.saveTemplate(template);

    // 创建初始版本
    const version: TemplateVersion = {
      id: this.generateVersionId(id),
      template_id: id,
      version: 1,
      content: request.content,
      description: 'Initial version',
      created_at: now.toISOString(),
      created_by: request.created_by || 'system',
      metadata: request.metadata || {},
    };
    await this.saveVersion(version);

    // 更新缓存
    this.cache.set(id, template);
    this.lastCacheSync.set(id, Date.now());

    this.logger.info('提示词模板创建成功', {
      id,
      name: template.name,
      version: template.version,
    });

    return template;
  }

  /**
   * 获取提示词模板
   */
  async getTemplate(id: string): Promise<PromptTemplate> {
    this.logger.debug('获取提示词模板', { id });

    // 检查缓存
    if (this.isCacheValid(id)) {
      const cached = this.cache.get(id);
      if (cached) {
        return cached;
      }
    }

    // 从文件加载
    const template = await this.loadTemplate(id);

    // 更新缓存
    this.cache.set(id, template);
    this.lastCacheSync.set(id, Date.now());

    return template;
  }

  /**
   * 更新提示词模板
   */
  async updateTemplate(id: string, request: UpdateTemplateRequest): Promise<PromptTemplate> {
    this.logger.debug('更新提示词模板', { id });

    // 获取当前模板
    const current = await this.getTemplate(id);

    // 验证请求
    const validation = this.validateUpdateRequest(request);
    if (!validation.valid) {
      throw new PromptError(`Invalid update request: ${validation.errors.join(', ')}`, 'VALIDATION_ERROR', { validation });
    }

    const now = new Date();

    // 创建新版本
    const newVersion = current.version + 1;
    const version: TemplateVersion = {
      id: this.generateVersionId(id),
      template_id: id,
      version: newVersion,
      content: request.content || current.content,
      description: request.description || `Version ${newVersion}`,
      created_at: now.toISOString(),
      created_by: request.updated_by || 'system',
      metadata: request.metadata || current.metadata,
    };
    await this.saveVersion(version);

    // 更新模板
    const updated: PromptTemplate = {
      ...current,
      content: request.content || current.content,
      description: request.description || current.description,
      tags: request.tags || current.tags,
      category: request.category || current.category,
      status: request.status || current.status,
      variables: this.extractVariables(request.content || current.content),
      metadata: request.metadata || current.metadata,
      version: newVersion,
      updated_at: now.toISOString(),
    };

    await this.saveTemplate(updated);

    // 更新缓存
    this.cache.set(id, updated);
    this.lastCacheSync.set(id, Date.now());

    this.logger.info('提示词模板更新成功', {
      id,
      version: newVersion,
    });

    return updated;
  }

  /**
   * 删除提示词模板
   */
  async deleteTemplate(id: string): Promise<void> {
    this.logger.debug('删除提示词模板', { id });

    // 检查是否存在
    await this.getTemplate(id);

    // 删除模板文件
    const templateFile = this.getTemplatePath(id);
    if (existsSync(templateFile)) {
      unlinkSync(templateFile);
    }

    // 删除版本目录
    const versionDir = this.getVersionDir(id);
    if (existsSync(versionDir)) {
      const versionFiles = readdirSync(versionDir);
      for (const file of versionFiles) {
        unlinkSync(join(versionDir, file));
      }
      // 注意：这里不删除版本目录本身，保留历史记录
    }

    // 清除缓存
    this.cache.delete(id);
    this.lastCacheSync.delete(id);

    this.logger.info('提示词模板删除成功', { id });
  }

  /**
   * 搜索提示词模板
   */
  async searchTemplates(filter: SearchFilter = {}): Promise<PromptTemplate[]> {
    this.logger.debug('搜索提示词模板', { filter });

    let templates: PromptTemplate[] = [];

    // 如果没有缓存或强制刷新，从文件系统加载
    if (this.cache.size === 0 || filter.force_refresh) {
      templates = await this.loadAllTemplates();
      // 更新缓存
      for (const template of templates) {
        this.cache.set(template.id, template);
        this.lastCacheSync.set(template.id, Date.now());
      }
    } else {
      templates = Array.from(this.cache.values());
    }

    // 应用过滤器
    let filtered = templates;

    if (filter.category) {
      filtered = filtered.filter(t => t.category === filter.category);
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
    }

    if (filter.status) {
      filtered = filtered.filter(t => t.status === filter.status);
    }

    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      filtered = filtered.filter(
        t =>
          t.name.toLowerCase().includes(searchTerm) ||
          t.description.toLowerCase().includes(searchTerm) ||
          t.content.toLowerCase().includes(searchTerm),
      );
    }

    // 排序
    if (filter.sort_by) {
      const sortOrder = filter.sort_order || 'desc';
      filtered = this.sortTemplates(filtered, filter.sort_by, sortOrder);
    }

    // 分页
    if (filter.limit) {
      const offset = filter.offset || 0;
      filtered = filtered.slice(offset, offset + filter.limit);
    }

    return filtered;
  }

  /**
   * 获取模板版本列表
   */
  async getTemplateVersions(templateId: string): Promise<TemplateVersion[]> {
    this.logger.debug('获取模板版本列表', { template_id: templateId });

    // 确保模板存在
    await this.getTemplate(templateId);

    const versionDir = this.getVersionDir(templateId);
    if (!existsSync(versionDir)) {
      return [];
    }

    const versionFiles = readdirSync(versionDir)
      .filter(f => f.endsWith('.json'))
      .sort();

    const versions: TemplateVersion[] = [];

    for (const file of versionFiles) {
      try {
        const content = readFileSync(join(versionDir, file), 'utf8');
        const version = JSON.parse(content);
        versions.push(version);
      } catch (error) {
        this.logger.warn('加载版本文件失败', {
          template_id: templateId,
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return versions.sort((a, b) => b.version - a.version);
  }

  /**
   * 获取特定版本
   */
  async getTemplateVersion(templateId: string, version: number): Promise<TemplateVersion> {
    this.logger.debug('获取模板特定版本', { template_id: templateId, version });

    const versionFile = this.getVersionPath(templateId, version);
    if (!existsSync(versionFile)) {
      throw new PromptError(`Template version ${version} not found for template ${templateId}`, 'VERSION_NOT_FOUND', {
        template_id: templateId,
        version,
      });
    }

    try {
      const content = readFileSync(versionFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new PromptError(`Failed to load template version: ${error}`, 'VERSION_LOAD_ERROR', { template_id: templateId, version });
    }
  }

  /**
   * 记录模板使用
   */
  async recordUsage(templateId: string, context?: Record<string, unknown>): Promise<void> {
    this.logger.debug('记录模板使用', { template_id: templateId });

    try {
      const template = await this.getTemplate(templateId);

      // 更新使用统计
      template.usage_count = (template.usage_count || 0) + 1;
      template.last_used_at = new Date().toISOString();

      await this.saveTemplate(template);

      // 更新缓存
      this.cache.set(templateId, template);
      this.lastCacheSync.set(templateId, Date.now());

      this.logger.debug('模板使用记录成功', {
        template_id: templateId,
        usage_count: template.usage_count,
      });
    } catch (error) {
      this.logger.warn('记录模板使用失败', {
        template_id: templateId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<StorageStats> {
    this.logger.debug('获取存储统计信息');

    let totalTemplates = 0;
    let totalVersions = 0;
    let totalSize = 0;
    const categoryStats: Record<string, number> = {};

    // 计算文件大小和统计信息
    if (existsSync(this.templatesDir)) {
      const templateFiles = readdirSync(this.templatesDir);
      for (const file of templateFiles) {
        if (file.endsWith('.json')) {
          totalTemplates++;
          const filePath = join(this.templatesDir, file);
          const stats = statSync(filePath);
          totalSize += stats.size;

          try {
            const content = readFileSync(filePath, 'utf8');
            const template = JSON.parse(content);
            categoryStats[template.category] = (categoryStats[template.category] || 0) + 1;
          } catch (error) {
            // 忽略解析错误
          }
        }
      }
    }

    // 计算版本数量
    if (existsSync(this.versionsDir)) {
      const versionDirs = readdirSync(this.versionsDir);
      for (const dir of versionDirs) {
        const versionDir = join(this.versionsDir, dir);
        if (existsSync(versionDir)) {
          const versionFiles = readdirSync(versionDir);
          totalVersions += versionFiles.length;
        }
      }
    }

    // 缓存统计
    const cacheSize = this.cache.size;
    const oldestCache = Math.min(...Array.from(this.lastCacheSync.values()));
    const newestCache = Math.max(...Array.from(this.lastCacheSync.values()));

    return {
      total_templates: totalTemplates,
      total_versions: totalVersions,
      total_size_bytes: totalSize,
      categories: Object.keys(categoryStats).length,
      category_distribution: categoryStats,
      cache_size: cacheSize,
      cache_oldest: oldestCache || 0,
      cache_newest: newestCache || 0,
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * 清理旧缓存
   */
  cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, lastSync] of this.lastCacheSync.entries()) {
      if (now - lastSync > this.cacheTimeout) {
        this.cache.delete(id);
        this.lastCacheSync.delete(id);
        cleaned++;
      }
    }

    this.logger.debug('缓存清理完成', {
      cleaned_entries: cleaned,
      remaining_entries: this.cache.size,
    });
  }

  /**
   * 获取所有分类
   */
  async getCategories(): Promise<string[]> {
    const templates = await this.searchTemplates({});
    const categories = new Set<string>();

    for (const template of templates) {
      categories.add(template.category);
    }

    return Array.from(categories).sort();
  }

  /**
   * 获取所有标签
   */
  async getTags(): Promise<string[]> {
    const templates = await this.searchTemplates({});
    const tags = new Set<string>();

    for (const template of templates) {
      for (const tag of template.tags) {
        tags.add(tag);
      }
    }

    return Array.from(tags).sort();
  }

  /**
   * 保存模板
   */
  private async saveTemplate(template: PromptTemplate): Promise<void> {
    const templateFile = this.getTemplatePath(template.id);
    const content = JSON.stringify(template, null, 2);
    writeFileSync(templateFile, content, 'utf8');
  }

  /**
   * 加载模板
   */
  private async loadTemplate(id: string): Promise<PromptTemplate> {
    const templateFile = this.getTemplatePath(id);

    if (!existsSync(templateFile)) {
      throw new PromptError(`Template not found: ${id}`, 'TEMPLATE_NOT_FOUND', { template_id: id });
    }

    try {
      const content = readFileSync(templateFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new PromptError(`Failed to load template: ${error}`, 'TEMPLATE_LOAD_ERROR', { template_id: id });
    }
  }

  /**
   * 保存版本
   */
  private async saveVersion(version: TemplateVersion): Promise<void> {
    const versionFile = this.getVersionPath(version.template_id, version.version);
    const content = JSON.stringify(version, null, 2);

    // 确保版本目录存在
    const versionDir = this.getVersionDir(version.template_id);
    if (!existsSync(versionDir)) {
      mkdirSync(versionDir, { recursive: true });
    }

    writeFileSync(versionFile, content, 'utf8');
  }

  /**
   * 加载所有模板
   */
  private async loadAllTemplates(): Promise<PromptTemplate[]> {
    if (!existsSync(this.templatesDir)) {
      return [];
    }

    const templateFiles = readdirSync(this.templatesDir).filter(f => f.endsWith('.json'));

    const templates: PromptTemplate[] = [];

    for (const file of templateFiles) {
      try {
        const content = readFileSync(join(this.templatesDir, file), 'utf8');
        const template = JSON.parse(content);
        templates.push(template);
      } catch (error) {
        this.logger.warn('加载模板文件失败', {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return templates;
  }

  /**
   * 验证创建请求
   */
  private validateCreateRequest(request: CreateTemplateRequest): ValidationResult {
    const errors: string[] = [];

    // 检查必填字段
    if (!request.name || request.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!request.content || request.content.trim().length === 0) {
      errors.push('Template content is required');
    }

    if (!request.category || request.category.trim().length === 0) {
      errors.push('Template category is required');
    }

    // 检查名称格式
    if (request.name && !/^[a-zA-Z0-9_\-]+$/.test(request.name)) {
      errors.push('Template name can only contain letters, numbers, underscores and hyphens');
    }

    // 检查是否已存在
    if (request.name) {
      const existingId = this.generateTemplateId(request.name);
      if (existsSync(this.getTemplatePath(existingId))) {
        errors.push('Template with this name already exists');
      }
    }

    // 检查标签格式
    if (request.tags) {
      for (const tag of request.tags) {
        if (!/^[a-zA-Z0-9_\-]+$/.test(tag)) {
          errors.push(`Invalid tag format: ${tag}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证更新请求
   */
  private validateUpdateRequest(request: UpdateTemplateRequest): ValidationResult {
    const errors: string[] = [];

    // 检查内容格式
    if (request.content && request.content.trim().length === 0) {
      errors.push('Template content cannot be empty');
    }

    // 检查标签格式
    if (request.tags) {
      for (const tag of request.tags) {
        if (!/^[a-zA-Z0-9_\-]+$/.test(tag)) {
          errors.push(`Invalid tag format: ${tag}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 提取变量
   */
  private extractVariables(content: string): string[] {
    const variables = new Set<string>();
    const regex = /\$\{([^}]+)\}/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const variable = match[1].trim();
      if (variable && !variable.startsWith('#') && !variable.startsWith('/')) {
        // 过滤掉控制结构
        const simpleVar = variable.split('.')[0]; // 取第一个部分
        variables.add(simpleVar);
      }
    }

    return Array.from(variables).sort();
  }

  /**
   * 生成模板ID
   */
  private generateTemplateId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  /**
   * 生成版本ID
   */
  private generateVersionId(templateId: string): string {
    return `${templateId}-v${Date.now()}`;
  }

  /**
   * 获取模板文件路径
   */
  private getTemplatePath(id: string): string {
    return join(this.templatesDir, `${id}.json`);
  }

  /**
   * 获取版本目录路径
   */
  private getVersionDir(templateId: string): string {
    return join(this.versionsDir, templateId);
  }

  /**
   * 获取版本文件路径
   */
  private getVersionPath(templateId: string, version: number): string {
    return join(this.getVersionDir(templateId), `v${version}.json`);
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(id: string): boolean {
    const lastSync = this.lastCacheSync.get(id);
    if (!lastSync) return false;

    return Date.now() - lastSync < this.cacheTimeout;
  }

  /**
   * 排序模板
   */
  private sortTemplates(templates: PromptTemplate[], sortBy: keyof PromptTemplate, order: 'asc' | 'desc' = 'desc'): PromptTemplate[] {
    return [...templates].sort((a, b) => {
      let valueA = a[sortBy];
      let valueB = b[sortBy];

      // 处理字符串比较
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        const result = valueA.localeCompare(valueB);
        return order === 'asc' ? result : -result;
      }

      // 处理数字比较
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        const result = valueA - valueB;
        return order === 'asc' ? result : -result;
      }

      // 处理日期比较
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        const dateA = new Date(valueA).getTime();
        const dateB = new Date(valueB).getTime();
        const result = dateA - dateB;
        return order === 'asc' ? result : -result;
      }

      return 0;
    });
  }

  /**
   * 确保目录存在
   */
  private ensureDirectories(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }

    if (!existsSync(this.templatesDir)) {
      mkdirSync(this.templatesDir, { recursive: true });
    }

    if (!existsSync(this.versionsDir)) {
      mkdirSync(this.versionsDir, { recursive: true });
    }
  }
}
