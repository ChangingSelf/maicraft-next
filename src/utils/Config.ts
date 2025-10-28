import { existsSync, copyFileSync, readFileSync, writeFileSync, watchFile, unwatchFile, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { createModuleLogger, LogLevel } from './Logger';

/**
 * 应用配置接口
 */
export interface AppSection {
  name: string;
  version: string;
  debug: boolean;
  data_dir: string;
}

/**
 * 日志配置接口
 */
export interface LoggingSection {
  level: 'error' | 'warn' | 'info' | 'debug';
  console: boolean;
  file: boolean;
  max_file_size: number;
  max_files: number;
  log_dir: string;
}

/**
 * Minecraft配置接口
 */
export interface MinecraftSection {
  host: string;
  port: number;
  username: string;
  password: string;
  auth: 'offline' | 'mojang' | 'microsoft';
  reconnect: boolean;
  reconnect_delay: number;
  max_reconnect_attempts: number;
  timeout: number;
  keep_alive: boolean;
}

/**
 * AI代理配置接口
 */
export interface AgentSection {
  model_name: string;
  max_tokens: number;
  temperature: number;
  decision_timeout: number;
  max_actions_per_minute: number;
  safe_mode: boolean;
  allow_destructive_actions: boolean;
  memory_limit: number;
  save_memory_interval: number;
}

/**
 * 插件配置接口
 */
export interface PluginsSection {
  enabled: string[];
  'armor-manager'?: {
    auto_equip: boolean;
    prefer_protection: boolean;
  };
  pathfinder?: {
    timeout: number;
    search_radius: number;
  };
  collectblock?: {
    max_distance: number;
    auto_collect: boolean;
  };
  pvp?: {
    enabled: boolean;
    auto_attack: boolean;
  };
  tool?: {
    auto_switch: boolean;
    prefer_efficiency: boolean;
  };
}

/**
 * 高级配置接口
 */
export interface AdvancedSection {
  hot_reload: boolean;
  config_backup: boolean;
  backup_count: number;
  tick_rate: number;
  max_concurrent_tasks: number;
  allow_operator_commands: boolean;
  restricted_items: string[];
}

/**
 * 深度可选类型
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

/**
 * 主配置接口
 */
export interface AppConfig {
  app: AppSection;
  logging: LoggingSection;
  minecraft: MinecraftSection;
  agent: AgentSection;
  plugins: PluginsSection;
  advanced: AdvancedSection;
}

/**
 * 配置验证Schema
 */
const AppSectionSchema = z.object({
  name: z.string().default('maicraft-next'),
  version: z.string().default('0.1.0'),
  debug: z.boolean().default(false),
  data_dir: z.string().default('./data'),
});

const LoggingSectionSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  console: z.boolean().default(true),
  file: z.boolean().default(true),
  max_file_size: z.number().positive().default(10 * 1024 * 1024),
  max_files: z.number().positive().default(5),
  log_dir: z.string().default('./logs'),
});

const MinecraftSectionSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().positive().default(25565),
  username: z.string().default('MaicraftBot'),
  password: z.string().default(''),
  auth: z.enum(['offline', 'mojang', 'microsoft']).default('offline'),
  reconnect: z.boolean().default(true),
  reconnect_delay: z.number().positive().default(5000),
  max_reconnect_attempts: z.number().positive().default(5),
  timeout: z.number().positive().default(30000),
  keep_alive: z.boolean().default(true),
});

const AgentSectionSchema = z.object({
  model_name: z.string().default('gpt-4'),
  max_tokens: z.number().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  decision_timeout: z.number().positive().default(30000),
  max_actions_per_minute: z.number().positive().default(30),
  safe_mode: z.boolean().default(true),
  allow_destructive_actions: z.boolean().default(false),
  memory_limit: z.number().positive().default(1000),
  save_memory_interval: z.number().positive().default(60000),
});

const PluginsSectionSchema = z.object({
  enabled: z.array(z.string()).default([
    'armor-manager',
    'pathfinder',
    'collectblock',
    'pvp',
    'tool'
  ]),
  'armor-manager': z.object({
    auto_equip: z.boolean().default(true),
    prefer_protection: z.boolean().default(true),
  }).optional(),
  pathfinder: z.object({
    timeout: z.number().positive().default(10000),
    search_radius: z.number().positive().default(100),
  }).optional(),
  collectblock: z.object({
    max_distance: z.number().positive().default(16),
    auto_collect: z.boolean().default(true),
  }).optional(),
  pvp: z.object({
    enabled: z.boolean().default(false),
    auto_attack: z.boolean().default(false),
  }).optional(),
  tool: z.object({
    auto_switch: z.boolean().default(true),
    prefer_efficiency: z.boolean().default(true),
  }).optional(),
});

