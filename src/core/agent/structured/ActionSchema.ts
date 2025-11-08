/**
 * 动作的 JSON Schema 定义
 * 用于 LLM 结构化输出，确保返回的动作格式正确
 */

import { ActionIds } from '@/core/actions/ActionIds';

/**
 * 单个动作的通用结构
 */
export interface StructuredAction {
  intention: string; // 动作意图描述
  action_type: string; // 动作类型
  [key: string]: any; // 其他参数
}

/**
 * LLM 响应结构
 */
export interface StructuredLLMResponse {
  thinking?: string; // 思考过程（可选）
  actions: StructuredAction[]; // 动作列表
}

/**
 * 完整的动作 JSON Schema
 * 用于 OpenAI Function Calling / Structured Output
 */
export const ACTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    thinking: {
      type: 'string',
      description: '你的思考过程和决策理由，简短说明为什么执行这些动作',
    },
    actions: {
      type: 'array',
      description: '要执行的动作列表，按顺序执行',
      items: {
        type: 'object',
        properties: {
          intention: {
            type: 'string',
            description: '这个动作的意图，用一句话说明目的，例如"前往村庄寻找村民"',
          },
          action_type: {
            type: 'string',
            description: '动作类型',
            enum: [
              ActionIds.MOVE,
              ActionIds.FIND_BLOCK,
              ActionIds.MINE_BLOCK,
              ActionIds.MINE_BLOCK_BY_POSITION,
              ActionIds.MINE_IN_DIRECTION,
              ActionIds.PLACE_BLOCK,
              ActionIds.CRAFT,
              ActionIds.USE_CHEST,
              ActionIds.USE_FURNACE,
              ActionIds.EAT,
              ActionIds.TOSS_ITEM,
              ActionIds.KILL_MOB,
              ActionIds.SET_LOCATION,
              ActionIds.CHAT,
              ActionIds.SWIM_TO_LAND,
            ],
          },
        },
        required: ['intention', 'action_type'],
        // 使用 oneOf 来定义不同动作类型的具体参数
        oneOf: [
          // Move
          {
            properties: {
              action_type: { const: ActionIds.MOVE },
              x: { type: 'number', description: 'X坐标' },
              y: { type: 'number', description: 'Y坐标' },
              z: { type: 'number', description: 'Z坐标' },
              timeout: { type: 'number', description: '超时时间（秒）', default: 60 },
            },
            required: ['action_type', 'x', 'y', 'z'],
          },
          // FindBlock
          {
            properties: {
              action_type: { const: ActionIds.FIND_BLOCK },
              block: { type: 'string', description: '要寻找的方块名称' },
              radius: { type: 'number', description: '搜索半径', default: 16 },
              count: { type: 'number', description: '寻找数量', default: 1 },
            },
            required: ['action_type', 'block'],
          },
          // MineBlock
          {
            properties: {
              action_type: { const: ActionIds.MINE_BLOCK },
              name: { type: 'string', description: '要挖掘的方块名称' },
              count: { type: 'number', description: '挖掘数量', default: 1 },
            },
            required: ['action_type', 'name'],
          },
          // MineBlockByPosition
          {
            properties: {
              action_type: { const: ActionIds.MINE_BLOCK_BY_POSITION },
              x: { type: 'number', description: 'X坐标' },
              y: { type: 'number', description: 'Y坐标' },
              z: { type: 'number', description: 'Z坐标' },
            },
            required: ['action_type', 'x', 'y', 'z'],
          },
          // MineInDirection
          {
            properties: {
              action_type: { const: ActionIds.MINE_IN_DIRECTION },
              direction: {
                type: 'string',
                enum: ['+x', '-x', '+y', '-y', '+z', '-z'],
                description: '挖掘方向',
              },
              timeout: { type: 'number', description: '持续时间（秒）' },
            },
            required: ['action_type', 'direction', 'timeout'],
          },
          // PlaceBlock
          {
            properties: {
              action_type: { const: ActionIds.PLACE_BLOCK },
              block: { type: 'string', description: '要放置的方块名称' },
              x: { type: 'number', description: 'X坐标' },
              y: { type: 'number', description: 'Y坐标' },
              z: { type: 'number', description: 'Z坐标' },
            },
            required: ['action_type', 'block', 'x', 'y', 'z'],
          },
          // Craft
          {
            properties: {
              action_type: { const: ActionIds.CRAFT },
              item: { type: 'string', description: '要合成的物品名称' },
              count: { type: 'number', description: '合成数量', default: 1 },
            },
            required: ['action_type', 'item'],
          },
          // UseChest
          {
            properties: {
              action_type: { const: ActionIds.USE_CHEST },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                required: ['x', 'y', 'z'],
                description: '箱子位置',
              },
            },
            required: ['action_type', 'position'],
          },
          // UseFurnace
          {
            properties: {
              action_type: { const: ActionIds.USE_FURNACE },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                required: ['x', 'y', 'z'],
                description: '熔炉位置',
              },
            },
            required: ['action_type', 'position'],
          },
          // Eat
          {
            properties: {
              action_type: { const: ActionIds.EAT },
              item: { type: 'string', description: '要食用的物品名称' },
            },
            required: ['action_type', 'item'],
          },
          // TossItem
          {
            properties: {
              action_type: { const: ActionIds.TOSS_ITEM },
              item: { type: 'string', description: '要丢弃的物品名称' },
              count: { type: 'number', description: '丢弃数量' },
            },
            required: ['action_type', 'item', 'count'],
          },
          // KillMob
          {
            properties: {
              action_type: { const: ActionIds.KILL_MOB },
              entity: { type: 'string', description: '要击杀的实体名称' },
              timeout: { type: 'number', description: '超时时间（秒）', default: 30 },
            },
            required: ['action_type', 'entity'],
          },
          // SetLocation
          {
            properties: {
              action_type: { const: ActionIds.SET_LOCATION },
              type: {
                type: 'string',
                enum: ['set', 'delete', 'update'],
                description: '地标操作类型',
              },
              name: { type: 'string', description: '地标名称' },
              info: { type: 'string', description: '地标描述信息' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                description: '地标位置',
              },
            },
            required: ['action_type', 'type', 'name'],
          },
          // Chat
          {
            properties: {
              action_type: { const: ActionIds.CHAT },
              message: { type: 'string', description: '要发送的聊天消息' },
            },
            required: ['action_type', 'message'],
          },
          // SwimToLand
          {
            properties: {
              action_type: { const: ActionIds.SWIM_TO_LAND },
            },
            required: ['action_type'],
          },
        ],
      },
      minItems: 1,
    },
  },
  required: ['actions'],
  additionalProperties: false,
};

