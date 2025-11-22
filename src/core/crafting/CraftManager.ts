/**
 * CraftManager - 智能合成管理器
 *
 * 负责处理所有合成相关的逻辑，包括：
 * - 配方查找和选择
 * - 材料验证和递归合成
 * - 工作台管理
 * - 中文物品名称支持
 */

import { Bot } from 'mineflayer';
import { normalizeItemName } from '@/utils/ItemNameMapping';
import { ActionResult, CraftOptions, MaterialOptions, MaterialRequirement, CRAFT_ERRORS, CraftErrorCode } from '@/core/actions/types';

interface Recipe {
  result: RecipeItem;
  ingredients?: RecipeItem[];
  inShape?: RecipeItem[][];
  requiresTable: boolean;
  priority?: number;
  complexity?: number;
  tags?: string[];
}

interface RecipeItem {
  id: number;
  metadata?: number | null;
  count: number;
  name?: string;
}

/**
 * 合成管理器类
 * 实现智能合成的核心逻辑
 */
/**
 * Logger 接口（避免循环依赖）
 */
interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export class CraftManager {
  private bot: Bot;
  private mcData: any;

  constructor(bot: Bot) {
    this.bot = bot;
    this.mcData = require('minecraft-data')(bot.version);
  }

  /**
   * 主要合成方法
   * @param itemName 物品名称
   * @param count 合成数量
   * @param options 合成选项
   * @param logger 日志记录器
   * @returns 合成结果
   */
  async craftItem(itemName: string, count: number = 1, options: CraftOptions = {}, logger: Logger): Promise<ActionResult> {
    try {
      // 1. 标准化物品名称
      const normalizedName = this.normalizeItemName(itemName);
      logger.info(`开始合成: ${itemName} -> ${normalizedName} x${count}`);

      // 2. 查找配方（支持指定材料约束）
      const recipe = await this.findRecipeWithConstraints(normalizedName, options.requiredMaterials);
      if (!recipe) {
        return this.createErrorResult(`找不到 ${itemName} 的合成配方`, CRAFT_ERRORS.RECIPE_NOT_FOUND);
      }

      logger.info(`找到配方，需要工作台: ${recipe.requiresTable}`);

      // 调试：输出配方详细信息
      logger.debug(
        `配方详情: ${JSON.stringify(
          {
            result: recipe.result,
            hasIngredients: !!recipe.ingredients,
            hasInShape: !!recipe.inShape,
            requiresTable: recipe.requiresTable,
          },
          null,
          2,
        )}`,
      );

      // 3. 验证材料充足性
      logger.debug('开始验证材料...');
      const materialCheck = await this.validateMaterials(recipe, count, options.requiredMaterials);
      if (!materialCheck.success) {
        logger.error(`材料验证失败: ${materialCheck.message}`);
        return materialCheck;
      }
      logger.debug('材料验证通过');

      // 4. 递归合成材料（如果需要且允许）
      const materialResult = await this.ensureMaterials(
        recipe,
        count,
        {
          ...options,
          currentDepth: 0,
        },
        logger,
      );
      if (!materialResult.success) {
        return materialResult;
      }

      // 5. 处理工作台
      const craftingTable = await this.ensureCraftingTable(recipe, logger);

      // 6. 执行合成
      return await this.performCrafting(recipe, count, craftingTable, itemName, logger);
    } catch (error) {
      const err = error as Error;
      logger.error('合成过程中发生错误:', err);
      return this.createErrorResult(`合成失败: ${err.message}`, CRAFT_ERRORS.CRAFT_FAILED, err);
    }
  }

  /**
   * 根据材料约束查找配方
   * @param itemName 物品名称
   * @param requiredMaterials 指定材料约束
   * @returns 最符合条件的配方
   */
  private async findRecipeWithConstraints(itemName: string, requiredMaterials?: string[]): Promise<Recipe | null> {
    try {
      // 1. 物品名称查找（参考maicraft-mcp-server的方法）
      const item = this.findItemByName(itemName);
      if (!item) {
        return null;
      }

      // 2. 查找附近的工作台
      const craftingTableBlock = this.bot.findBlock({
        matching: this.mcData.blocksByName.crafting_table.id,
        maxDistance: 48,
      });

      // 3. 获取所有可用配方
      const allRecipes = this.bot.recipesAll(item.id, null, craftingTableBlock ?? null);
      if (!allRecipes || allRecipes.length === 0) {
        return null;
      }

      // 4. 如果有材料约束，根据约束排序配方
      let recipes = allRecipes;
      if (requiredMaterials && requiredMaterials.length > 0) {
        recipes = this.sortRecipesByPreference(allRecipes, requiredMaterials);
      }

      // 5. 返回第一个符合条件的配方
      return recipes[0];
    } catch (error) {
      // 如果出错，尝试直接从minecraft-data查找
      return this.findRecipesDirectly(itemName)[0] || null;
    }
  }

  /**
   * 根据物品名称查找物品（参考maicraft-mcp-server的实现 + 中文支持）
   * @param itemName 物品名称
   * @returns 物品信息或null
   */
  private findItemByName(itemName: string): any | null {
    // 0. 首先尝试中文名称映射
    const normalizedName = this.normalizeItemName(itemName);
    if (normalizedName !== itemName) {
      // 如果名称被映射了，使用映射后的英文名称继续查找
      return this.findItemByName(normalizedName);
    }

    // 标准化物品名称
    const normalizeName = (name: string) =>
      name
        .trim()
        .toLowerCase()
        .replace(/^minecraft:/, '')
        .replace(/\s+/g, '_');

    const requested = normalizeName(itemName);

    // 1) 按键名直接查找（itemsByName 使用下划线小写键）
    let item = this.mcData.itemsByName?.[requested];

    // 2) 若失败，尝试按显示名匹配
    if (!item && Array.isArray(this.mcData.itemsArray)) {
      const lower = itemName.trim().toLowerCase();
      item = this.mcData.itemsArray.find((it: any) => it?.displayName?.toLowerCase() === lower);
    }

    // 3) 若仍失败，尝试作为方块查找
    if (!item && this.mcData.blocksByName?.[requested]) {
      const asItem = this.mcData.itemsByName?.[requested];
      if (asItem) item = asItem;
    }

    return item || null;
  }

  /**
   * 根据用户偏好对配方进行排序（参考maicraft-mcp-server的实现）
   * @param recipes 配方数组
   * @param preferredMaterials 偏好材料列表
   * @returns 排序后的配方数组
   */
  private sortRecipesByPreference(recipes: any[], preferredMaterials: string[]): any[] {
    if (!preferredMaterials || preferredMaterials.length === 0) {
      return recipes;
    }

    return recipes.sort((a, b) => {
      const materialsA = this.analyzeRecipeMaterials(a);
      const materialsB = this.analyzeRecipeMaterials(b);

      // 计算每个配方中偏好材料的最高优先级
      const scoreA = this.calculatePreferenceScore(materialsA, preferredMaterials);
      const scoreB = this.calculatePreferenceScore(materialsB, preferredMaterials);

      // 分数越高优先级越高（降序排列）
      return scoreB - scoreA;
    });
  }

  /**
   * 分析配方中使用的材料（支持mineflayer和minecraft-data格式）
   * @param recipe 配方
   * @returns 材料名称数组
   */
  private analyzeRecipeMaterials(recipe: any): string[] {
    const materials: string[] = [];

    try {
      // 统一使用getIngredientsFromRecipe方法来获取材料
      const ingredients = this.getIngredientsFromRecipe(recipe);

      for (const ingredient of ingredients) {
        if (ingredient && ingredient.id !== undefined) {
          const itemName = this.getItemNameById(ingredient.id);
          if (itemName !== 'unknown' && !materials.includes(itemName)) {
            materials.push(itemName);
          }
        }
      }
    } catch (error) {
      console.warn('分析配方材料时出错:', error);
    }

    return materials;
  }

  /**
   * 获取物品名称（参考maicraft-mcp-server的实现）
   * @param item 物品ID或物品对象
   * @returns 物品名称
   */
  private getItemName(item: any): string {
    if (!item) return 'unknown';

    // 如果是数字ID，查找对应的物品
    if (typeof item === 'number') {
      const itemData = this.mcData.items[item];
      return itemData ? itemData.name : 'unknown';
    }

    // 如果已经是物品对象
    if (item.id !== undefined) {
      const itemData = this.mcData.items[item.id];
      return itemData ? itemData.name : 'unknown';
    }

    return 'unknown';
  }

  /**
   * 计算配方中偏好材料的优先级分数（参考maicraft-mcp-server的实现）
   * @param materials 材料数组
   * @param preferredMaterials 偏好材料数组
   * @returns 分数
   */
  private calculatePreferenceScore(materials: string[], preferredMaterials: string[]): number {
    let score = 0;

    for (let i = 0; i < preferredMaterials.length; i++) {
      const preferred = preferredMaterials[i].toLowerCase().replace(/\s+/g, '_');
      if (materials.some(material => material.toLowerCase().includes(preferred))) {
        // 优先级越高分数越高（第一个偏好材料得分最高）
        score += preferredMaterials.length - i;
      }
    }

    return score;
  }

  /**
   * 直接从minecraft-data查找配方
   * @param itemName 物品名称
   * @returns 配方数组
   */
  private findRecipesDirectly(itemName: string): Recipe[] {
    const item = Object.values(this.mcData.items).find((item: any) => item.name === itemName);
    if (!item) return [];

    const recipes = this.mcData.recipes[item.id];
    if (!recipes || !Array.isArray(recipes)) return [];

    return recipes.map((recipe: any) => ({
      result: recipe.result,
      ingredients: this.getIngredientsFromRecipe(recipe),
      inShape: recipe.inShape,
      requiresTable: this.requiresCraftingTable(recipe),
      priority: 1,
      complexity: this.calculateComplexity(recipe),
    }));
  }

  /**
   * 从配方中提取材料列表（支持mineflayer和minecraft-data两种格式）
   * @param recipe 配方
   * @returns 材料列表
   */
  private getIngredientsFromRecipe(recipe: any): any[] {
    const ingredients: any[] = [];

    try {
      // 处理mineflayer格式的配方
      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        // mineflayer的无形状配方
        recipe.ingredients.forEach((ingredient: any) => {
          if (ingredient && ingredient.id !== undefined) {
            // 严格验证：只有正整数才是有效的物品ID
            if (Number.isInteger(ingredient.id) && ingredient.id > 0) {
              ingredients.push({
                id: ingredient.id,
                count: ingredient.count || 1,
              });
            }
          }
        });
      } else if (recipe.inShape && Array.isArray(recipe.inShape)) {
        // mineflayer的有形状配方或minecraft-data格式
        const ingredientCount = new Map();
        for (const row of recipe.inShape) {
          if (Array.isArray(row)) {
            for (const ingredientId of row) {
              if (ingredientId !== null && ingredientId !== undefined) {
                // 处理可能的嵌套对象格式
                let itemId = ingredientId;
                if (typeof ingredientId === 'object' && ingredientId.id !== undefined) {
                  itemId = ingredientId.id;
                }

                // 严格验证：只有正整数才是有效的物品ID
                if (Number.isInteger(itemId) && itemId > 0) {
                  ingredientCount.set(itemId, (ingredientCount.get(itemId) || 0) + 1);
                }
              }
            }
          }
        }
        ingredients.push(...Array.from(ingredientCount.entries()).map(([id, count]) => ({ id, count })));
      }
    } catch (error) {
      // 如果解析失败，返回空数组避免崩溃
      console.warn('解析配方材料时出错:', error);
      return [];
    }

    return ingredients;
  }

  /**
   * 判断配方是否需要工作台
   * @param recipe 配方
   * @returns 是否需要工作台
   */
  private requiresCraftingTable(recipe: any): boolean {
    // 如果配方有形状且尺寸大于2x2，则需要工作台
    if (recipe.inShape) {
      return recipe.inShape.length > 2 || recipe.inShape[0].length > 2;
    }
    // 如果是无形状配方，通常需要工作台（除了某些特殊物品）
    return true;
  }

  /**
   * 计算配方的复杂度
   * @param recipe 配方
   * @returns 复杂度值
   */
  private calculateComplexity(recipe: any): number {
    let complexity = 1;

    if (recipe.inShape) {
      complexity += recipe.inShape.length * recipe.inShape[0].length;
    }

    if (recipe.ingredients) {
      complexity += recipe.ingredients.length;
    }

    return complexity;
  }

  /**
   * 获取配方的材料名称列表
   * @param recipe 配方
   * @returns 材料名称列表
   */
  private getRecipeMaterials(recipe: Recipe): string[] {
    const materials: string[] = [];

    if (recipe.ingredients) {
      recipe.ingredients.forEach((ingredient: any) => {
        const name = this.getItemNameById(ingredient.id);
        if (name && !materials.includes(name)) {
          materials.push(name);
        }
      });
    }

    if (recipe.inShape) {
      const materialIds = new Set();
      recipe.inShape.forEach((row: any[]) => {
        row.forEach((id: any) => {
          if (id !== null && id !== undefined) {
            materialIds.add(id);
          }
        });
      });
      materialIds.forEach(id => {
        const name = this.getItemNameById(id);
        if (name) {
          materials.push(name);
        }
      });
    }

    return materials;
  }

  /**
   * 验证材料是否充足
   * @param recipe 配方
   * @param count 合成数量
   * @param requiredMaterials 指定材料约束
   * @returns 验证结果
   */
  private async validateMaterials(recipe: Recipe, count: number, requiredMaterials?: string[]): Promise<ActionResult> {
    const missingMaterials: MaterialRequirement[] = [];

    // 获取配方所需的所有材料
    const ingredients = this.getIngredientsFromRecipe(recipe);

    // 调试：输出解析出的材料信息
    console.log(`[DEBUG] 解析出的配方材料: ${JSON.stringify(ingredients, null, 2)}`);

    for (const ingredient of ingredients) {
      const materialName = this.getItemNameById(ingredient.id);
      const needCount = ingredient.count * count;
      const haveCount = this.getItemCount(ingredient.id);

      console.log(`[DEBUG] 材料检查: ${materialName} (ID: ${ingredient.id}) - 需要: ${needCount}, 拥有: ${haveCount}`);

      if (haveCount < needCount) {
        missingMaterials.push({
          name: materialName,
          count: needCount - haveCount,
          have: haveCount,
          need: needCount,
        });
      }
    }

    if (missingMaterials.length > 0) {
      // 如果有指定材料约束，优先检查这些材料是否不足
      if (requiredMaterials) {
        const requiredMissing = missingMaterials.filter(m => requiredMaterials.some(req => m.name.includes(req) || req.includes(m.name)));

        if (requiredMissing.length > 0) {
          const missingList = requiredMissing.map(m => `${m.name} (需要${m.need}，有${m.have})`).join('、');

          return this.createErrorResult(`指定的材料不足：${missingList}。请先获取足够的材料后再尝试合成。`, CRAFT_ERRORS.INSUFFICIENT_MATERIALS, {
            missingMaterials: requiredMissing,
          });
        }
      }

      const missingList = missingMaterials.map(m => `${m.name} x${m.count}`).join('、');

      return this.createErrorResult(`材料不足：${missingList}`, CRAFT_ERRORS.INSUFFICIENT_MATERIALS, { missingMaterials });
    }

    return this.createSuccessResult('材料验证通过');
  }

  /**
   * 确保材料充足，递归合成缺失材料
   * @param recipe 配方
   * @param count 合成数量
   * @param options 材料选项
   * @param logger 日志记录器
   * @returns 结果
   */
  private async ensureMaterials(recipe: Recipe, count: number, options: MaterialOptions, logger: Logger): Promise<ActionResult> {
    // 检查递归深度
    if (options.currentDepth >= (options.maxComplexity || 10)) {
      return this.createErrorResult('合成复杂度过高，请手动合成部分材料', CRAFT_ERRORS.COMPLEXITY_TOO_HIGH);
    }

    // 获取配方所需的所有材料
    const ingredients = this.getIngredientsFromRecipe(recipe);

    for (const ingredient of ingredients) {
      const needCount = ingredient.count * count;
      const haveCount = this.getItemCount(ingredient.id);

      if (haveCount < needCount) {
        const shortage = needCount - haveCount;

        // 尝试合成缺失材料（递归调用）
        const materialName = this.getItemNameById(ingredient.id);
        logger.info(`材料不足，尝试合成: ${materialName} x${shortage}`);

        const craftResult = await this.craftItem(
          materialName,
          shortage,
          {
            ...options,
            currentDepth: options.currentDepth + 1,
            // 递归时不继承requiredMaterials，避免过度约束
            requiredMaterials: undefined,
          },
          logger,
        );

        if (!craftResult.success) {
          return this.createErrorResult(`无法合成材料 ${materialName}: ${craftResult.message}`, CRAFT_ERRORS.INSUFFICIENT_MATERIALS, {
            material: materialName,
            shortage,
            subResult: craftResult,
          });
        }

        logger.info(`成功合成材料: ${materialName} x${shortage}`);
      }
    }

    return this.createSuccessResult('材料检查通过');
  }

  /**
   * 确保工作台可用
   * @param recipe 配方
   * @param logger 日志记录器
   * @returns 工作台方块
   */
  private async ensureCraftingTable(recipe: Recipe, logger: Logger): Promise<any | null> {
    if (!recipe.requiresTable) {
      return null; // 不需要工作台
    }

    // 查找附近工作台
    const craftingTable = this.bot.findBlock({
      matching: this.mcData.blocksByName.crafting_table.id,
      maxDistance: 32,
    });

    if (craftingTable) {
      logger.info(`找到工作台: ${craftingTable.position}`);
      return craftingTable;
    }

    // 没有找到工作台，尝试放置
    return await this.placeCraftingTable(logger);
  }

  /**
   * 放置工作台
   * @param logger 日志记录器
   * @returns 放置的工作台方块
   */
  private async placeCraftingTable(logger: Logger): Promise<any | null> {
    const craftingTableItem = this.bot.inventory.findInventoryItem(this.mcData.itemsByName.crafting_table.id);

    if (!craftingTableItem) {
      throw new Error('需要工作台但没有找到，请先合成工作台');
    }

    // 寻找合适的放置位置
    const placementPos = this.findSuitablePlacementPosition();
    if (!placementPos) {
      throw new Error('找不到合适的位置放置工作台');
    }

    const referenceBlock = this.bot.blockAt(placementPos.offset(0, -1, 0));
    if (!referenceBlock) {
      throw new Error('无法找到参考方块来放置工作台');
    }

    await this.bot.placeBlock(craftingTableItem, referenceBlock);
    const placedTable = this.bot.blockAt(placementPos);

    if (placedTable) {
      logger.info(`成功放置工作台: ${placementPos}`);
    }

    return placedTable;
  }

  /**
   * 寻找合适的放置位置
   * @returns 放置位置坐标
   */
  private findSuitablePlacementPosition(): any | null {
    const botPosition = this.bot.entity.position;
    const range = 5;

    // 在bot周围寻找合适的放置位置
    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) {
        for (let y = 0; y <= range; y++) {
          const pos = botPosition.offset(x, y, z);
          const blockAt = this.bot.blockAt(pos);
          const blockBelow = this.bot.blockAt(pos.offset(0, -1, 0));

          // 如果当前位置是空气，并且下方是固体方块，则适合放置
          if (blockAt && blockAt.name === 'air' && blockBelow && blockBelow.name !== 'air') {
            return pos;
          }
        }
      }
    }

    return null;
  }

  /**
   * 执行合成操作
   * @param recipe 配方
   * @param count 合成数量
   * @param craftingTable 工作台
   * @param originalItemName 原始物品名称
   * @param logger 日志记录器
   * @returns 合成结果
   */
  private async performCrafting(
    recipe: Recipe,
    count: number,
    craftingTable: any | null,
    originalItemName: string,
    logger: Logger,
  ): Promise<ActionResult> {
    try {
      logger.info(`开始合成: ${originalItemName} x${count}`);

      // 检查是否已经有打开的窗口，如果有则先关闭
      // 这可以防止窗口冲突导致的 updateSlot 超时错误
      if (this.bot.currentWindow) {
        logger.warn(`检测到已打开的窗口，先关闭: ${this.bot.currentWindow.type}`);
        this.bot.closeWindow(this.bot.currentWindow);
        await new Promise(resolve => setTimeout(resolve, 500)); // 等待窗口关闭
      }

      await this.bot.craft(recipe, count, craftingTable);

      logger.info(`合成成功: ${originalItemName} x${count}`);

      return this.createSuccessResult(`成功合成 ${originalItemName} x${count}`, {
        item: originalItemName,
        count,
        usedCraftingTable: recipe.requiresTable,
        recipe: recipe.result.name || originalItemName,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('合成执行失败:', err);
      return this.createErrorResult(`合成执行失败: ${err.message}`, CRAFT_ERRORS.CRAFT_FAILED, err);
    }
  }

  /**
   * 标准化物品名称
   * @param name 物品名称
   * @returns 标准化后的名称
   */
  private normalizeItemName(name: string): string {
    return normalizeItemName(name);
  }

  /**
   * 根据物品ID获取物品名称
   * @param itemId 物品ID
   * @returns 物品名称
   */
  private getItemNameById(itemId: number): string {
    const item = this.mcData.items[itemId];
    return item ? item.name : `unknown_item_${itemId}`;
  }

  /**
   * 获取物品数量
   * @param itemId 物品ID
   * @returns 物品数量
   */
  private getItemCount(itemId: number): number {
    const items = this.bot.inventory.items();
    return items.filter(item => item.type === itemId).reduce((total, item) => total + item.count, 0);
  }

  /**
   * 创建成功结果
   * @param message 消息
   * @param data 数据
   * @returns 成功结果
   */
  private createSuccessResult(message: string, data?: any): ActionResult {
    return {
      success: true,
      message,
      data,
    };
  }

  /**
   * 创建错误结果
   * @param message 错误消息
   * @param errorCode 错误代码
   * @param details 详细信息
   * @returns 错误结果
   */
  private createErrorResult(message: string, errorCode: CraftErrorCode = CRAFT_ERRORS.CRAFT_FAILED, details?: any): ActionResult {
    return {
      success: false,
      message,
      error: {
        code: errorCode,
        details,
      },
    };
  }
}
