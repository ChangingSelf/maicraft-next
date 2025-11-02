/**
 * 游戏状态监听器接口
 *
 * 替代原maicraft的EnvironmentListener，适配本项目的GameState系统
 * 模式可实现此接口来实时响应游戏状态变化
 */

export interface GameStateListener {
  /**
   * 游戏状态更新时调用
   * @param gameState - 当前游戏状态
   * @param previousState - 上一次的游戏状态（可选）
   */
  onGameStateUpdated?(gameState: any, previousState?: any): Promise<void>;

  /**
   * 实体状态变化时调用
   * @param entities - 附近的实体列表
   */
  onEntitiesUpdated?(entities: any[]): Promise<void>;

  /**
   * 方块状态变化时调用
   * @param blocks - 附近的方块信息
   */
  onBlocksUpdated?(blocks: any[]): Promise<void>;

  /**
   * 库存状态变化时调用
   * @param inventory - 当前库存信息
   */
  onInventoryUpdated?(inventory: any): Promise<void>;

  /**
   * 健康状态变化时调用
   * @param health - 当前健康状态
   */
  onHealthUpdated?(health: { health: number; food: number; saturation: number }): Promise<void>;

  /**
   * 监听器名称，用于调试
   */
  readonly listenerName: string;

  /**
   * 是否启用监听器
   */
  readonly enabled: boolean;
}