const AdvancedSectionSchema = z.object({
  hot_reload: z.boolean().default(true),
  config_backup: z.boolean().default(true),
  backup_count: z.number().positive().default(5),
  tick_rate: z.number().positive().default(20),
  max_concurrent_tasks: z.number().positive().default(10),
  allow_operator_commands: z.boolean().default(false),
  restricted_items: z.array(z.string()).default([]),
});

const AppConfigSchema = z.object({
  app: AppSectionSchema,
  logging: LoggingSectionSchema,
  minecraft: MinecraftSectionSchema,
  agent: AgentSectionSchema,
  plugins: PluginsSectionSchema,
  advanced: AdvancedSectionSchema,
});

/**
 * 配置错误类
 */
export class ConfigError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * 配置管理器
 */
export class ConfigManager extends EventEmitter {
  private config: AppConfig | null = null;
  private configPath: string;
  private templatePath: string;
  private backupPath: string;
  private logger = createModuleLogger('Config');
  private isWatching = false;
  private watchDebounceTimer: NodeJS.Timeout | null = null;
  private readonly WATCH_DEBOUNCE_DELAY = 1000; // 1秒防抖

  constructor(configPath: string = './config.toml', templatePath: string = './config-template.toml') {
    super();
    this.configPath = configPath;
    this.templatePath = templatePath;
    this.backupPath = `${configPath}.backup`;

    this.logger.info('配置管理器初始化', { configPath, templatePath });
  }

  /**
   * 加载配置
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      this.logger.debug('开始加载配置文件', { path: this.configPath });

      // 确保配置文件存在
      await this.ensureConfigFile();

      // 读取并解析配置文件
      const configContent = readFileSync(this.configPath, 'utf8');
      const rawConfig = parseToml(configContent);

      // 验证并设置默认值
      const validatedConfig = AppConfigSchema.parse(rawConfig);
      this.config = validatedConfig;

      this.logger.info('配置加载成功', {
        sections: Object.keys(validatedConfig),
        debug: validatedConfig.app.debug
      });

      // 启动热重载监听
      if (validatedConfig.advanced.hot_reload && !this.isWatching) {
        this.startWatching();
      }

      return validatedConfig;
    } catch (error) {
      this.logger.error('配置加载失败', { error: error instanceof Error ? error.message : String(error) });

      // 检查是否是关键错误，如果是则直接抛出
      if (error instanceof Error && error.message.includes('配置模板文件不存在')) {
        throw error;
      }

      // 返回默认配置
      const defaultConfig = this.getDefaultConfig();
      this.config = defaultConfig;

      this.logger.warn('使用默认配置');
      return defaultConfig;
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new ConfigError('配置尚未加载，请先调用 loadConfig()');
    }
    return this.config;
  }

  /**
   * 获取指定配置段
   */
  getSection<T extends keyof AppConfig>(section: T): AppConfig[T] {
    const config = this.getConfig();
    return config[section];
  }

