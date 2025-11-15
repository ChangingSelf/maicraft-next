/**
 * 动作系统类型定义
 */

import { Vec3 } from 'vec3';
import { ActionIds, Direction, LocationActionType } from './ActionIds';

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
 * MineBlock 动作参数
 */
export interface MineBlockParams {
  name?: string;
  count?: number;
}

/**
 * MineBlockByPosition 动作参数
 */
export interface MineBlockByPositionParams {
  x: number;
  y: number;
  z: number;
}

/**
 * MineInDirection 动作参数
 */
export interface MineInDirectionParams {
  direction: Direction;
  timeout: number;
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
  item: string;                    // 物品名称（必需）
  count?: number;                  // 合成数量（默认1，可选）
  requiredMaterials?: string[];    // 指定使用的材料（可选）
  maxComplexity?: number;          // 最大合成复杂度（默认10，可选）
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
  [ActionIds.MINE_BLOCK]: MineBlockParams;
  [ActionIds.MINE_BLOCK_BY_POSITION]: MineBlockByPositionParams;
  [ActionIds.MINE_IN_DIRECTION]: MineInDirectionParams;
  [ActionIds.PLACE_BLOCK]: PlaceBlockParams;
  [ActionIds.CRAFT]: CraftParams;
  [ActionIds.USE_CHEST]: UseChestParams;
  [ActionIds.USE_FURNACE]: UseFurnaceParams;
  [ActionIds.EAT]: EatParams;
  [ActionIds.TOSS_ITEM]: TossItemParams;
  [ActionIds.KILL_MOB]: KillMobParams;
  [ActionIds.SET_LOCATION]: SetLocationParams;
  [ActionIds.CHAT]: ChatParams;
  [ActionIds.SWIM_TO_LAND]: SwimToLandParams;
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
