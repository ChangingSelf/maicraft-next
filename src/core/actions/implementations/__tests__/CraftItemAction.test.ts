/**
 * CraftItemAction 测试
 *
 * 测试智能合成动作的完整功能
 */

import { CraftItemAction } from '../CraftItemAction';
import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult } from '@/core/actions/types';

// Mock RuntimeContext
const createMockContext = (): RuntimeContext => ({
  bot: {
    version: '1.19.4',
    inventory: {
      items: jest.fn(() => []),
      findInventoryItem: jest.fn(),
    },
    blockAt: jest.fn(),
    findBlock: jest.fn(),
    placeBlock: jest.fn(),
    craft: jest.fn(),
    recipesFor: jest.fn(),
    entity: {
      position: { x: 0, y: 64, z: 0 }
    }
  } as any,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  gameState: {} as any,
  eventManager: {} as any,
  actionExecutor: {} as any,
  movementUtils: {
    moveToCoordinate: jest.fn()
  }
}) as RuntimeContext;

// Mock minecraft-data
jest.mock('minecraft-data', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    items: {},
    blocksByName: {
      crafting_table: { id: 58 }
    },
    itemsByName: {
      wooden_pickaxe: { id: 1, name: 'wooden_pickaxe' },
      stick: { id: 2, name: 'stick' },
      oak_planks: { id: 3, name: 'oak_planks' },
      crafting_table: { id: 4, name: 'crafting_table' }
    }
  }))
}));

describe('CraftItemAction', () => {
  let craftAction: CraftItemAction;
  let mockContext: RuntimeContext;

  beforeEach(() => {
    jest.clearAllMocks();
    craftAction = new CraftItemAction();
    mockContext = createMockContext();
  });

  describe('基本属性测试', () => {
    test('应该具有正确的动作ID', () => {
      expect(craftAction.id).toBe('craft');
    });

    test('应该具有正确的名称', () => {
      expect(craftAction.name).toBe('CraftItemAction');
    });

    test('应该具有正确的描述', () => {
      expect(craftAction.description).toBe('智能合成物品，自动处理配方、材料和工作台');
    });
  });

  describe('参数验证测试', () => {
    test('应该在物品名称为空时返回失败', async () => {
      const result = await craftAction.execute(mockContext, {} as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('物品名称不能为空');
    });

    test('应该接受基础参数', async () => {
      // 模拟有可用的配方
      (mockContext.bot.recipesFor as jest.Mock).mockReturnValue([
        {
          result: { id: 1, count: 1 },
          ingredients: [{ id: 2, count: 2 }, { id: 3, count: 3 }],
          requiresTable: true
        }
      ]);

      // 模拟库存检查
      (mockContext.bot.inventory.items as jest.Mock).mockReturnValue([
        { type: 2, count: 10 },
        { type: 3, count: 15 }
      ]);

      // 模拟找到工作台
      (mockContext.bot.findBlock as jest.Mock).mockReturnValue({
        position: { x: 10, y: 64, z: 10 }
      });

      // 模拟移动成功
      (mockContext.movementUtils.moveToCoordinate as jest.Mock).mockResolvedValue({
        success: true
      });

      const params = {
        item: 'wooden_pickaxe',
        count: 1
      };

      const result = await craftAction.execute(mockContext, params);

      expect(mockContext.bot.recipesFor).toHaveBeenCalled();
      expect(mockContext.logger.info).toHaveBeenCalled();
    });
  });

  describe('参数Schema测试', () => {
    test('应该返回正确的参数Schema', () => {
      const schema = craftAction.getParamsSchema();

      expect(schema).toHaveProperty('item');
      expect(schema.item).toHaveProperty('type', 'string');
      expect(schema.item).toHaveProperty('description');

      expect(schema).toHaveProperty('count');
      expect(schema.count).toHaveProperty('type', 'number');
      expect(schema.count).toHaveProperty('optional', true);

      expect(schema).toHaveProperty('requiredMaterials');
      expect(schema.requiredMaterials).toHaveProperty('type', 'array');
      expect(schema.requiredMaterials).toHaveProperty('optional', true);

      expect(schema).toHaveProperty('maxComplexity');
      expect(schema.maxComplexity).toHaveProperty('type', 'number');
      expect(schema.maxComplexity).toHaveProperty('optional', true);
    });
  });

  describe('扩展功能测试', () => {
    test('应该支持指定材料约束', async () => {
      // 模拟配方查找
      (mockContext.bot.recipesFor as jest.Mock).mockReturnValue([
        {
          result: { id: 1, count: 1 },
          ingredients: [{ id: 3, count: 3 }, { id: 2, count: 2 }],
          requiresTable: true
        }
      ]);

      // 模拟库存检查 - 模拟材料不足的情况
      (mockContext.bot.inventory.items as jest.Mock).mockReturnValue([
        { type: 2, count: 2 }, // 木棍足够
        { type: 3, count: 1 }  // 木板不足
      ]);

      const params = {
        item: 'wooden_pickaxe',
        count: 1,
        requiredMaterials: ['oak_planks', 'stick']
      };

      const result = await craftAction.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.message).toContain('指定的材料不足');
    });

    test('应该支持复杂度控制', async () => {
      const params = {
        item: 'complex_item',
        count: 1,
        maxComplexity: 5
      };

      // 由于没有配方，应该失败
      (mockContext.bot.recipesFor as jest.Mock).mockReturnValue([]);

      const result = await craftAction.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('最大复杂度: 5')
      );
    });
  });

  describe('中文支持测试', () => {
    test('应该支持中文物品名称', async () => {
      (mockContext.bot.recipesFor as jest.Mock).mockReturnValue([
        {
          result: { id: 1, count: 1 },
          ingredients: [{ id: 2, count: 2 }, { id: 3, count: 3 }],
          requiresTable: true
        }
      ]);

      const params = {
        item: '木镐', // 中文名称
        count: 1
      };

      await craftAction.execute(mockContext, params);

      // 验证调用时使用了标准化后的名称
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('木镐')
      );
    });
  });
});