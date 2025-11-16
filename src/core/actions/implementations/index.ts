/**
 * 动作实现导出
 *
 * 所有已实现的动作
 */

// P0 核心动作
export * from './ChatAction';
export * from './MoveAction';
export * from './FindBlockAction';
export * from './PlaceBlockAction';
export * from './CraftItemAction';

// 新的挖掘系统
export * from './MineAtPositionAction';
export * from './MineByTypeAction';
export * from './MineInDirectionAction';

// 容器操作
export * from './UseChestAction';
export * from './UseFurnaceAction';

// 生存相关
export * from './EatAction';
export * from './TossItemAction';
export * from './KillMobAction';

// 移动和探索
export * from './MoveToLocationAction';
export * from './MoveToEntityAction';
export * from './MoveToBlockAction';
export * from './SwimToLandAction';

// 地标管理
export * from './SetLocationAction';