/**
 * 箱子操作的 JSON Schema
 */
export const CHEST_OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    thinking: {
      type: 'string',
      description: '你的思考过程，说明为什么这样操作箱子',
    },
    actions: {
      type: 'array',
      description: '要执行的箱子操作列表',
      items: {
        type: 'object',
        properties: {
          action_type: {
            type: 'string',
            enum: ['take_items', 'put_items'],
            description: '操作类型：取出或放入',
          },
          item: {
            type: 'string',
            description: '物品名称',
          },
          count: {
            type: 'number',
            description: '物品数量',
            minimum: 1,
          },
        },
        required: ['action_type', 'item', 'count'],
      },
      minItems: 1,
    },
  },
  required: ['actions'],
};

/**
 * 熔炉操作的 JSON Schema
 */
export const FURNACE_OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    thinking: {
      type: 'string',
      description: '你的思考过程，说明为什么这样操作熔炉',
    },
    actions: {
      type: 'array',
      description: '要执行的熔炉操作列表',
      items: {
        type: 'object',
        properties: {
          action_type: {
            type: 'string',
            enum: ['take_items', 'put_items'],
            description: '操作类型：取出或放入',
          },
          slot: {
            type: 'string',
            enum: ['input', 'fuel', 'output'],
            description: '槽位：input(输入)、fuel(燃料)、output(输出)',
          },
          item: {
            type: 'string',
            description: '物品名称',
          },
          count: {
            type: 'number',
            description: '物品数量',
            minimum: 1,
          },
        },
        required: ['action_type', 'slot', 'item', 'count'],
      },
      minItems: 1,
    },
  },
  required: ['actions'],
};

/**
 * 经验总结响应结构
 */
export interface ExperienceSummaryResponse {
  analysis?: string; // 总体分析（可选）
  lessons: ExperienceLesson[]; // 经验教训列表
}

/**
 * 单条经验教训
 */
export interface ExperienceLesson {
  lesson: string; // 经验内容，简短描述（不超过100字）
  context: string; // 经验来源或适用场景
  confidence: number; // 置信度 0-1
}

/**
 * 经验总结的 JSON Schema
 */
export const EXPERIENCE_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      description: '对最近决策和思维的总体分析，简短说明主要模式和问题',
    },
    lessons: {
      type: 'array',
      description: '从实践中提取的具体经验教训列表',
      items: {
        type: 'object',
        properties: {
          lesson: {
            type: 'string',
            description: '经验内容，用一句简短的话描述（不超过100字），例如："铁镐的游戏名称是iron_pickaxe"、"熔炉需要8个圆石合成"',
          },
          context: {
            type: 'string',
            description: '经验的来源或适用场景，简短说明',
          },
          confidence: {
            type: 'number',
            description: '对这条经验的置信度，范围0.0-1.0',
            minimum: 0,
            maximum: 1,
          },
        },
        required: ['lesson', 'context', 'confidence'],
      },
      minItems: 1,
    },
  },
  required: ['lessons'],
};
