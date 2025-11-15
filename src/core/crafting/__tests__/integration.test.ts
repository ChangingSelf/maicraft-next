/**
 * 合成系统集成测试
 *
 * 简化的集成测试，专注于核心功能验证
 */

import { normalizeItemName, itemNameNormalizer } from '@/utils/ItemNameMapping';

describe('合成系统集成测试', () => {
  describe('物品名称映射功能', () => {
    test('应该正确支持中文物品名称', () => {
      const testCases = [
        ['木镐', 'wooden_pickaxe'],
        ['石镐', 'stone_pickaxe'],
        ['铁镐', 'iron_pickaxe'],
        ['钻石镐', 'diamond_pickaxe'],
        ['木斧', 'wooden_axe'],
        ['石斧', 'stone_axe'],
        ['铁斧', 'iron_axe'],
        ['钻石斧', 'diamond_axe'],
        ['木剑', 'wooden_sword'],
        ['石剑', 'stone_sword'],
        ['铁剑', 'iron_sword'],
        ['钻石剑', 'diamond_sword'],
        ['木板', 'planks'],
        ['木棍', 'stick'],
        ['工作台', 'crafting_table'],
        ['熔炉', 'furnace'],
        ['箱子', 'chest'],
        ['煤炭', 'coal'],
        ['铁锭', 'iron_ingot'],
        ['金锭', 'gold_ingot'],
        ['钻石', 'diamond'],
        ['面包', 'bread'],
        ['苹果', 'apple'],
        ['弓', 'bow'],
        ['箭', 'arrow'],
        ['盾牌', 'shield']
      ];

      testCases.forEach(([chinese, expectedEnglish]) => {
        expect(normalizeItemName(chinese)).toBe(expectedEnglish);
        expect(itemNameNormalizer.isChineseName(chinese)).toBe(true);
      });
    });

    test('应该正确处理英文物品名称', () => {
      const englishItems = [
        'wooden_pickaxe',
        'stone_pickaxe',
        'iron_pickaxe',
        'diamond_pickaxe',
        'planks',
        'stick',
        'crafting_table',
        'furnace',
        'coal',
        'iron_ingot'
      ];

      englishItems.forEach(item => {
        expect(normalizeItemName(item)).toBe(item);
        expect(itemNameNormalizer.hasMapping(item)).toBe(true);
      });
    });

    test('应该正确处理英文别名', () => {
      const aliasTestCases = [
        ['wooden_pick', 'wooden_pickaxe'],
        ['stone_pick', 'stone_pickaxe'],
        ['iron_pick', 'iron_pickaxe'],
        ['diamond_pick', 'diamond_pickaxe'],
        ['plank', 'planks'],
        ['wood', 'planks'],
        ['pick', 'pickaxe'],
        ['ore', 'ore']
      ];

      aliasTestCases.forEach(([alias, expected]) => {
        expect(normalizeItemName(alias)).toBe(expected);
      });
    });

    test('应该处理不存在的物品名称', () => {
      const unknownItems = [
        'unknown_item',
        '不存在物品',
        'random_stuff'
      ];

      unknownItems.forEach(item => {
        const result = normalizeItemName(item);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        // 不存在的物品应该返回标准化后的原始名称
        expect(result).toBe(item.toLowerCase().trim());
      });
    });
  });

  describe('物品名称标准化器扩展性测试', () => {
    test('应该能够动态添加新的映射', () => {
      // 添加新的中英文映射
      itemNameNormalizer.addMapping('新物品', 'new_item');
      expect(normalizeItemName('新物品')).toBe('new_item');
      expect(itemNameNormalizer.isChineseName('新物品')).toBe(true);

      // 添加新的英文别名
      itemNameNormalizer.addEnglishAlias('new_alias', 'new_item');
      expect(normalizeItemName('new_alias')).toBe('new_item');
    });

    test('应该能够获取所有映射', () => {
      const chineseNames = itemNameNormalizer.getAllChineseNames();
      const englishAliases = itemNameNormalizer.getAllEnglishAliases();

      expect(Array.isArray(chineseNames)).toBe(true);
      expect(Array.isArray(englishAliases)).toBe(true);
      expect(chineseNames.length).toBeGreaterThan(0);
      expect(englishAliases.length).toBeGreaterThan(0);

      // 验证包含常见的物品
      expect(chineseNames).toContain('木镐');
      expect(englishAliases).toContain('wooden_pick');
    });
  });

  describe('边界情况测试', () => {
    test('应该处理空字符串和null', () => {
      expect(normalizeItemName('')).toBe('');
      expect(normalizeItemName(null as any)).toBe(null as any);
      expect(normalizeItemName(undefined as any)).toBe(undefined as any);
    });

    test('应该处理空白字符', () => {
      expect(normalizeItemName('  木镐  ')).toBe('wooden_pickaxe');
      expect(normalizeItemName('\t木镐\n')).toBe('wooden_pickaxe');
    });

    test('应该处理大小写混合', () => {
      expect(normalizeItemName('Wooden_Pickaxe')).toBe('wooden_pickaxe');
      expect(normalizeItemName('WOODEN_PICKAXE')).toBe('wooden_pickaxe');
      expect(normalizeItemName('wooden_pickaxe')).toBe('wooden_pickaxe');
    });
  });

  describe('性能测试', () => {
    test('应该能够快速处理大量物品名称', () => {
      const testItems = [
        '木镐', '石镐', '铁镐', '钻石镐',
        'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe',
        '木板', 'stick', 'workbench',
        'planks', 'crafting_table', 'furnace'
      ];

      const startTime = Date.now();

      // 执行1000次标准化操作
      for (let i = 0; i < 1000; i++) {
        testItems.forEach(item => {
          normalizeItemName(item);
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 1000次操作应该在合理时间内完成（小于100ms）
      expect(duration).toBeLessThan(100);
    });
  });
});