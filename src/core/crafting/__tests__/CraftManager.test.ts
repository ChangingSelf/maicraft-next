/**
 * CraftManager 测试
 *
 * 测试合成管理器的各项功能
 */

import { CraftManager } from '../CraftManager';
import { normalizeItemName } from '@/utils/ItemNameMapping';

// Mock mineflayer Bot
const mockBot = {
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
} as any;

// Mock Logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

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

describe('CraftManager', () => {
  let craftManager: CraftManager;

  beforeEach(() => {
    jest.clearAllMocks();
    craftManager = new CraftManager(mockBot, mockLogger);
  });

  describe('基本功能测试', () => {
    test('应该能够创建CraftManager实例', () => {
      expect(craftManager).toBeInstanceOf(CraftManager);
    });

    test('应该正确初始化依赖项', () => {
      expect(mockBot.version).toBeDefined();
      expect(mockLogger).toBeDefined();
    });
  });

  describe('物品名称标准化测试', () => {
    test('应该正确标准化中文物品名称', () => {
      // 这些测试需要在实际实现后进行调整
      // 这里只是展示测试结构
      expect(normalizeItemName('木镐')).toBe('wooden_pickaxe');
      expect(normalizeItemName('石镐')).toBe('stone_pickaxe');
      expect(normalizeItemName('铁镐')).toBe('iron_pickaxe');
    });

    test('应该正确处理英文物品名称', () => {
      expect(normalizeItemName('wooden_pickaxe')).toBe('wooden_pickaxe');
      expect(normalizeItemName('stick')).toBe('stick');
    });

    test('应该处理物品名称别名', () => {
      expect(normalizeItemName('wooden_pick')).toBe('wooden_pickaxe');
      expect(normalizeItemName('plank')).toBe('planks');
    });
  });
});

describe('ItemNameNormalizer', () => {
  const { itemNameNormalizer } = require('@/utils/ItemNameMapping');

  test('应该支持中文名称映射', () => {
    const chineseNames = itemNameNormalizer.getAllChineseNames();
    expect(chineseNames.length).toBeGreaterThan(0);
    expect(chineseNames).toContain('木镐');
  });

  test('应该支持英文别名映射', () => {
    const englishAliases = itemNameNormalizer.getAllEnglishAliases();
    expect(englishAliases.length).toBeGreaterThan(0);
    expect(englishAliases).toContain('wooden_pick');
  });

  test('应该能够添加新的映射', () => {
    itemNameNormalizer.addMapping('新物品', 'new_item');
    expect(itemNameNormalizer.normalize('新物品')).toBe('new_item');
  });
});