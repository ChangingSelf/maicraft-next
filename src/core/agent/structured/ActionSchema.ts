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

// ===== 导出所有结构化响应类型 =====
export type { ExperienceSummaryResponse, ExperienceLesson, PlanGenerationResponse, PlanTaskDefinition, TaskEvaluationResponse };

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
              ActionIds.MINE_AT_POSITION,
              ActionIds.MINE_BY_TYPE,
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
          // MineAtPosition
          {
            properties: {
              action_type: { const: ActionIds.MINE_AT_POSITION },
              x: { type: 'number', description: '目标X坐标' },
              y: { type: 'number', description: '目标Y坐标' },
              z: { type: 'number', description: '目标Z坐标' },
              count: { type: 'number', description: '挖掘数量', default: 1 },
              force: { type: 'boolean', description: '强制挖掘，绕过安全检查', default: false },
              collect: { type: 'boolean', description: '是否收集掉落物', default: true },
            },
            required: ['action_type', 'x', 'y', 'z'],
          },
          // MineByType
          {
            properties: {
              action_type: { const: ActionIds.MINE_BY_TYPE },
              blockType: { type: 'string', description: '方块类型名称' },
              count: { type: 'number', description: '挖掘数量', default: 1 },
              radius: { type: 'number', description: '搜索半径', default: 32 },
              direction: { type: 'string', description: '挖掘方向', enum: ['+x', '-x', '+y', '-y', '+z', '-z'] },
              force: { type: 'boolean', description: '强制挖掘，绕过安全检查', default: false },
              collect: { type: 'boolean', description: '是否收集掉落物', default: true },
            },
            required: ['action_type', 'blockType'],
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
              count: { type: 'number', description: '挖掘数量', default: 10 },
              force: { type: 'boolean', description: '强制挖掘，绕过安全检查', default: false },
              collect: { type: 'boolean', description: '是否收集掉落物', default: true },
            },
            required: ['action_type', 'direction'],
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

/**
 * 规划生成响应结构
 */
export interface PlanGenerationResponse {
  title: string; // 计划标题
  description: string; // 计划描述
  tasks: PlanTaskDefinition[]; // 任务列表
}

/**
 * 计划中的任务定义
 */
export interface PlanTaskDefinition {
  title: string; // 任务标题
  description: string; // 任务描述
  tracker: any; // 追踪器配置（JSON格式）
  dependencies: string[]; // 依赖任务的索引（字符串数组）
}

/**
 * 规划生成的 JSON Schema
 */
export const PLAN_GENERATION_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: '计划的标题，简洁明确地描述这个计划要做什么',
    },
    description: {
      type: 'string',
      description: '计划的详细描述，包含总体思路和预期结果',
    },
    tasks: {
      type: 'array',
      description: '计划包含的任务列表，按执行顺序排列',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '任务标题，简短描述这个任务要做什么',
          },
          description: {
            type: 'string',
            description: '任务的详细描述，说明如何完成这个任务',
          },
          tracker: {
            type: 'object',
            description: '任务追踪器配置，用于自动检测任务完成状态',
            properties: {
              type: {
                type: 'string',
                enum: ['inventory', 'craft', 'location', 'composite'],
                description: '追踪器类型',
              },
            },
            required: ['type'],
            oneOf: [
              {
                properties: {
                  type: { const: 'inventory' },
                  itemName: { type: 'string', description: '物品名称（游戏内部名称）' },
                  targetCount: { type: 'number', description: '目标数量', minimum: 1 },
                  exact: { type: 'boolean', description: '是否需要精确数量', default: false },
                },
                required: ['type', 'itemName', 'targetCount'],
              },
              {
                properties: {
                  type: { const: 'craft' },
                  itemName: { type: 'string', description: '要合成的物品名称（游戏内部名称）' },
                  targetCount: { type: 'number', description: '目标合成数量', minimum: 1 },
                },
                required: ['type', 'itemName', 'targetCount'],
              },
              {
                properties: {
                  type: { const: 'location' },
                  targetX: { type: 'number', description: 'X坐标' },
                  targetY: { type: 'number', description: 'Y坐标' },
                  targetZ: { type: 'number', description: 'Z坐标' },
                  radius: { type: 'number', description: '到达半径', default: 2 },
                },
                required: ['type', 'targetX', 'targetY', 'targetZ'],
              },
              {
                properties: {
                  type: { const: 'composite' },
                  logic: {
                    type: 'string',
                    enum: ['and', 'or'],
                    description: '组合逻辑：and表示所有子任务都要完成，or表示完成其中之一即可',
                  },
                  trackers: {
                    type: 'array',
                    description: '子追踪器列表',
                    items: { type: 'object' },
                    minItems: 1,
                  },
                },
                required: ['type', 'logic', 'trackers'],
              },
            ],
          },
          dependencies: {
            type: 'array',
            description: '依赖的任务索引列表（从0开始），该任务必须在依赖任务完成后才能开始',
            items: { type: 'string' },
            default: [],
          },
        },
        required: ['title', 'description', 'tracker'],
      },
      minItems: 1,
    },
  },
  required: ['title', 'description', 'tasks'],
};

