/**
 * 服务键定义
 *
 * 使用 Symbol 作为服务键，确保类型安全和唯一性
 */

/**
 * 服务键
 */
export const ServiceKeys = {
  // 核心基础设施
  Config: Symbol('Config'),
  Logger: Symbol('Logger'),
  Bot: Symbol('Bot'),

  // 状态和上下文
  GameState: Symbol('GameState'),
  ContextManager: Symbol('ContextManager'),

  // 事件系统
  EventManager: Symbol('EventManager'),

  // 缓存系统
  BlockCache: Symbol('BlockCache'),
  ContainerCache: Symbol('ContainerCache'),
  CacheManager: Symbol('CacheManager'),
  LocationManager: Symbol('LocationManager'),
  NearbyBlockManager: Symbol('NearbyBlockManager'),

  // 动作系统
  ActionExecutor: Symbol('ActionExecutor'),

  // LLM 系统
  LLMManager: Symbol('LLMManager'),

  // AI 代理系统
  Agent: Symbol('Agent'),
  MemoryManager: Symbol('MemoryManager'),
  GoalPlanningManager: Symbol('GoalPlanningManager'),
  ModeManager: Symbol('ModeManager'),
  InterruptController: Symbol('InterruptController'),

  // 决策循环
  MainDecisionLoop: Symbol('MainDecisionLoop'),
  ChatLoop: Symbol('ChatLoop'),

  // 结构化输出
  StructuredOutputManager: Symbol('StructuredOutputManager'),

  // 工厂服务
  TrackerFactory: Symbol('TrackerFactory'),
  LoggerFactory: Symbol('LoggerFactory'),
  ConfigLoader: Symbol('ConfigLoader'),

  // 工具服务
  PromptManager: Symbol('PromptManager'),
  PlaceBlockUtils: Symbol('PlaceBlockUtils'),
  MovementUtils: Symbol('MovementUtils'),

  /** LLM用量追踪器 */
  UsageTracker: Symbol('UsageTracker'),

  // 中断信号
  InterruptSignal: Symbol('InterruptSignal'),

  // API 服务
  WebSocketServer: Symbol('WebSocketServer'),
  WebSocketManager: Symbol('WebSocketManager'),
} as const;

/**
 * 服务键类型
 */
export type ServiceKey = (typeof ServiceKeys)[keyof typeof ServiceKeys];

/**
 * 服务类型映射（用于类型推断）
 *
 * 使用示例：
 * ```ts
 * const agent = container.resolve<ServiceTypeMap[typeof ServiceKeys.Agent]>(ServiceKeys.Agent);
 * ```
 */
export interface ServiceTypeMap {
  [ServiceKeys.Config]: import('@/utils/Config').AppConfig;
  [ServiceKeys.Logger]: import('@/utils/Logger').Logger;
  [ServiceKeys.Bot]: import('mineflayer').Bot;
  [ServiceKeys.GameState]: import('@/core/state/GameState').GameState;
  [ServiceKeys.ContextManager]: import('@/core/context/ContextManager').ContextManager;
  [ServiceKeys.EventManager]: import('@/core/events/EventManager').EventManager;
  [ServiceKeys.BlockCache]: import('@/core/cache/BlockCache').BlockCache;
  [ServiceKeys.ContainerCache]: import('@/core/cache/ContainerCache').ContainerCache;
  [ServiceKeys.CacheManager]: import('@/core/cache/CacheManager').CacheManager;
  [ServiceKeys.LocationManager]: import('@/core/cache/LocationManager').LocationManager;
  [ServiceKeys.NearbyBlockManager]: import('@/core/cache/NearbyBlockManager').NearbyBlockManager;
  [ServiceKeys.ActionExecutor]: import('@/core/actions/ActionExecutor').ActionExecutor;
  [ServiceKeys.LLMManager]: import('@/llm/LLMManager').LLMManager;
  [ServiceKeys.Agent]: import('@/core/agent/Agent').Agent;
  [ServiceKeys.MemoryManager]: import('@/core/agent/memory/MemoryManager').MemoryManager;
  [ServiceKeys.GoalPlanningManager]: import('@/core/agent/planning/GoalPlanningManager').GoalPlanningManager;
  [ServiceKeys.ModeManager]: import('@/core/agent/mode/ModeManager').ModeManager;
  [ServiceKeys.InterruptController]: import('@/core/agent/InterruptController').InterruptController;
  [ServiceKeys.MainDecisionLoop]: import('@/core/agent/loop/MainDecisionLoop').MainDecisionLoop;
  [ServiceKeys.ChatLoop]: import('@/core/agent/loop/ChatLoop').ChatLoop;
  [ServiceKeys.StructuredOutputManager]: import('@/core/agent/structured/StructuredOutputManager').StructuredOutputManager;
  [ServiceKeys.TrackerFactory]: import('@/core/agent/planning/trackers/TrackerFactory').TrackerFactory;
  [ServiceKeys.LoggerFactory]: import('@/utils/Logger').LoggerFactory;
  [ServiceKeys.ConfigLoader]: import('@/utils/Config').ConfigLoader;
  [ServiceKeys.PromptManager]: import('@/core/agent/prompt/prompt_manager').PromptManager;
  [ServiceKeys.PlaceBlockUtils]: import('@/utils/PlaceBlockUtils').PlaceBlockUtils;
  [ServiceKeys.MovementUtils]: import('@/utils/MovementUtils').MovementUtils;
  [ServiceKeys.UsageTracker]: import('@/llm/usage/UsageTracker').UsageTracker;
  [ServiceKeys.InterruptSignal]: import('@/core/interrupt/InterruptSignal').InterruptSignal;
  [ServiceKeys.WebSocketServer]: import('@/api/WebSocketServer').WebSocketServer;
  [ServiceKeys.WebSocketManager]: import('@/api/WebSocketManager').WebSocketManager;
}
