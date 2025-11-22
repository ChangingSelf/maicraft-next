/**
 * 中文物品名称映射
 * 支持中英文名称互转，提供完整的中文本地化支持
 */

/**
 * 物品名称映射接口
 */
export interface ItemNameMapping {
  [chineseName: string]: string;
}

/**
 * 中文到英文物品名称映射
 * 包含常用物品的中文名称映射
 */
export const CHINESE_ITEM_MAPPING: ItemNameMapping = {
  // ===== 工具类 =====
  // 镐子
  木镐: 'wooden_pickaxe',
  石镐: 'stone_pickaxe',
  铁镐: 'iron_pickaxe',
  金镐: 'golden_pickaxe',
  钻石镐: 'diamond_pickaxe',
  下界合金镐: 'netherite_pickaxe',

  // 斧头
  木斧: 'wooden_axe',
  石斧: 'stone_axe',
  铁斧: 'iron_axe',
  金斧: 'golden_axe',
  钻石斧: 'diamond_axe',
  下界合金斧: 'netherite_axe',

  // 剑
  木剑: 'wooden_sword',
  石剑: 'stone_sword',
  铁剑: 'iron_sword',
  金剑: 'golden_sword',
  钻石剑: 'diamond_sword',
  下界合金剑: 'netherite_sword',

  // 铲子
  木铲: 'wooden_shovel',
  石铲: 'stone_shovel',
  铁铲: 'iron_shovel',
  金铲: 'golden_shovel',
  钻石铲: 'diamond_shovel',
  下界合金铲: 'netherite_shovel',

  // 锄头
  木锄: 'wooden_hoe',
  石锄: 'stone_hoe',
  铁锄: 'iron_hoe',
  金锄: 'golden_hoe',
  钻石锄: 'diamond_hoe',
  下界合金锄: 'netherite_hoe',

  // ===== 基础材料 =====
  木板: 'planks',
  橡木木板: 'oak_planks',
  云杉木板: 'spruce_planks',
  桦木木板: 'birch_planks',
  丛林木板: 'jungle_planks',
  金合欢木板: 'acacia_planks',
  深色橡木木板: 'dark_oak_planks',
  绯红木板: 'crimson_planks',
  扭曲木板: 'warped_planks',

  木棍: 'stick',
  工作台: 'crafting_table',
  熔炉: 'furnace',
  箱子: 'chest',
  大箱子: 'ender_chest',

  // ===== 矿物和资源 =====
  // 原矿
  煤炭: 'coal',
  铁矿石: 'iron_ore',
  金矿石: 'gold_ore',
  钻石: 'diamond',
  红石: 'redstone',
  青金石: 'lapis_lazuli',
  绿宝石: 'emerald',
  石英: 'quartz',
  下界石英: 'nether_quartz',

  // 锭
  铁锭: 'iron_ingot',
  金锭: 'gold_ingot',
  铜锭: 'copper_ingot',
  下界合金锭: 'netherite_ingot',

  // ===== 方块类 =====
  // 木材
  木头: 'log',
  橡木: 'oak_log',
  云杉木: 'spruce_log',
  桦木: 'birch_log',
  丛林木: 'jungle_log',
  金合欢木: 'acacia_log',
  深色橡木: 'dark_oak_log',

  // 石头类
  圆石: 'cobblestone',
  石头: 'stone',
  花岗岩: 'granite',
  闪长岩: 'diorite',
  安山岩: 'andesite',
  黑石: 'blackstone',
  玄武岩: 'basalt',
  深板岩: 'deepslate',

  // 玻璃
  玻璃: 'glass',
  玻璃板: 'glass_pane',

  // 羊毛
  白色羊毛: 'white_wool',
  橙色羊毛: 'orange_wool',
  品红色羊毛: 'magenta_wool',
  淡蓝色羊毛: 'light_blue_wool',
  黄色羊毛: 'yellow_wool',
  黄绿色羊毛: 'lime_wool',
  粉红色羊毛: 'pink_wool',
  灰色羊毛: 'gray_wool',
  淡灰色羊毛: 'light_gray_wool',
  青色羊毛: 'cyan_wool',
  紫色羊毛: 'purple_wool',
  蓝色羊毛: 'blue_wool',
  棕色羊毛: 'brown_wool',
  绿色羊毛: 'green_wool',
  红色羊毛: 'red_wool',
  黑色羊毛: 'black_wool',

  // ===== 食物类 =====
  面包: 'bread',
  熟牛肉: 'cooked_beef',
  熟猪肉: 'cooked_porkchop',
  熟鸡肉: 'cooked_chicken',
  熟羊肉: 'cooked_mutton',
  熟兔子: 'cooked_rabbit',
  鱼: 'fish',
  熟鱼: 'cooked_cod',
  熟鲑鱼: 'cooked_salmon',

  // 苹果
  苹果: 'apple',
  金苹果: 'golden_apple',
  附魔金苹果: 'enchanted_golden_apple',

  // 胡萝卜和马铃薯
  胡萝卜: 'carrot',
  马铃薯: 'potato',
  烤马铃薯: 'baked_potato',

  // ===== 种子和农作物 =====
  小麦种子: 'wheat_seeds',
  小麦: 'wheat',
  甜菜种子: 'beetroot_seeds',
  甜菜根: 'beetroot',
  南瓜种子: 'pumpkin_seeds',
  西瓜种子: 'melon_seeds',
  西瓜: 'melon',
  西瓜片: 'melon_slice',

  // ===== 其他重要物品 =====
  火把: 'torch',
  床: 'bed',
  书: 'book',
  书架: 'bookshelf',
  纸: 'paper',
  地图: 'map',
  指南针: 'compass',
  时钟: 'clock',
  望远镜: 'spyglass',

  // 附魔相关
  附魔台: 'enchanting_table',
  铁砧: 'anvil',
  砂轮: 'grindstone',
  酿造台: 'brewing_stand',
  炼药锅: 'cauldron',

  // 实用物品
  桶: 'bucket',
  水桶: 'water_bucket',
  岩浆桶: 'lava_bucket',
  牛奶桶: 'milk_bucket',
  钓竿: 'fishing_rod',
  打火石: 'flint_and_steel',
  剪刀: 'shears',
  盾牌: 'shield',
  弓: 'bow',
  箭: 'arrow',
  弩: 'crossbow',
  烟花火箭: 'firework_rocket',
  烟花之星: 'firework_star',

  // ===== 建筑材料 =====
  // 砖块
  砖块: 'bricks',
  石头砖: 'stone_bricks',
  泥砖: 'mud_bricks',
  砂岩: 'sandstone',
  红砂岩: 'red_sandstone',

  // 混凝土
  白色混凝土: 'white_concrete',
  橙色混凝土: 'orange_concrete',
  品红色混凝土: 'magenta_concrete',
  淡蓝色混凝土: 'light_blue_concrete',
  黄色混凝土: 'yellow_concrete',
  黄绿色混凝土: 'lime_concrete',
  粉红色混凝土: 'pink_concrete',
  灰色混凝土: 'gray_concrete',
  淡灰色混凝土: 'light_gray_concrete',
  青色混凝土: 'cyan_concrete',
  紫色混凝土: 'purple_concrete',
  蓝色混凝土: 'blue_concrete',
  棕色混凝土: 'brown_concrete',
  绿色混凝土: 'green_concrete',
  红色混凝土: 'red_concrete',
  黑色混凝土: 'black_concrete',
};