/**
 * 任务评估响应结构
 */
export interface TaskEvaluationResponse {
  task_status: 'on_track' | 'struggling' | 'blocked' | 'needs_adjustment'; // 任务状态
  progress_assessment: string; // 进度评估，简短描述当前进展
  issues: string[]; // 遇到的问题列表
  suggestions: string[]; // 改进建议列表
  should_replan: boolean; // 是否需要重新规划
  should_skip_task: boolean; // 是否应该跳过当前任务
  estimated_completion_time?: number; // 预计完成时间（分钟）
  confidence: number; // 评估的置信度 0-1
}

/**
 * 任务评估记录（存储在任务元数据中）
 */
export interface TaskEvaluationRecord {
  timestamp: number; // 评估时间戳
  status: 'on_track' | 'struggling' | 'blocked' | 'needs_adjustment'; // 评估时任务状态
  assessment: string; // 进度评估描述
  issues: string[]; // 发现的问题
  suggestions: string[]; // 改进建议
  should_replan: boolean; // 是否需要重新规划
  should_skip_task: boolean; // 是否应该跳过任务
  confidence: number; // 评估置信度
}

/**
 * 任务评估的 JSON Schema
 */
export const TASK_EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    task_status: {
      type: 'string',
      enum: ['on_track', 'struggling', 'blocked', 'needs_adjustment'],
      description: '任务状态：on_track(进展顺利)、struggling(遇到困难)、blocked(完全阻塞)、needs_adjustment(需要调整)',
    },
    progress_assessment: {
      type: 'string',
      description: '对当前进度的简短评估，说明任务完成到什么程度',
    },
    issues: {
      type: 'array',
      description: '遇到的具体问题列表',
      items: {
        type: 'string',
        description: '具体问题描述，例如"缺少铁镐"、"找不到石头"、"物品栏已满"',
      },
      default: [],
    },
    suggestions: {
      type: 'array',
      description: '改进建议列表，说明如何解决问题或改进策略',
      items: {
        type: 'string',
        description: '具体建议，例如"先合成铁镐"、"向北探索寻找石山"、"清理物品栏"',
      },
      default: [],
    },
    should_replan: {
      type: 'boolean',
      description: '是否需要重新生成计划。如果当前计划明显不可行或存在严重问题，应该设为true',
      default: false,
    },
    should_skip_task: {
      type: 'boolean',
      description: '是否应该跳过当前任务。如果任务不可能完成或不再必要，应该设为true',
      default: false,
    },
    estimated_completion_time: {
      type: 'number',
      description: '预计任务完成时间（分钟），如果无法估计可以不提供',
      minimum: 0,
    },
    confidence: {
      type: 'number',
      description: '对这次评估的置信度，范围0.0-1.0',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['task_status', 'progress_assessment', 'confidence'],
};
