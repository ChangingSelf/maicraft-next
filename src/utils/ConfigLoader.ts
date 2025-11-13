/**
 * 配置加载器
 * 统一管理配置文件的加载
 */

import type { AppConfig } from './Config';
import { initializeConfig } from './Config';

export class ConfigLoader {
  /**
   * 加载配置文件
   */
  async loadConfig(configPath?: string, templatePath?: string): Promise<AppConfig> {
    return await initializeConfig(configPath, templatePath);
  }

  /**
   * 加载默认配置
   */
  async loadDefaultConfig(): Promise<AppConfig> {
    return await this.loadConfig('./config.toml', './config-template.toml');
  }
}

/**
 * 默认的 ConfigLoader 实例
 * @deprecated 使用DI容器：container.resolve(ServiceKeys.ConfigLoader)
 */
export const configLoader = new ConfigLoader();