/**
 * 常用英文别名映射（用于规范化）
 */
export const ENGLISH_ALIAS_MAPPING: ItemNameMapping = {
  // 基础别名 - 只为实际需要别名的添加
  plank: 'planks',
  wood: 'planks',
  pick: 'pickaxe',
  axe: 'axe',
  sword: 'sword',
  shovel: 'shovel',
  hoe: 'hoe',

  // 工具别名
  wooden_pick: 'wooden_pickaxe',
  stone_pick: 'stone_pickaxe',
  iron_pick: 'iron_pickaxe',
  gold_pick: 'golden_pickaxe',
  diamond_pick: 'diamond_pickaxe',
  netherite_pick: 'netherite_pickaxe',

  wooden_axe: 'wooden_axe',
  stone_axe: 'stone_axe',
  iron_axe: 'iron_axe',
  gold_axe: 'golden_axe',
  diamond_axe: 'diamond_axe',
  netherite_axe: 'netherite_axe',

  wooden_sword: 'wooden_sword',
  stone_sword: 'stone_sword',
  iron_sword: 'iron_sword',
  gold_sword: 'golden_sword',
  diamond_sword: 'diamond_sword',
  netherite_sword: 'netherite_sword',

  // 材料别名
  oak_plank: 'oak_planks',
  spruce_plank: 'spruce_planks',
  birch_plank: 'birch_planks',
  jungle_plank: 'jungle_planks',
  acacia_plank: 'acacia_planks',
  dark_oak_plank: 'dark_oak_planks',

  ingot: 'ingot',
  ore: 'ore',
  log: 'log',
  wool: 'wool',
  glass_pane: 'glass_pane',
};