  /**
   * 更新配置
   */
  async updateConfig(updates: DeepPartial<AppConfig>): Promise<void> {
    try {
      if (!this.config) {
        throw new ConfigError('配置尚未加载，无法更新');
      }

      // 备份当前配置
      if (this.config.advanced.config_backup) {
        await this.backupConfig();
      }

      // 合并配置
      const mergedConfig = this.mergeConfig(this.config, updates);

      // 验证新配置
      const validatedConfig = AppConfigSchema.parse(mergedConfig);

      // 保存配置
      await this.saveConfig(validatedConfig);

      // 更新内存中的配置
      this.config = validatedConfig;

      this.logger.info('配置更新成功', { updatedSections: Object.keys(updates) });
      this.emit('configChanged', validatedConfig);
    } catch (error) {
      this.logger.error('配置更新失败', { error: error instanceof Error ? error.message : String(error) });
      throw new ConfigError('配置更新失败', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 重新加载配置
   */
  async reload(): Promise<void> {
    this.logger.info('重新加载配置');
    await this.loadConfig();
    this.emit('configReloaded', this.config);
  }

  /**
   * 保存配置到文件
   */
  async saveConfig(config: AppConfig = this.getConfig()): Promise<void> {
    try {
      const tomlContent = stringifyToml(config);
      writeFileSync(this.configPath, tomlContent, 'utf8');
      this.logger.debug('配置已保存到文件', { path: this.configPath });
    } catch (error) {
      this.logger.error('保存配置失败', { error: error instanceof Error ? error.message : String(error) });
      throw new ConfigError('保存配置失败', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 确保配置文件存在
   */
  private async ensureConfigFile(): Promise<void> {
    if (existsSync(this.configPath)) {
      return;
    }

    this.logger.info('配置文件不存在，从模板创建', {
      configPath: this.configPath,
      templatePath: this.templatePath
    });

    if (!existsSync(this.templatePath)) {
      throw new ConfigError(`配置模板文件不存在: ${this.templatePath}`);
    }

    try {
      copyFileSync(this.templatePath, this.configPath);
      this.logger.info('配置文件创建成功', { path: this.configPath });
    } catch (error) {
      throw new ConfigError('创建配置文件失败', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): AppConfig {
    return AppConfigSchema.parse({
      app: {},
      logging: {},
      minecraft: {},
      agent: {},
      plugins: {},
      advanced: {}
    });
  }

  /**
   * 深度合并配置对象
   */
  private mergeConfig(base: AppConfig, updates: DeepPartial<AppConfig>): AppConfig {
    const result = { ...base };

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;

      const sectionKey = key as keyof AppConfig;
      if (sectionKey in result && typeof result[sectionKey] === 'object' && typeof value === 'object' && !Array.isArray(value) && value !== null) {
        result[sectionKey] = { ...result[sectionKey], ...value } as any;
      } else {
        result[sectionKey] = value as any;
      }
    }

    return result;
  }

  /**
   * 备份配置文件
   */
  private async backupConfig(): Promise<void> {
    try {
      if (!existsSync(this.configPath)) {
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${basename(this.configPath, '.toml')}-${timestamp}.toml`;
      const backupFilePath = join(dirname(this.configPath), backupFileName);

      copyFileSync(this.configPath, backupFilePath);

      // 清理旧备份
      await this.cleanupOldBackups();

      this.logger.debug('配置备份成功', { backupPath: backupFilePath });
    } catch (error) {
      this.logger.warn('配置备份失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 清理旧备份文件
   */
  private async cleanupOldBackups(): Promise<void> {
    // 这里可以实现备份文件清理逻辑
    // 为简化起见，暂时跳过实现
  }

  /**
   * 启动文件监听
   */
  private startWatching(): void {
    if (this.isWatching) {
      return;
    }

    try {
      watchFile(this.configPath, { interval: 1000 }, () => {
        this.handleConfigFileChange();
      });
      this.isWatching = true;
      this.logger.debug('开始监听配置文件变化', { path: this.configPath });
    } catch (error) {
      this.logger.warn('启动配置文件监听失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 停止文件监听
   */
  private stopWatching(): void {
    if (!this.isWatching) {
      return;
    }

    try {
      unwatchFile(this.configPath);
      this.isWatching = false;
      this.logger.debug('停止监听配置文件变化', { path: this.configPath });
    } catch (error) {
      this.logger.warn('停止配置文件监听失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 处理配置文件变化
   */
  private handleConfigFileChange(): void {
    // 防抖处理
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
    }

    this.watchDebounceTimer = setTimeout(async () => {
      try {
        this.logger.info('检测到配置文件变化，重新加载');
        await this.reload();
      } catch (error) {
        this.logger.error('重新加载配置失败', { error: error instanceof Error ? error.message : String(error) });
      }
    }, this.WATCH_DEBOUNCE_DELAY);
  }

  /**
   * 关闭配置管理器
   */
  close(): void {
    this.stopWatching();
    // 清除防抖定时器
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = undefined;
    }
    this.removeAllListeners();
    this.logger.info('配置管理器已关闭');
  }
}

/**
 * 全局配置管理器实例
 */
let globalConfigManager: ConfigManager | null = null;

/**
 * 获取全局配置管理器
 */
export function getConfigManager(configPath?: string, templatePath?: string): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(configPath, templatePath);
  }
  return globalConfigManager;
}

/**
 * 初始化全局配置
 */
export async function initializeConfig(configPath?: string, templatePath?: string): Promise<AppConfig> {
  const manager = getConfigManager(configPath, templatePath);
  return await manager.loadConfig();
}

/**
 * 获取配置
 */
export function getConfig(): AppConfig {
  const manager = getConfigManager();
  return manager.getConfig();
}

/**
 * 获取配置段
 */
export function getSection<T extends keyof AppConfig>(section: T): AppConfig[T] {
  const manager = getConfigManager();
  return manager.getSection(section);
}

/**
 * 更新配置
 */
export async function updateConfig(updates: DeepPartial<AppConfig>): Promise<void> {
  const manager = getConfigManager();
  await manager.updateConfig(updates);
}