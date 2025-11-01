/**
 * LLM模块导出文件
 *
 * 提供统一的导出接口
 */

// 核心类型和接口
export * from './types.js';

// 管理器
export { LLMManager, createLLMManager, getLLMManager, closeLLMManager } from './LLMManager.js';

// 用量追踪
export { UsageTracker } from './usage/UsageTracker.js';

// 提供商
export { OpenAIProvider } from './providers/OpenAIProvider.js';

// 便捷函数和工具
export {
  // 类型验证
  LLMConfigSchema,
  ChatMessageSchema,
  LLMRequestConfigSchema,
} from './types.js';

/**
 * 创建默认LLM管理器的便捷函数
 */
export function createDefaultLLMManager() {
  const { ConfigManager } = require('../utils/Config.js');
  const configManager = new ConfigManager();
  const config = configManager.getConfig();
  return createLLMManager(config.llm);
}

/**
 * LLM模块版本信息
 */
export const LLM_MODULE_VERSION = '1.0.0';

/**
 * 支持的提供商列表
 */
export const SUPPORTED_PROVIDERS = [
  'openai',
  'azure', // TODO: 实现
  'anthropic', // TODO: 实现
] as const;