/**
 * 物品名称标准化器
 * 提供物品名称的标准化功能
 */
export class ItemNameNormalizer {
  private chineseMapping: Map<string, string>;
  private englishAliasMapping: Map<string, string>;

  constructor() {
    this.chineseMapping = new Map(Object.entries(CHINESE_ITEM_MAPPING));
    this.englishAliasMapping = new Map(Object.entries(ENGLISH_ALIAS_MAPPING));
  }

  /**
   * 标准化物品名称
   * @param name 原始物品名称（中文或英文）
   * @returns 标准化后的英文物品名称
   */
  normalize(name: string): string {
    if (!name || typeof name !== 'string') {
      return name;
    }

    const normalizedName = name.toLowerCase().trim();

    // 首先检查中文映射
    if (this.chineseMapping.has(normalizedName)) {
      return this.chineseMapping.get(normalizedName)!;
    }

    // 然后检查英文别名映射
    if (this.englishAliasMapping.has(normalizedName)) {
      return this.englishAliasMapping.get(normalizedName)!;
    }

    // 如果没有找到映射，返回标准化后的原始名称
    return normalizedName;
  }

  /**
   * 检查是否为中文物品名称
   * @param name 物品名称
   * @returns 是否为中文名称
   */
  isChineseName(name: string): boolean {
    const normalizedName = name.toLowerCase().trim();
    return this.chineseMapping.has(normalizedName);
  }

  /**
   * 获取物品的英文名称
   * @param name 物品名称
   * @returns 英文名称，如果找不到则返回原始名称
   */
  getEnglishName(name: string): string {
    return this.normalize(name);
  }

  /**
   * 检查是否存在某个物品的映射
   * @param name 物品名称
   * @returns 是否存在映射
   */
  hasMapping(name: string): boolean {
    const normalizedName = name.toLowerCase().trim();
    return this.chineseMapping.has(normalizedName) || this.englishAliasMapping.has(normalizedName) || this.isStandardEnglishItem(name); // 标准英文名称也认为是有效映射
  }

  /**
   * 检查是否为标准英文物品名称
   * @param name 物品名称
   * @returns 是否为标准英文名称
   */
  private isStandardEnglishItem(name: string): boolean {
    // 这里可以集成minecraft-data或者维护一个标准物品名称列表
    // 目前简单检查是否为常见的英文名称格式
    const normalizedName = name.toLowerCase().trim();

    // 检查是否包含常见的关键词
    const commonItemPatterns = [
      /^wooden_/,
      /^stone_/,
      /^iron_/,
      /^gold/,
      /^diamond_/,
      /^netherite_/,
      /_pickaxe$/,
      /_axe$/,
      /_sword$/,
      /_shovel$/,
      /_hoe$/,
      /^planks$/,
      /^stick$/,
      /^crafting_table$/,
      /^furnace$/,
      /^chest$/,
      /^coal$/,
      /^ingot$/,
      /^ore$/,
      /^log$/,
    ];

    return commonItemPatterns.some(pattern => pattern.test(normalizedName));
  }

  /**
   * 获取所有支持的中文物品名称
   * @returns 中文物品名称数组
   */
  getAllChineseNames(): string[] {
    return Array.from(this.chineseMapping.keys());
  }

  /**
   * 获取所有支持的英文别名
   * @returns 英文别名数组
   */
  getAllEnglishAliases(): string[] {
    return Array.from(this.englishAliasMapping.keys());
  }

  /**
   * 扩展物品映射
   * @param chineseName 中文名称
   * @param englishName 英文名称
   */
  addMapping(chineseName: string, englishName: string): void {
    const normalizedChinese = chineseName.toLowerCase().trim();
    const normalizedEnglish = englishName.toLowerCase().trim();

    this.chineseMapping.set(normalizedChinese, normalizedEnglish);
  }

  /**
   * 扩展英文别名映射
   * @param alias 别名
   * @param standardName 标准名称
   */
  addEnglishAlias(alias: string, standardName: string): void {
    const normalizedAlias = alias.toLowerCase().trim();
    const normalizedStandard = standardName.toLowerCase().trim();

    this.englishAliasMapping.set(normalizedAlias, normalizedStandard);
  }
}

/**
 * 全局物品名称标准化器实例
 */
export const itemNameNormalizer = new ItemNameNormalizer();

/**
 * 便捷函数：标准化物品名称
 * @param name 物品名称
 * @returns 标准化后的名称
 */
export function normalizeItemName(name: string): string {
  return itemNameNormalizer.normalize(name);
}
