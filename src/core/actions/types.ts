/**
 * 动作系统类型定义
 */

import { Vec3 } from 'vec3';
import { ActionIds, LocationActionType } from './ActionIds';

/**
 * 基础动作参数
 */
export interface BaseActionParams {
  [key: string]: any;
}

/**
 * 动作结果
 */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: Error;
}

/**
 * Move 动作参数
 */
export interface MoveParams {
  x: number;
  y: number;
  z: number;
}

/**
 * FindBlock 动作参数
 */
export interface FindBlockParams {
  block: string;
  radius?: number;
  count?: number;
}

/**
 * PlaceBlock 动作参数
 */
export interface PlaceBlockParams {
  block: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Craft 动作参数
 */
export interface CraftParams {
  item: string; // 物品名称（必需）
  count?: number; // 合成数量（默认1，可选）
  requiredMaterials?: string[]; // 指定优先使用的材料类型（可选，会自动去重）。例如：["oak_planks"] 而非 ["oak_planks", "oak_planks", "oak_planks", "oak_planks"]
  maxComplexity?: number; // 最大合成复杂度（默认10，可选）
}

/**
 * UseChest 动作参数
 */
export interface UseChestParams {
  position: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * UseFurnace 动作参数
 */
export interface UseFurnaceParams {
  position: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * QueryContainer 动作参数
 */
export interface QueryContainerParams {
  position: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * ManageContainer 动作参数
 */
export interface ManageContainerParams {
  position: {
    x: number;
    y: number;
    z: number;
  };
  action: 'take_items' | 'put_items';
  item: string;
  count: number;
  slot?: string; // 可选，用于熔炉等有槽位的容器
}

/**
 * Eat 动作参数
 */
export interface EatParams {
  item: string;
}

/**
 * TossItem 动作参数
 */
export interface TossItemParams {
  item: string;
  count: number;
}

/**
 * KillMob 动作参数
 */
export interface KillMobParams {
  entity: string;
  timeout?: number;
}

/**
 * SetLocation 动作参数
 */
export interface SetLocationParams {
  type: LocationActionType;
  name: string;
  info?: string;
  position?: Vec3;
}

/**
 * Chat 动作参数
 */
export interface ChatParams {
  message: string;
}

/**
 * SwimToLand 动作参数
 */
export interface SwimToLandParams {
  // 无参数
}

// ===== 新的挖掘系统参数类型 =====

/**
 * MineAtPosition 动作参数
 */
export interface MineAtPositionParams {
  x: number; // 目标X坐标（必需）
  y: number; // 目标Y坐标（必需）
  z: number; // 目标Z坐标（必需）
  count?: number; // 挖掘数量（默认1，可选）
  force?: boolean; // 强制挖掘，绕过安全检查（默认false，可选）
  collect?: boolean; // 是否收集掉落物（默认true，可选）
}

/**
 * MineByType 动作参数
 */
export interface MineByTypeParams {
  blockType: string; // 方块类型名称（必需）
  count?: number; // 挖掘数量（默认1，可选）
  radius?: number; // 搜索半径（默认32，可选）
  direction?: string; // 挖掘方向（可选，支持"+x","-x","+y","-y","+z","-z"）
  force?: boolean; // 强制挖掘，绕过安全检查（默认false，可选）
  collect?: boolean; // 是否收集掉落物（默认true，可选）
}

/**
 * MineInDirection 动作参数（新版本）
 */
export interface MineInDirectionNewParams {
  direction: string; // 挖掘方向（必需，支持"+x","-x","+y","-y","+z","-z"）
  count?: number; // 挖掘数量（默认10，可选）
  force?: boolean; // 强制挖掘，绕过安全检查（默认false，可选）
  collect?: boolean; // 是否收集掉落物（默认true，可选）
}

/**
 * MoveToLocation 动作参数
 */
export interface MoveToLocationParams {
  locationName: string;
  reachDistance?: number;
  allowPartial?: boolean;
}

/**
 * MoveToEntity 动作参数
 */
export interface MoveToEntityParams {
  entityName: string;
  entityType: 'player' | 'mob' | 'animal' | 'hostile' | 'passive' | 'any';
  followDistance?: number;
  maxDistance?: number;
  continuous?: boolean;
}

/**
 * MoveToBlock 动作参数
 */
export interface MoveToBlockParams {
  blockType: string;
  reachDistance?: number;
  searchRadius?: number;
  allowPartial?: boolean;
}

/**
 * 动作参数类型映射
 */
export interface ActionParamsMap {
  [ActionIds.MOVE]: MoveParams;
  [ActionIds.MOVE_TO_LOCATION]: MoveToLocationParams;
  [ActionIds.MOVE_TO_ENTITY]: MoveToEntityParams;
  [ActionIds.MOVE_TO_BLOCK]: MoveToBlockParams;
  [ActionIds.FIND_BLOCK]: FindBlockParams;
  [ActionIds.PLACE_BLOCK]: PlaceBlockParams;
  [ActionIds.CRAFT]: CraftParams;
  [ActionIds.USE_CHEST]: UseChestParams;
  [ActionIds.USE_FURNACE]: UseFurnaceParams;
  [ActionIds.QUERY_CONTAINER]: QueryContainerParams;
  [ActionIds.MANAGE_CONTAINER]: ManageContainerParams;
  [ActionIds.EAT]: EatParams;
  [ActionIds.TOSS_ITEM]: TossItemParams;
  [ActionIds.KILL_MOB]: KillMobParams;
  [ActionIds.SET_LOCATION]: SetLocationParams;
  [ActionIds.CHAT]: ChatParams;
  [ActionIds.SWIM_TO_LAND]: SwimToLandParams;
  // 新的挖掘系统
  [ActionIds.MINE_AT_POSITION]: MineAtPositionParams;
  [ActionIds.MINE_BY_TYPE]: MineByTypeParams;
  [ActionIds.MINE_IN_DIRECTION]: MineInDirectionNewParams;
}

/**
 * 执行选项
 */
export interface ExecuteOptions {
  timeout?: number;
  priority?: number;
  canInterrupt?: boolean;
}

// ===== 合成系统相关类型定义 =====

/**
 * 合成选项接口
 */
export interface CraftOptions {
  requiredMaterials?: string[];
  maxComplexity?: number;
  currentDepth?: number;
}

/**
 * 材料选项接口（用于递归合成）
 */
export interface MaterialOptions extends CraftOptions {
  currentDepth: number;
}

/**
 * 材料需求信息
 */
export interface MaterialRequirement {
  name: string;
  count: number;
  have: number;
  need: number;
}

/**
 * 合成错误类型
 */
export const CRAFT_ERRORS = {
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
  RECIPE_NOT_FOUND: 'RECIPE_NOT_FOUND',
  INSUFFICIENT_MATERIALS: 'INSUFFICIENT_MATERIALS',
  CRAFTING_TABLE_REQUIRED: 'CRAFTING_TABLE_REQUIRED',
  CRAFT_FAILED: 'CRAFT_FAILED',
  COMPLEXITY_TOO_HIGH: 'COMPLEXITY_TOO_HIGH',
} as const;

export type CraftErrorCode = keyof typeof CRAFT_ERRORS;
