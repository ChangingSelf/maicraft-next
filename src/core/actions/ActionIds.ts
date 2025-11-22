/**
 * 动作 ID 常量（避免硬编码字符串）
 *
 * 使用常量的优势:
 * - 类型安全，编译时检查
 * - 避免拼写错误
 * - IDE 自动补全
 * - 重构友好
 */

export const ActionIds = {
  // 移动和探索
  MOVE: 'move',
  MOVE_TO_LOCATION: 'move_to_location',
  MOVE_TO_ENTITY: 'move_to_entity',
  MOVE_TO_BLOCK: 'move_to_block',
  FIND_BLOCK: 'find_block',

  // 新的挖掘系统
  MINE_AT_POSITION: 'mine_at_position',
  MINE_BY_TYPE: 'mine_by_type',
  MINE_IN_DIRECTION: 'mine_in_direction',

  // 建造和合成
  PLACE_BLOCK: 'place_block',
  CRAFT: 'craft',

  // 容器操作
  USE_CHEST: 'use_chest', // 直接操作箱子（批量存取）
  USE_FURNACE: 'use_furnace', // 直接操作熔炉
  OPEN_CHEST_GUI: 'open_chest_gui', // 打开箱子GUI模式（触发器）
  OPEN_FURNACE_GUI: 'open_furnace_gui', // 打开熔炉GUI模式（触发器）
  QUERY_CONTAINER: 'query_container', // GUI模式内查询容器
  MANAGE_CONTAINER: 'manage_container', // GUI模式内管理容器

  // 生存
  EAT: 'eat',
  TOSS_ITEM: 'toss_item',
  KILL_MOB: 'kill_mob',

  // 地标和交流
  SET_LOCATION: 'set_location',
  CHAT: 'chat',
  SWIM_TO_LAND: 'swim_to_land',
} as const;

/**
 * 动作 ID 类型
 */
export type ActionId = (typeof ActionIds)[keyof typeof ActionIds];

/**
 * 方向枚举
 */
export enum Direction {
  PLUS_X = '+x',
  MINUS_X = '-x',
  PLUS_Y = '+y',
  MINUS_Y = '-y',
  PLUS_Z = '+z',
  MINUS_Z = '-z',
}

/**
 * 地标操作类型
 */
export enum LocationActionType {
  SET = 'set',
  DELETE = 'delete',
  UPDATE = 'update',
}
