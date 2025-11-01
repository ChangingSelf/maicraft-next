/**
 * 动作实现导出
 *
 * 所有已实现的动作
 */

// P0 核心动作
export * from './ChatAction';
export * from './MoveAction';
export * from './FindBlockAction';
export * from './MineBlockAction';
export * from './MineBlockByPositionAction';
export * from './PlaceBlockAction';
export * from './CraftItemAction';

// 容器操作
export * from './UseChestAction';
export * from './UseFurnaceAction';

// 生存相关
export * from './EatAction';
export * from './TossItemAction';
export * from './KillMobAction';

// 移动和探索
export * from './SwimToLandAction';

// 地标管理
export * from './SetLocationAction';

// 挖掘
export * from './MineInDirectionAction';
